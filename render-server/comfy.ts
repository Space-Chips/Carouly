/**
 * The ComfyUI backend.
 *
 * Why this exists alongside the Draw Things adapter: the model is a GGUF, and
 * Draw Things cannot load GGUF — it uses its own converted format. The model
 * card says ComfyUI, and ComfyUI has native LTX-2 nodes (`comfy/ldm/lightricks/
 * av_model.py`, the `LTXAV*` loaders) plus GGUF support through city96's
 * ComfyUI-GGUF custom node. So this is the path for LTX-2.3, and Draw Things
 * stays for anything shipped in its own format.
 *
 * The graph itself lives in `workflows/*.json` rather than in this file. A
 * 22B audio-visual workflow is a dozen wired nodes, it changes whenever ComfyUI
 * renames one, and it is the part most likely to need correcting by hand — a
 * file you can open in the ComfyUI editor, fix, and re-export is worth much more
 * than a builder function that is wrong in a way you cannot see.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { config } from "./config.ts";

export class ComfyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComfyError";
  }
}

const api = (path: string) => `${config.comfy.url.replace(/\/$/, "")}${path}`;

/** `{{name}}` anywhere in the workflow, replaced by a real value. */
const fill = (node: unknown, values: Record<string, unknown>): unknown => {
  if (typeof node === "string") {
    const whole = /^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/.exec(node.trim());
    // A lone placeholder keeps its native type, so a number stays a number and
    // ComfyUI does not reject the graph for handing a string to a float input.
    if (whole) return values[whole[1]];

    return node.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, key) =>
      String(values[key] ?? "")
    );
  }

  if (Array.isArray(node)) return node.map((item) => fill(item, values));

  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([key, item]) => [
        key,
        fill(item, values),
      ])
    );
  }

  return node;
};

const cache = new Map<string, unknown>();

export const loadWorkflow = async (name: string, values: Record<string, unknown>) => {
  if (!cache.has(name)) {
    const path = join(import.meta.dirname, "workflows", `${name}.json`);
    try {
      cache.set(name, JSON.parse(await readFile(path, "utf8")));
    } catch (error) {
      throw new ComfyError(
        `could not read workflows/${name}.json — ${
          error instanceof Error ? error.message : error
        }`
      );
    }
  }

  const filled = fill(cache.get(name), values) as Record<string, unknown>;

  // ComfyUI treats every top-level key as a node, so the `_comment` block would
  // be validated as one and blow up on the first attribute it does not have.
  // Stripping here rather than deleting the comments keeps the explanation of
  // what the graph does next to the graph, which is where it is useful.
  return Object.fromEntries(
    Object.entries(filled).filter(([key]) => !key.startsWith("_"))
  );
};

/** What the app has loaded and what nodes exist. The first thing to check. */
export const probe = async () => {
  const out: Record<string, unknown> = { url: config.comfy.url };

  try {
    const stats = await fetch(api("/system_stats"), { signal: AbortSignal.timeout(5000) });
    out.system_stats = stats.ok ? await stats.json() : `HTTP ${stats.status}`;
  } catch (error) {
    out.system_stats = `unreachable: ${error instanceof Error ? error.message : error}`;
    return out;
  }

  try {
    const info = await fetch(api("/object_info"), { signal: AbortSignal.timeout(20_000) });

    if (info.ok) {
      const nodes = Object.keys((await info.json()) as Record<string, unknown>);
      // Only the handful that decide whether this can work at all. The full list
      // is hundreds of entries and useless in a health check.
      const wanted = [
        "UnetLoaderGGUF",
        "LTXAVTextEncoderLoader",
        "LTXVAudioVAELoader",
        "EmptyLTXVLatentVideo",
        "LTXVImgToVideo",
        "LTXVConditioning",
        "LTXVScheduler",
      ];

      out.nodes = Object.fromEntries(wanted.map((name) => [name, nodes.includes(name)]));
      out.node_count = nodes.length;
    } else {
      out.nodes = `HTTP ${info.status}`;
    }
  } catch (error) {
    out.nodes = `unreachable: ${error instanceof Error ? error.message : error}`;
  }

  return out;
};

type HistoryEntry = {
  status?: { completed?: boolean; status_str?: string; messages?: unknown[] };
  outputs?: Record<string, Record<string, { filename: string; subfolder: string; type: string }[]>>;
};

/**
 * Queue a graph and wait for it.
 *
 * Polling rather than the websocket: the only thing this needs to know is
 * "finished or not", a render is minutes long so a two-second poll costs
 * nothing, and one less persistent connection is one less thing to reconnect.
 */
export const runWorkflow = async (graph: Record<string, unknown>) => {
  let queued: Response;

  try {
    queued = await fetch(api("/prompt"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: graph, client_id: "carouly-render" }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new ComfyError(
      `Could not reach ComfyUI at ${config.comfy.url}. Start it with ` +
        `\`cd ~/ComfyUI && ./.venv/bin/python main.py\`. (${
          error instanceof Error ? error.message : error
        })`
    );
  }

  if (!queued.ok) {
    // ComfyUI validates the whole graph up front and says exactly which node and
    // which input it did not like, so this text is worth showing in full.
    throw new ComfyError(
      `ComfyUI rejected the workflow: ${(await queued.text()).slice(0, 1200)}`
    );
  }

  const { prompt_id: promptId } = (await queued.json()) as { prompt_id: string };
  const deadline = Date.now() + config.comfy.timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((done) => setTimeout(done, 2000));

    const history = await fetch(api(`/history/${promptId}`), {
      signal: AbortSignal.timeout(15_000),
    });
    if (!history.ok) continue;

    const entry = ((await history.json()) as Record<string, HistoryEntry>)[promptId];
    if (!entry) continue;

    const state = entry.status?.status_str;
    if (state === "error") {
      throw new ComfyError(
        `the graph failed while running: ${JSON.stringify(entry.status?.messages ?? []).slice(0, 900)}`
      );
    }

    if (entry.status?.completed) {
      const files = Object.values(entry.outputs ?? {}).flatMap((output) => [
        ...(output.images ?? []),
        ...(output.gifs ?? []),
        ...(output.video ?? []),
      ]);

      if (!files.length) {
        throw new ComfyError(
          "the graph finished but produced no files — its output node is probably " +
            "a preview rather than a save node"
        );
      }

      return files;
    }
  }

  throw new ComfyError(
    `ComfyUI did not finish within ${Math.round(config.comfy.timeoutMs / 60_000)} minutes`
  );
};

export const fetchOutput = async (file: {
  filename: string;
  subfolder: string;
  type: string;
}) => {
  const query = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder ?? "",
    type: file.type ?? "output",
  });

  const response = await fetch(api(`/view?${query}`), {
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    throw new ComfyError(`could not download ${file.filename} (${response.status})`);
  }

  return Buffer.from(await response.arrayBuffer());
};

/** Push a local image into ComfyUI's input folder so a graph can reference it. */
export const uploadImage = async (bytes: Buffer, name: string) => {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(bytes)], { type: "image/png" }), name);
  form.append("overwrite", "true");

  const response = await fetch(api("/upload/image"), {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    throw new ComfyError(`could not upload the first frame (${response.status})`);
  }

  return ((await response.json()) as { name: string }).name;
};
