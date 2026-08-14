/**
 * The workflow graph engine.
 *
 * A template IS a workflow: a JSON DAG of nodes. Nodes reference each other with
 * `{{node_id.field}}` placeholders; the engine derives the edges from those
 * references, topologically sorts, and executes. Nothing here knows what a brand
 * or a video is — it only knows how to resolve references and run things in
 * order, which is what lets the node-graph editor sit on top of it later.
 *
 * Ported from prototype/workflow/graph.py. Three deliberate differences, all
 * forced by running inside a request rather than a shell:
 *
 *   - node implementations are async, because every interesting one is a network
 *     call and a serverless function cannot block a thread on it;
 *   - the cache is a `NodeStore` interface rather than a run.json on disk, so the
 *     same engine can be backed by memory in dev and by a table in production;
 *   - execution emits events as it goes, because the point of this rebuild is
 *     that the user watches the graph run instead of waiting on a spinner.
 */

import type { RunEvent } from "@/lib/agent/events";

/** `{{node.path[0].field}}` — the whole reference language. */
const REF = /\{\{\s*([a-zA-Z0-9_]+)((?:\.[a-zA-Z0-9_[\]]+)*)\s*\}\}/g;

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type Scope = Record<string, unknown>;

export type NodeSpec = {
  id: string;
  type: string;
  /** Everything that is not a reserved key becomes a parameter. */
  params: Record<string, unknown>;
  /** e.g. `{{casting.shots}}` — fans this node out over a list. */
  foreach?: string;
  /** The name the loop item takes inside `params`. */
  as: string;
  cache: boolean;
  /**
   * What this node *is* to the template, as opposed to what it does.
   *
   * Only one role exists so far and it is the important one: `identity` marks
   * the node holding the face every other frame is derived from. A caller who
   * wants to reuse a person pins that node (see `pins` in {@link ExecuteOptions})
   * without needing to know the template — which is the difference between
   * "reuse works on the two shipped UGC templates because their node is called
   * `master`" and "reuse works on any graph that declares one", including the
   * ones a model writes at runtime.
   */
  role?: string;
};

export type WorkflowInput = { description: string; required?: boolean };

export type Workflow = {
  id: string;
  name: string;
  description: string;
  aspect: string;
  durationRange: [number, number];
  inputs: Record<string, WorkflowInput>;
  /** Literal tags, scored against the brand's match profile in lib/stages/match.ts. */
  match: Record<string, string[]>;
  nodes: NodeSpec[];
  output: string;
};

export type NodeCtx = {
  node: NodeSpec;
  /** Already fully resolved — implementations never see a `{{ref}}`. */
  params: Record<string, unknown>;
  scope: Scope;
  brand: Record<string, unknown>;
  /** Where generated media is addressed from. */
  runId: string;
  emit: (event: RunEvent) => void;
};

export type NodeImpl = (ctx: NodeCtx) => Promise<unknown>;

export class GraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphError";
  }
}

/* ------------------------------------------------------------------ types --- */

export const NODE_TYPES = new Map<string, NodeImpl>();

/** Registers a node implementation. The registry is the extension point. */
export const nodeType = (name: string, impl: NodeImpl) => {
  NODE_TYPES.set(name, impl);
};

/* --------------------------------------------------- reference resolution --- */

/** Walk `a.b[0].c` into nested objects and arrays. */
const dig = (obj: unknown, path: string): unknown => {
  let current = obj;

  for (const part of path.split(".").filter(Boolean)) {
    const match = /^(\w+)((?:\[\d+\])*)$/.exec(part);
    if (!match) return undefined;

    const [, key, indices] = match;

    current =
      current && typeof current === "object"
        ? (current as Record<string, unknown>)[key]
        : undefined;

    for (const index of indices.match(/\d+/g) ?? []) {
      current = Array.isArray(current) ? current[Number(index)] : undefined;
    }

    if (current === undefined || current === null) return current;
  }

  return current;
};

/**
 * Substitute `{{refs}}` throughout any nested structure.
 *
 * A string that is *exactly* one reference keeps the referent's native type, so
 * `"{{casting.shots}}"` hands `foreach` a real array rather than the string
 * "[object Object],[object Object]". References embedded in longer strings are
 * stringified, which is what prompt templates want.
 */
export const resolve = <T>(value: T, scope: Scope): unknown => {
  if (typeof value === "string") {
    const whole = new RegExp(`^${REF.source}$`).exec(value.trim());

    if (whole) {
      const base = scope[whole[1]];
      const path = whole[2].replace(/^\./, "");
      return path ? dig(base, path) : base;
    }

    return value.replace(new RegExp(REF.source, "g"), (_full, root, rawPath) => {
      const base = scope[root as string];
      const path = String(rawPath ?? "").replace(/^\./, "");
      const out = path ? dig(base, path) : base;

      if (out === undefined || out === null) return "";
      return typeof out === "string" ? out : JSON.stringify(out);
    });
  }

  if (Array.isArray(value)) return value.map((item) => resolve(item, scope));

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        resolve(item, scope),
      ])
    );
  }

  return value;
};

/** Every root id referenced anywhere inside a structure. This is the edge set. */
export const refsIn = (value: unknown): Set<string> => {
  const found = new Set<string>();

  const walk = (node: unknown) => {
    if (typeof node === "string") {
      for (const match of node.matchAll(new RegExp(REF.source, "g"))) {
        found.add(match[1]);
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      Object.values(node as Record<string, unknown>).forEach(walk);
    }
  };

  walk(value);
  return found;
};

/* ------------------------------------------------------------- the model --- */

// `role` is reserved, so it never reaches `params` — which also means adding a
// role to an existing node does not change its content hash, and so does not
// quietly invalidate every cached frame in the store.
const RESERVED = new Set(["id", "type", "foreach", "as", "cache", "role"]);

export const parseNode = (raw: Record<string, unknown>): NodeSpec => ({
  id: String(raw.id),
  type: String(raw.type),
  params: Object.fromEntries(
    Object.entries(raw).filter(([key]) => !RESERVED.has(key))
  ),
  foreach: typeof raw.foreach === "string" ? raw.foreach : undefined,
  as: typeof raw.as === "string" ? raw.as : "item",
  cache: raw.cache !== false,
  role: typeof raw.role === "string" ? raw.role : undefined,
});

/** The id of the node playing `role`, if the graph declares one. */
export const nodeWithRole = (workflow: Workflow, role: string) =>
  workflow.nodes.find((node) => node.role === role)?.id;

/**
 * A preset JSON file into a Workflow.
 *
 * The casts are the boundary between hand-written JSON and typed code: the file
 * is authored by a human (soon by a graph editor), so it is validated by being
 * run, not by the type system pretending it already knows the shape.
 */
export const parseWorkflow = (
  raw: Record<string, unknown>,
  id: string
): Workflow => ({
  id: (raw.id as string) ?? id,
  name: (raw.name as string) ?? (raw.id as string) ?? id,
  description: (raw.description as string) ?? "",
  aspect: (raw.aspect as string) ?? "9:16",
  durationRange: (raw.duration_range as [number, number]) ?? [8, 24],
  inputs: (raw.inputs as Record<string, WorkflowInput>) ?? {},
  match: (raw.match as Record<string, string[]>) ?? {},
  nodes: ((raw.nodes as Record<string, unknown>[]) ?? []).map(parseNode),
  output: (raw.output as string) ?? "",
});

/**
 * Topological sort. Edges come from `{{refs}}`, never from hand-written wiring —
 * so a template author cannot declare a dependency that does not exist, or
 * forget one that does.
 *
 * Ties are broken by declaration order, which keeps the rendered graph stable
 * between runs: a node that jumps rows on every render is unreadable.
 */
export const order = (workflow: Workflow): NodeSpec[] => {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));

  if (byId.size !== workflow.nodes.length) {
    throw new GraphError("duplicate node ids");
  }

  const deps = new Map(
    workflow.nodes.map((node) => {
      const referenced = refsIn(node.params);
      if (node.foreach) {
        for (const ref of refsIn(node.foreach)) referenced.add(ref);
      }
      return [
        node.id,
        new Set([...referenced].filter((id) => byId.has(id) && id !== node.id)),
      ] as const;
    })
  );

  const ordered: NodeSpec[] = [];
  const done = new Set<string>();

  while (ordered.length < workflow.nodes.length) {
    const ready = workflow.nodes.filter(
      (node) =>
        !done.has(node.id) &&
        [...(deps.get(node.id) ?? [])].every((dep) => done.has(dep))
    );

    if (ready.length === 0) {
      const stuck = workflow.nodes
        .filter((node) => !done.has(node.id))
        .map((node) => node.id);
      throw new GraphError(`cycle or missing dependency among: ${stuck.join(", ")}`);
    }

    for (const node of ready) {
      ordered.push(node);
      done.add(node.id);
    }
  }

  return ordered;
};

/** The shape the UI draws. Derived, so the picture cannot disagree with the run. */
export const describeGraph = (workflow: Workflow) => {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));

  return order(workflow).map((node) => {
    const referenced = refsIn(node.params);
    if (node.foreach) {
      for (const ref of refsIn(node.foreach)) referenced.add(ref);
    }

    return {
      id: node.id,
      type: node.type,
      deps: [...referenced].filter((id) => byId.has(id) && id !== node.id),
      foreach: Boolean(node.foreach),
    };
  });
};

/**
 * Is this graph runnable?
 *
 * Everything a model can get wrong when it writes a DAG, checked before a single
 * node executes. That ordering matters: the first two nodes of a video template
 * are a model call and an image generation, so "discover the seventh node has a
 * typo" is a discovery worth paying for up front rather than three minutes and
 * two API calls in.
 *
 * Returns readable problems rather than throwing, because the caller hands them
 * straight back to the model to repair.
 */
export const validateWorkflow = (workflow: Workflow): string[] => {
  const problems: string[] = [];
  const ids = new Set(workflow.nodes.map((node) => node.id));

  if (!workflow.nodes.length) problems.push("the graph has no nodes");

  for (const node of workflow.nodes) {
    if (!NODE_TYPES.has(node.type)) {
      problems.push(
        `node '${node.id}': '${node.type}' is not a node type. Use one of: ${[
          ...NODE_TYPES.keys(),
        ]
          .sort()
          .join(", ")}`
      );
    }

    // A reference to something that does not exist is the single most common
    // failure, and it is silent at runtime — `resolve` turns it into an empty
    // string and the node runs on a prompt with a hole in it.
    const referenced = refsIn(node.params);
    if (node.foreach) for (const ref of refsIn(node.foreach)) referenced.add(ref);

    for (const ref of referenced) {
      if (ref === "inputs" || ref === "brand" || ref === "index") continue;
      if (ref === node.as) continue;
      if (!ids.has(ref)) {
        problems.push(
          `node '${node.id}': refers to '{{${ref}}}', which is not a node in this graph`
        );
      }
    }
  }

  // Cycles and unreachable dependencies. `order` is the same call the engine
  // makes, so anything it accepts here will execute.
  try {
    order(workflow);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }

  if (!workflow.output) {
    problems.push("no `output` — say which node's result is the finished video");
  } else {
    for (const ref of refsIn(workflow.output)) {
      if (!ids.has(ref)) {
        problems.push(`output refers to '{{${ref}}}', which is not a node`);
      }
    }
  }

  return problems;
};

export const validateInputs = (
  workflow: Workflow,
  values: Record<string, unknown>
): string[] =>
  Object.entries(workflow.inputs)
    .filter(([key, spec]) => spec.required !== false && !(key in values))
    .map(([key, spec]) => `missing required input '${key}': ${spec.description}`);

/* ------------------------------------------------------------- execution --- */

/**
 * Where node outputs are remembered between runs.
 *
 * Caching is what makes iterating on a template affordable: rerunning a graph
 * after changing one prompt should re-bill one node, not fourteen.
 */
export type NodeStore = {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
};

export const memoryStore = (seed?: Map<string, unknown>): NodeStore => {
  const map = seed ?? new Map<string, unknown>();
  return {
    async get(key) {
      return map.get(key);
    },
    async set(key, value) {
      map.set(key, value);
    },
  };
};

/** Content hash of type + resolved params. Same inputs, same key, no second bill. */
const hashNode = async (node: NodeSpec, params: Record<string, unknown>) => {
  const blob = JSON.stringify({ t: node.type, p: params });
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(blob)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
};

/** Did this cached value come from a stubbed generation call? */
const hasDryRun = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasDryRun);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.dry_run === true) return true;
    return Object.values(record).some(hasDryRun);
  }
  return false;
};

export type ExecuteOptions = {
  workflow: Workflow;
  inputs: Record<string, unknown>;
  brand: Record<string, unknown>;
  runId: string;
  store?: NodeStore;
  emit?: (event: RunEvent) => void;
  /** Ignore the cache and rebind everything. */
  fresh?: boolean;
  /** True when no FAL_KEY is present, so cached stubs may still be served. */
  stubbed?: boolean;
  /**
   * Values supplied for nodes rather than computed by them, keyed by node id.
   *
   * A pinned node does not run: its value goes into scope and everything
   * downstream resolves against it. This is how an asset gets *reused* rather
   * than recreated — pin the identity node to a saved actor's master frame and
   * every per-beat edit is an edit of that actual face, which is the same
   * mechanism that holds a face across beats, extended across sessions.
   *
   * Distinct from the cache, and deliberately not implemented through it: the
   * cache is keyed by a content hash of resolved params, so it can only answer
   * "these exact inputs produced this before". A pin answers "never mind the
   * inputs, this is the value", which is a claim only the caller can make.
   */
  pins?: Record<string, unknown>;
};

export const execute = async ({
  workflow,
  inputs,
  brand,
  runId,
  store = memoryStore(),
  emit = () => {},
  fresh = false,
  /**
   * Defaults to `false` — "assume the output is real" — because the two mistakes
   * are not the same size.
   *
   * Getting it wrong this way costs a cache miss: a dry run re-stubs a node it had
   * already stubbed, which is free and correct. Getting it wrong the other way
   * serves a `dry-run.local` placeholder into a real render, and that URL is then
   * handed to the next node as its first frame, so the graph fails on DNS several
   * minutes in — or worse, succeeds into something a customer sees.
   *
   * Both current callers pass it explicitly, so this changes nothing today. It is
   * here so that the caller who forgets loses a cache hit rather than shipping
   * placeholders.
   */
  stubbed = false,
  pins = {},
}: ExecuteOptions) => {
  const problems = validateInputs(workflow, inputs);
  if (problems.length) throw new GraphError(problems.join("; "));

  const scope: Scope = { inputs, brand };
  const sequence = order(workflow);

  emit({ t: "graph", template: workflow.id, nodes: describeGraph(workflow) });

  const runOne = async (
    node: NodeSpec,
    localScope: Scope,
    index?: number
  ): Promise<unknown> => {
    const params = resolve(node.params, localScope) as Record<string, unknown>;
    const key = await hashNode(node, params);
    const started = Date.now();

    emit({ t: "node.start", node: node.id, type: node.type, index });

    if (node.cache && !fresh) {
      const cached = await store.get(key);

      // A stub cached while FAL_KEY was absent must never be served once a real
      // key appears, or adding the key would replay `dry-run.local` placeholders
      // and look like a successful render.
      if (cached !== undefined && !(hasDryRun(cached) && !stubbed)) {
        emit({
          t: "node.ok",
          node: node.id,
          type: node.type,
          index,
          ms: 0,
          cached: true,
        });
        return cached;
      }
    }

    const impl = NODE_TYPES.get(node.type);
    if (!impl) {
      throw new GraphError(
        `node '${node.id}': unknown type '${node.type}'. Known: ${[...NODE_TYPES.keys()]
          .sort()
          .join(", ")}`
      );
    }

    try {
      const out = await impl({
        node,
        params,
        scope: localScope,
        brand,
        runId,
        emit,
      });

      if (node.cache) await store.set(key, out);

      emit({
        t: "node.ok",
        node: node.id,
        type: node.type,
        index,
        ms: Date.now() - started,
        cached: false,
      });

      return out;
    } catch (error) {
      emit({
        t: "node.fail",
        node: node.id,
        type: node.type,
        index,
        ms: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  for (const node of sequence) {
    // A pinned node is answered, not run — before the foreach branch, because
    // pinning replaces the node's whole value whatever shape it has. It is still
    // announced as a step so the diagram does not appear to skip a row: the run
    // did account for this node, it just did not have to make it.
    if (pins[node.id] !== undefined) {
      emit({ t: "node.start", node: node.id, type: node.type });
      scope[node.id] = pins[node.id];
      emit({
        t: "node.ok",
        node: node.id,
        type: node.type,
        ms: 0,
        cached: false,
        pinned: true,
      });
      continue;
    }

    if (node.foreach) {
      const items = resolve(node.foreach, scope);

      if (!Array.isArray(items)) {
        throw new GraphError(
          `node '${node.id}': foreach did not resolve to a list`
        );
      }

      // Sequential on purpose for now. The topological sort already knows which
      // nodes are independent, so fanning a level out in parallel is the biggest
      // latency win left — but it multiplies peak spend, so it waits until there
      // is a cost estimate in front of it.
      const out: unknown[] = [];
      for (const [index, item] of items.entries()) {
        out.push(
          await runOne(node, { ...scope, [node.as]: item, index }, index)
        );
      }
      scope[node.id] = out;
    } else {
      scope[node.id] = await runOne(node, scope);
    }
  }

  return {
    scope,
    result: workflow.output ? resolve(workflow.output, scope) : scope,
  };
};
