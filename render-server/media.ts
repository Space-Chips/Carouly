/**
 * ffmpeg work.
 *
 * This is the half of the pipeline that could not exist on the serverless side.
 * `video.concat` and `video.captions` had to hand assembly to a remote compose
 * endpoint there, because a lambda has no ffmpeg — here there is one, so the cut
 * is assembled locally with each clip's own audio kept, which is what the
 * production path is supposed to do and has never been able to prove.
 *
 * The captions are composited as images rather than drawn with `drawtext`. That
 * is not a preference: this machine's ffmpeg is built without freetype, libass
 * or fontconfig, so `drawtext` and `subtitles` do not exist in it. `overlay`
 * needs no optional libraries and is always there.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { config } from "./config.ts";
import { captionPng } from "./captions.ts";

export const run = (bin: string, args: string[]) =>
  new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(bin, args);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on("error", () => resolve({ code: 1, stdout, stderr: `${bin} not found` }));
  });

const ffmpeg = (args: string[]) => run("ffmpeg", ["-y", "-loglevel", "error", ...args]);

export const probeDuration = async (file: string) => {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1",
    file,
  ]);

  const seconds = Number(stdout.trim());
  return Number.isFinite(seconds) ? seconds : 0;
};

export const hasAudioStream = async (file: string) => {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "a",
    "-show_entries", "stream=index",
    "-of", "csv=p=0",
    file,
  ]);

  return Boolean(stdout.trim());
};

export const probeSize = async (file: string) => {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=p=0:s=x",
    file,
  ]);

  const [width, height] = stdout.trim().split("x").map(Number);
  return { width: width || 0, height: height || 0 };
};

/** A sequence of PNG frames into a playable mp4. */
export const framesToVideo = async (
  frames: Buffer[],
  out: string,
  fps = config.draft.fps
) => {
  const dir = await mkdtemp(join(tmpdir(), "carouly-frames-"));

  try {
    await Promise.all(
      frames.map((frame, index) =>
        writeFile(join(dir, `${String(index).padStart(5, "0")}.png`), frame)
      )
    );

    const { code, stderr } = await ffmpeg([
      "-framerate", String(fps),
      "-i", join(dir, "%05d.png"),
      // yuv420p and even dimensions, or the file plays everywhere except the
      // one place you want to show it.
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "26",
      out,
    ]);

    if (code !== 0) throw new Error(`ffmpeg could not encode the frames: ${stderr.slice(0, 300)}`);

    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/**
 * Join clips in order, keeping each one's own audio.
 *
 * The concat filter demands that every input expose the same streams, so any
 * clip that came from a silent model gets a silence track synthesised at its own
 * length. One shared silence sized to the whole timeline would stretch that
 * segment and inflate the runtime — which is exactly the sort of bug that only
 * shows up when you watch the finished cut.
 */
export const concat = async (files: string[], out: string) => {
  if (!files.length) throw new Error("nothing to concatenate");

  if (files.length === 1) {
    const { code } = await ffmpeg(["-i", files[0], "-c", "copy", out]);
    if (code !== 0) throw new Error("ffmpeg could not copy the single clip");
    return { out, seconds: await probeDuration(files[0]) };
  }

  const audio = await Promise.all(files.map(hasAudioStream));
  const durations = await Promise.all(files.map(probeDuration));

  const inputs: string[] = [];
  for (const file of files) inputs.push("-i", file);

  const silenceInput = new Map<number, number>();
  for (const [index, present] of audio.entries()) {
    if (present) continue;
    silenceInput.set(index, files.length + silenceInput.size);
    inputs.push(
      "-f", "lavfi",
      "-t", (durations[index] || 1).toFixed(3),
      "-i", "anullsrc=r=48000:cl=stereo"
    );
  }

  const parts = audio
    .map((present, index) =>
      `[${index}:v][${present ? `${index}:a` : `${silenceInput.get(index)}:a`}]`
    )
    .join("");

  const { code, stderr } = await ffmpeg([
    ...inputs,
    "-filter_complex", `${parts}concat=n=${files.length}:v=1:a=1[v][a]`,
    "-map", "[v]",
    "-map", "[a]",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "26",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    out,
  ]);

  if (code !== 0) throw new Error(`ffmpeg concat failed: ${stderr.slice(0, 400)}`);

  return { out, seconds: durations.reduce((total, one) => total + one, 0) };
};

/** Composite one caption image per span onto the cut. */
export const burnCaptions = async (
  video: string,
  lines: string[],
  spans: [number, number][],
  out: string
) => {
  const { width, height } = await probeSize(video);
  if (!width) throw new Error("could not read the video's size");

  const dir = await mkdtemp(join(tmpdir(), "carouly-caps-"));

  try {
    const inputs = ["-i", video];
    const filters: string[] = [];
    let label = "0:v";

    for (const [index, line] of lines.entries()) {
      const file = join(dir, `cap${index}.png`);
      await writeFile(file, await captionPng(line, width));
      inputs.push("-i", file);

      const next = `v${index}`;
      const [start, end] = spans[index];

      filters.push(
        `[${label}][${index + 1}:v]overlay=x=(W-w)/2:y=H-h-${Math.round(height * 0.12)}:` +
          `enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'[${next}]`
      );
      label = next;
    }

    const { code, stderr } = await ffmpeg([
      ...inputs,
      "-filter_complex", filters.join(";"),
      "-map", `[${label}]`,
      "-map", "0:a?",
      "-c:a", "copy",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "26",
      "-pix_fmt", "yuv420p",
      out,
    ]);

    if (code !== 0) throw new Error(`caption burn failed: ${stderr.slice(0, 400)}`);

    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

export const listOutputs = async (dir: string) => {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
};
