/**
 * The local render server.
 *
 * One job: make a 480p draft of a shot on this machine, for nothing, in the time
 * it takes to make a coffee rather than the time it takes to spend credits. The
 * app talks to it with the same shape it talks to fal with, so switching between
 * them is an env var and nothing in the graph or the templates changes.
 *
 * What a draft is for: framing, whether the actor's face survives from beat to
 * beat, whether the pacing works. What it is not for: dialogue. LTX at draft
 * settings is silent, and the production pipeline's rule that video models must
 * speak for themselves still holds — it is simply suspended while you are
 * looking at pictures. Everything this server returns is stamped `draft: true`
 * so nothing downstream can mistake one for a deliverable.
 *
 *   npm run render
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join } from "node:path";

import { buildSrt } from "./captions.ts";
import { config, publicUrl } from "./config.ts";
import { makeImage, makeVideo, probe as probeBackend } from "./backend.ts";
import * as dt from "./drawthings.ts";
import {
  burnCaptions,
  burnTextOverlays,
  concat,
  hasAudioStream,
  probeDuration,
  run,
} from "./media.ts";

const digest = (value: unknown) =>
  createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 16);

const outPath = (name: string) => join(config.outDir, name);

const exists = async (path: string) => {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
};

/**
 * Resolve an image reference to bytes.
 *
 * Nodes hand each other URLs, and most of those URLs point back at this server —
 * reading those off disk rather than fetching our own HTTP is both faster and
 * one less thing to be running.
 */
const fetchImage = async (reference: string): Promise<Buffer> => {
  const local = reference.match(/\/files\/([^/?#]+)$/);

  if (local && (await exists(outPath(local[1])))) {
    return readFile(outPath(local[1]));
  }

  if (reference.startsWith("data:")) {
    return Buffer.from(reference.split(",")[1] ?? "", "base64");
  }

  const response = await fetch(reference, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`could not fetch ${reference} (${response.status})`);

  return Buffer.from(await response.arrayBuffer());
};

/* --------------------------------------------------------------- handlers --- */

type Handler = (body: Record<string, any>) => Promise<unknown>;

const handlers: Record<string, Handler> = {
  /**
   * Text to a still — first frames, end cards.
   *
   * Z-Image Turbo on the comfy backend, Draw Things on the other. LTX itself has
   * no text-to-image path, so the master frame needs its own model — and it is
   * the still worth spending on, since every beat frame is an edit of it.
   */
  async "/image"(body) {
    const name = `${digest(["image", body])}.png`;

    if (!(await exists(outPath(name)))) {
      await makeImage({
        prompt: String(body.prompt ?? ""),
        negativePrompt: body.negative_prompt,
        seed: body.seed,
        out: outPath(name),
      });
    }

    return { url: publicUrl(name), file: name, draft: true };
  },

  /**
   * Edit a still while holding identity.
   *
   * This is the node the whole talking-head format depends on: three independent
   * generations produce three different people, so every beat's frame has to be
   * an edit of one master frame.
   */
  async "/edit"(body) {
    // Z-Image Turbo is text-to-image, not an editor, and the per-beat frames are
    // edits that must hold the master frame's face. That is a different model
    // (Z-Image-Edit, Nano Banana) — so on comfy these still go to fal.
    if (config.backend !== "drawthings") {
      throw new Error(
        "no local editor is installed — the per-beat frames stay on fal. " +
          "Z-Image Turbo makes the master frame only."
      );
    }

    const name = `${digest(["edit", body])}.png`;

    if (!(await exists(outPath(name)))) {
      const png = await dt.imageToImage({
        prompt: String(body.prompt ?? ""),
        image: await fetchImage(String(body.image_url)),
        negativePrompt: body.negative_prompt,
        model: body.model,
        strength: body.strength,
        seed: body.seed,
      });
      await writeFile(outPath(name), png);
    }

    return { url: publicUrl(name), file: name, draft: true };
  },

  /** A shot. Image-to-video whenever a first frame is given. */
  async "/video"(body) {
    const name = `${digest(["video", body])}.mp4`;
    const path = outPath(name);

    if (!(await exists(path))) {
      await makeVideo({
        prompt: String(body.prompt ?? ""),
        negativePrompt: body.negative_prompt,
        firstFrame: body.image_url ? await fetchImage(String(body.image_url)) : undefined,
        seconds: Number(body.duration ?? 5),
        seed: body.seed,
        out: path,
      });
    }

    return {
      url: publicUrl(name),
      file: name,
      seconds: await probeDuration(path),
      // Probed, not assumed. This used to be a hardcoded `false`, which was true
      // of the graph at the time and then stayed true in the code long after the
      // graph learned to decode the audio half. Asking the file costs one
      // ffprobe and cannot drift.
      has_audio: await hasAudioStream(path),
      draft: true,
    };
  },

  /** Join the shots, keeping whatever audio each one has. */
  async "/concat"(body) {
    const clips: { url?: string }[] = body.clips ?? [];
    const files: string[] = [];

    for (const clip of clips) {
      const url = typeof clip === "string" ? clip : clip?.url;
      if (!url) continue;

      const local = url.match(/\/files\/([^/?#]+)$/);
      if (local && (await exists(outPath(local[1])))) {
        files.push(outPath(local[1]));
        continue;
      }

      // A clip rendered elsewhere still has to be on disk to be concatenated.
      const staged = outPath(`${digest(url)}${extname(url) || ".mp4"}`);
      if (!(await exists(staged))) await writeFile(staged, await fetchImage(url));
      files.push(staged);
    }

    if (!files.length) throw new Error("no clips to join");

    const name = `${digest(["concat", files])}.mp4`;
    const path = outPath(name);

    if (!(await exists(path))) await concat(files, path);

    return {
      url: publicUrl(name),
      file: name,
      seconds: await probeDuration(path),
      clips: files.length,
      draft: true,
    };
  },

  /** Time the captions and composite them onto the cut. */
  async "/captions"(body) {
    const source = typeof body.video === "string" ? body.video : body.video?.url;
    if (!source) throw new Error("no video to caption");

    const lines: string[] = (body.lines ?? []).map(String).filter((line: string) => line.trim());
    const local = String(source).match(/\/files\/([^/?#]+)$/);
    const input = local ? outPath(local[1]) : outPath(`${digest(source)}.mp4`);

    if (!local && !(await exists(input))) {
      await writeFile(input, await fetchImage(String(source)));
    }

    const total = await probeDuration(input);
    if (!lines.length) return { url: publicUrl(local?.[1] ?? ""), seconds: total, draft: true };

    // One caption per clip when the counts line up, otherwise split evenly. The
    // per-clip case is the accurate one, and it is also the normal one.
    const perClip: number[] = (body.clip_seconds ?? []).map(Number);
    let spans: [number, number][];

    if (perClip.length === lines.length) {
      let offset = 0;
      spans = perClip.map((seconds) => {
        const span: [number, number] = [offset, offset + seconds];
        offset += seconds;
        return span;
      });
    } else {
      const step = (total || lines.length * 3) / lines.length;
      spans = lines.map((_line, index) => [index * step, (index + 1) * step]);
    }

    const name = `${digest(["captions", input, lines, spans])}.mp4`;
    const path = outPath(name);

    if (!(await exists(path))) await burnCaptions(input, lines, spans, path);

    return {
      url: publicUrl(name),
      file: name,
      seconds: await probeDuration(path),
      captions: lines,
      captions_srt: buildSrt(lines, spans),
      captioned: true,
      draft: true,
    };
  },

  /** Place authored text over the picture independently of dialogue captions. */
  async "/text-overlays"(body) {
    const source = typeof body.video === "string" ? body.video : body.video?.url;
    if (!source) throw new Error("no video to overlay");

    const items = (body.items ?? [])
      .map((item: Record<string, unknown>) => ({
        text: String(item.text ?? "").trim(),
        start: Math.max(0, Number(item.start ?? 0)),
        end: Math.max(0, Number(item.end ?? 0)),
        position: ["top", "center", "bottom"].includes(String(item.position))
          ? String(item.position)
          : "bottom",
      }))
      .filter((item: { text: string; start: number; end: number }) => item.text && item.end > item.start);

    const local = String(source).match(/\/files\/([^/?#]+)$/);
    const input = local ? outPath(local[1]) : outPath(`${digest(source)}.mp4`);

    if (!local && !(await exists(input))) {
      await writeFile(input, await fetchImage(String(source)));
    }

    const total = await probeDuration(input);
    if (!items.length) return { url: publicUrl(local?.[1] ?? ""), seconds: total, draft: true };

    const name = `${digest(["text-overlays", input, items])}.mp4`;
    const path = outPath(name);
    if (!(await exists(path))) await burnTextOverlays(input, items, path);

    return {
      url: publicUrl(name),
      file: name,
      seconds: await probeDuration(path),
      text_overlays: items,
      draft: true,
    };
  },
};

/* ----------------------------------------------------------------- server --- */

const health = async () => {
  const { code, stdout } = await run("ffmpeg", ["-version"]);

  return {
    ok: true,
    listening: `http://${config.host}:${config.port}`,
    out: config.outDir,
    draft: config.draft,
    ffmpeg:
      code === 0
        ? { present: true, version: stdout.split("\n")[0] }
        : { present: false, hint: "brew install ffmpeg" },
    backend: config.backend,
    // What the live backend needs by name. Anything reported missing below is
    // either not downloaded yet or sitting in the wrong models folder.
    expects:
      config.backend === "comfy"
        ? { video: config.comfy, master_frame: config.zImage }
        : { video: config.drawThings.video, image: config.drawThings.image },
    engine: await probeBackend(),
  };
};

const readBody = (request: IncomingMessage) =>
  new Promise<Record<string, any>>((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("body was not JSON"));
      }
    });
    request.on("error", reject);
  });

const send = (response: ServerResponse, status: number, payload: unknown) => {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
};

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${config.host}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    return response.end();
  }

  if (url.pathname === "/health") return send(response, 200, await health());

  if (url.pathname.startsWith("/files/")) {
    // No traversal: only ever a bare name inside the output directory.
    const name = url.pathname.slice("/files/".length).replace(/[^\w.-]/g, "");
    const path = outPath(name);

    if (!(await exists(path))) return send(response, 404, { error: "no such file" });

    response.writeHead(200, {
      "Content-Type": TYPES[extname(name)] ?? "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    return createReadStream(path).pipe(response);
  }

  const handler = handlers[url.pathname];
  if (!handler || request.method !== "POST") {
    return send(response, 404, {
      error: `nothing at ${request.method} ${url.pathname}`,
      routes: ["GET /health", "GET /files/:name", ...Object.keys(handlers).map((p) => `POST ${p}`)],
    });
  }

  const started = Date.now();
  const body = await readBody(request).catch(() => ({}));

  /**
   * Answer the headers now, and hold the line open with whitespace.
   *
   * Node's own `fetch` is undici, and undici gives up on a response whose
   * headers have not arrived within five minutes — a limit an `AbortSignal`
   * does not override and nothing in this process can see. A clip that takes
   * six minutes therefore failed as a bare `fetch failed` on the caller with
   * no line in this log at all, because the request here was still running
   * happily and had simply never been allowed to answer.
   *
   * So the status goes out immediately and a space goes down the socket every
   * fifteen seconds until there is something to say. JSON ignores leading
   * whitespace, so the caller parses the eventual payload unchanged.
   *
   * The cost: the status code is committed before the work is done, so a
   * failure arrives as 200 with an `error` field. `lib/tools/render.ts` checks
   * for that field as well as the status — the two must stay in step.
   */
  response.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });

  const heartbeat = setInterval(() => response.write(" "), 15_000);

  try {
    const result = await handler(body);
    console.log(`  ${url.pathname} ${Date.now() - started}ms`);
    clearInterval(heartbeat);
    response.end(JSON.stringify(result, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ${url.pathname} failed after ${Date.now() - started}ms: ${message}`);
    clearInterval(heartbeat);
    response.end(JSON.stringify({ error: message }, null, 2));
  }
});

/**
 * Node kills a request that takes longer than five minutes. Generation here
 * routinely takes longer than that.
 *
 * `requestTimeout` has defaulted to 300s since Node 18, and it is enforced by
 * the server destroying the socket — so the caller does not get an error from
 * this process, it gets a bare `fetch failed` and a log here with no line in it
 * at all. On a machine under memory pressure a single 480p clip can take
 * fifteen minutes, and every one of them died at five with no explanation on
 * either side.
 *
 * Disabled rather than raised: there is no honest number. A clip takes as long
 * as the model takes, the client already carries its own twenty-minute
 * deadline, and an abandoned request dies with its socket anyway.
 */
server.requestTimeout = 0;
/** Headers must still turn up promptly — that part is a real network fault. */
server.headersTimeout = 60_000;

await mkdir(config.outDir, { recursive: true });

server.listen(config.port, config.host, () => {
  console.log(`carouly render · http://${config.host}:${config.port}`);
  console.log(`  drafts   ${config.draft.width}×${config.draft.height} @ ${config.draft.fps}fps, max ${config.draft.maxSeconds}s`);
  console.log(`  output   ${config.outDir}`);
  console.log(`  backend  ${config.drawThings.url}`);
  console.log(`  check    curl -s localhost:${config.port}/health | jq`);
});
