/**
 * The thread model: run events in, renderable blocks out.
 *
 * Kept as a pure function away from the components because it is the one piece
 * of studio logic with real behaviour in it — a nested step has to find its
 * tool, a node result has to find its graph — and that is much easier to reason
 * about as a reducer than as a pile of setState calls inside a stream reader.
 */

import type {
  ActorCandidate,
  ActorIdentity,
  Artifact,
  GraphNodeShape,
  RunEvent,
  TemplateCandidate,
} from "@/lib/agent/events";
import type { CreditGate } from "@/lib/credits/gates";
import type { BrandKit } from "@/lib/stages/brand";

/**
 * A run started from the library, resolved on the server from `?use=`.
 *
 * Addressable on purpose. The previous version left a note in localStorage for
 * the studio to find on its next boot, which meant reuse could not be linked to,
 * bookmarked, opened in a second tab or shared — and silently raced whatever
 * else wanted to own that boot.
 */
export type StudioSeed = {
  kit?: BrandKit;
  kitId?: string;
  actor?: ActorIdentity;
  label?: string;
};

export type Step = {
  label: string;
  detail: string;
  ms?: number;
  ok?: boolean;
};

export type NodeState = {
  status: "idle" | "running" | "ok" | "failed";
  ms?: number;
  cached?: boolean;
  /**
   * The value was supplied rather than computed — a reused actor's face, say.
   * Kept apart from `cached` because they are different claims: cached means we
   * made this before, pinned means you brought it.
   */
  pinned?: boolean;
  /** A `foreach` node reports once per item under the same id. */
  runs: number;
  error?: string;
  /**
   * When this node last started, so the diagram can count up while it waits.
   *
   * The server sends a duration only when a node is *finished*, which is the
   * one moment the number stops being interesting. A node three minutes into a
   * video generation looks identical to one that started a second ago unless
   * the client keeps its own clock.
   */
  startedAt?: number;
};

export type Block =
  | { kind: "you"; id: string; text: string }
  | { kind: "say"; id: string; text: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      label: string;
      detail?: string;
      status: "running" | "done" | "failed" | "stopped";
      ms?: number;
      summary?: string;
      error?: string;
      steps: Step[];
    }
  | { kind: "artifact"; id: string; artifact: Artifact }
  | {
      kind: "graph";
      id: string;
      template: string;
      nodes: GraphNodeShape[];
      state: Record<string, NodeState>;
    }
  | {
      kind: "choice";
      id: string;
      prompt: string;
      items: TemplateCandidate[];
      /** The rest of the library, ranked but not argued for. */
      library?: TemplateCandidate[];
      chosen?: string;
    }
  /**
   * Who is on camera, once a format has been chosen.
   *
   * `chosen` holds the candidate id, and `cast` the person actually sent — they
   * are not the same thing, because somebody who writes their own casting note
   * has no candidate id at all. Keeping both means the card can show what it
   * sent back, whichever way it was answered.
   */
  | {
      kind: "cast";
      id: string;
      prompt: string;
      template: string;
      items: ActorCandidate[];
      library?: ActorCandidate[];
      custom: boolean;
      chosen?: string;
      cast?: { name: string; look: string; portrait?: string };
    }
  | {
      kind: "ask";
      id: string;
      question: string;
      why?: string;
      placeholder?: string;
      answer?: string;
    }
  | { kind: "stopped"; id: string; done: string[] }
  /**
   * The balance would not cover the next thing. Not an error — a decision.
   *
   * Both numbers are kept on the block rather than looked up when it renders,
   * because this is a record of a moment: somebody who tops up and scrolls back
   * should see what they were short of at the time, not a stale-looking card
   * arguing with the balance now in the meter.
   */
  | { kind: "wall"; id: string; gate: CreditGate; need: number; have: number }
  /**
   * A render running outside this turn, identified by its job.
   *
   * Holds no state of its own — the card polls for that. Only the id has to
   * survive a reload, which is exactly what makes this recoverable: the
   * transcript is persisted, so closing the tab mid-render and coming back finds
   * the job and carries on watching it.
   */
  | { kind: "render"; id: string; jobId: string; template: string; concept: string }
  | { kind: "error"; id: string; error: string; hint?: string };

let counter = 0;
const nextId = () => `b${++counter}-${Math.random().toString(36).slice(2, 7)}`;

export const applyEvent = (blocks: Block[], event: RunEvent): Block[] => {
  switch (event.t) {
    case "say":
      return [...blocks, { kind: "say", id: nextId(), text: event.text }];

    case "tool.start":
      // `ask_user` gets no row of its own. The question card that follows it
      // says everything the row would have, and a "waiting on you · 12ms"
      // line above a question is noise sitting where the answer should go.
      if (event.name === "ask_user") return blocks;

      return [
        ...blocks,
        {
          kind: "tool",
          id: event.id,
          name: event.name,
          label: event.label,
          detail: event.detail,
          status: "running",
          steps: [],
        },
      ];

    case "tool.step":
      return blocks.map((block) =>
        block.id === event.id && block.kind === "tool"
          ? {
              ...block,
              steps: [
                ...block.steps,
                {
                  label: event.label,
                  detail: event.detail,
                  ms: event.ms,
                  ok: event.ok,
                },
              ],
            }
          : block
      );

    case "tool.end":
    case "tool.fail":
      return blocks.map((block) =>
        block.id === event.id && block.kind === "tool"
          ? {
              ...block,
              status: event.t === "tool.end" ? ("done" as const) : ("failed" as const),
              ms: event.ms,
              summary: event.t === "tool.end" ? event.summary : undefined,
              error: event.t === "tool.fail" ? event.error : undefined,
            }
          : block
      );

    case "artifact":
      return [...blocks, { kind: "artifact", id: nextId(), artifact: event.artifact }];

    case "graph":
      return [
        ...blocks,
        {
          kind: "graph",
          id: nextId(),
          template: event.template,
          nodes: event.nodes,
          state: Object.fromEntries(
            event.nodes.map((node) => [node.id, { status: "idle", runs: 0 }])
          ),
        },
      ];

    case "node.start":
    case "node.ok":
    case "node.fail": {
      // The most recent graph is always the one executing.
      const graph = [...blocks]
        .reverse()
        .find((block): block is Extract<Block, { kind: "graph" }> => block.kind === "graph");

      if (!graph) return blocks;

      return blocks.map((block) => {
        if (block.id !== graph.id || block.kind !== "graph") return block;

        const previous = block.state[event.node] ?? { status: "idle", runs: 0 };

        const next: NodeState =
          event.t === "node.start"
            ? { ...previous, status: "running", startedAt: Date.now() }
            : event.t === "node.ok"
              ? {
                  status: "ok",
                  // A fanned-out node reports per item; the durations add up to
                  // what the node actually cost, which is the honest number.
                  ms: (previous.ms ?? 0) + event.ms,
                  cached: event.cached,
                  pinned: event.pinned,
                  runs: previous.runs + 1,
                }
              : { status: "failed", ms: event.ms, runs: previous.runs, error: event.error };

        return { ...block, state: { ...block.state, [event.node]: next } };
      });
    }

    case "choice":
      return [
        ...blocks,
        {
          kind: "choice",
          id: nextId(),
          prompt: event.prompt,
          items: event.items,
          library: event.library,
        },
      ];

    case "cast":
      return [
        ...blocks,
        {
          kind: "cast",
          id: nextId(),
          prompt: event.prompt,
          template: event.template,
          items: event.items,
          library: event.library,
          custom: event.custom,
        },
      ];

    case "ask":
      return [
        ...blocks,
        {
          kind: "ask",
          // Prefixed: `ask` carries the id of the tool call that raised it, and
          // that call already has a block of its own on screen.
          id: `ask-${event.id}`,
          question: event.question,
          why: event.why,
          placeholder: event.placeholder,
        },
      ];

    case "credits.short":
      return [
        ...blocks,
        {
          kind: "wall",
          id: nextId(),
          gate: event.gate,
          need: event.need,
          have: event.have,
        },
      ];

    // Not a block. The balance belongs in the meter, where it is visible the
    // whole time, rather than as a line in the transcript that scrolls away —
    // Studio reads these off the stream directly.
    case "credits":
      return blocks;

    case "render.queued":
      return [
        ...blocks,
        {
          kind: "render",
          id: `job-${event.jobId}`,
          jobId: event.jobId,
          template: event.template,
          concept: event.concept,
        },
      ];

    case "run.error":
      return [
        ...blocks,
        { kind: "error", id: nextId(), error: event.error, hint: event.hint },
      ];

    default:
      return blocks;
  }
};

/**
 * Close off a turn the person stopped.
 *
 * Anything still running becomes `stopped` rather than being left to spin
 * forever — a spinner that never resolves reads as a hang, which is the one
 * thing an interruption must not look like. The marker that follows names what
 * did finish, because that is exactly what the next turn will carry on from.
 */
export const markStopped = (blocks: Block[]): Block[] => {
  const done = blocks
    .filter(
      (block): block is Extract<Block, { kind: "tool" }> =>
        block.kind === "tool" && block.status === "done"
    )
    .map((block) => block.label);

  return [
    ...blocks.map((block) =>
      block.kind === "tool" && block.status === "running"
        ? { ...block, status: "stopped" as const }
        : block
    ),
    { kind: "stopped" as const, id: `stop-${Date.now()}`, done },
  ];
};

/**
 * Close off a turn whose stream simply stopped arriving.
 *
 * Distinct from `markStopped`, because these are different events and must not
 * read the same: stopping is something the person did and can carry on from,
 * whereas this is the run being cut off underneath them — a function killed at
 * the platform's time limit, a dropped connection, a proxy that gave up on a
 * long response.
 *
 * Something has to say so. A tool left at `running` spins forever, and because
 * the transcript is persisted at that moment, reloading shows the same frozen
 * step rather than a run that ended. Nothing in the thread distinguished "still
 * working" from "the other end went away".
 */
export const markCutOff = (
  blocks: Block[],
  error: string,
  hint?: string
): Block[] => [
  ...blocks.map((block) =>
    block.kind === "tool" && block.status === "running"
      ? { ...block, status: "failed" as const, error: "Cut off part-way." }
      : block
  ),
  { kind: "error" as const, id: `cut-${Date.now()}`, error, hint },
];

/** The tools that finished, for the next turn's "you had already done this". */
export const completedTools = (blocks: Block[]) =>
  blocks
    .filter(
      (block): block is Extract<Block, { kind: "tool" }> =>
        block.kind === "tool" && block.status === "done"
    )
    .map((block) => block.name);

/**
 * What the inspector shows: the latest of each artifact, rather than all of them.
 *
 * The thread is time and the inspector is state, so a second palette replaces
 * the first here while both stay visible above.
 */
export const collectState = (blocks: Block[]) => {
  const artifacts = blocks
    .filter((block): block is Extract<Block, { kind: "artifact" }> => block.kind === "artifact")
    .map((block) => block.artifact);

  const latest = <K extends Artifact["kind"]>(kind: K) =>
    [...artifacts]
      .reverse()
      .find((artifact): artifact is Extract<Artifact, { kind: K }> => artifact.kind === kind);

  return {
    palette: latest("palette"),
    assets: latest("assets"),
    brand: latest("brand"),
    concepts: latest("concepts"),
    actor: latest("actor"),
    video: latest("video"),
  };
};

/**
 * Turn a library seed into the blocks a fresh chat should open with.
 *
 * Reusing a kit or an actor starts a run that never called `read_site` or
 * `build_brand_kit`, so the cards those tools normally emit are missing — and
 * without the brand card and the ideas, a reused kit is invisible and its
 * concepts are unrunnable. This synthesises the same cards from the saved data,
 * so a reused kit lands looking exactly like a freshly-built one: the ideas are
 * there, clickable, and the panel fills in.
 */
export const seedBlocks = (seed: StudioSeed): Block[] => {
  const blocks: Block[] = [];
  const { kit, actor, label } = seed;

  blocks.push({
    kind: "say",
    id: nextId(),
    text: kit
      ? `Loaded the ${label ?? kit.brand_name} kit from your library. Pick an idea below to make, or tell me a new one.`
      : `Loaded ${label ?? "an actor"} from your library — they'll be cast in the next video, same face. Paste a site or tell me what to make.`,
  });

  if (kit) {
    blocks.push({
      kind: "artifact",
      id: nextId(),
      artifact: {
        kind: "brand",
        name: kit.brand_name,
        summary: kit.brand_summary,
        voice: kit.voice_tone,
        valueProps: kit.value_props ?? [],
        personas: (kit.target_personas ?? []).map((persona) => ({
          name: persona.name,
          needs: persona.needs,
        })),
        evidence: (kit.products ?? []).flatMap((product) =>
          (product.evidence ?? []).map((entry) => ({
            quote: entry.quote,
            sourceUrl: entry.source_url,
          }))
        ),
        dropped: kit.evidence_check?.dropped ?? 0,
      },
    });

    if (kit.video_concepts?.length) {
      blocks.push({
        kind: "artifact",
        id: nextId(),
        artifact: { kind: "concepts", items: kit.video_concepts },
      });
    }
  }

  if (actor) {
    blocks.push({
      kind: "artifact",
      id: nextId(),
      artifact: { kind: "actor", name: label ?? actor.persona ?? "Actor", ...actor },
    });
  }

  return blocks;
};

export const formatMs = (ms?: number) => {
  if (ms === undefined) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
};
