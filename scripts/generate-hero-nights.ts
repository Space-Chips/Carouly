/**
 * Renders the hook images for the hero's run of nights into public/landing/.
 *
 *   npx tsx scripts/generate-hero-nights.ts
 *
 * The hero shows several consecutive nights of output for one example brand,
 * which only works if each night is visibly a different post. Generating them
 * at request time would be a model call per card on a marketing page, so they
 * are made once, committed, and served as static files — the same bargain as
 * scripts/generate-vibe-previews.ts.
 *
 * Scenes live next to the headlines they sit behind, in lib/hero-run.ts, so a
 * night cannot end up illustrated by the wrong picture.
 *
 * Pass ids to regenerate only those nights:
 *
 *   npx tsx scripts/generate-hero-nights.ts bitter
 */
import { execFileSync } from "child_process";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import path from "path";

const OUT_DIR = path.join(process.cwd(), "public", "landing");

/** Minimal .env.local reader — this runs outside Next, which normally does it. */
const loadEnv = () => {
  let raw: string;

  try {
    raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }

  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (value) process.env[match[1]] ??= value;
  }
};

const main = async () => {
  loadEnv();

  process.env.OPENROUTER_IMAGE_MODEL =
    process.env.HERO_IMAGE_MODEL ?? "x-ai/grok-imagine-image-quality";

  // Imported after the env is set — the client reads the model id at import.
  const { generateImage } = await import("../lib/openrouter");
  const { hookImagePrompt } = await import("../lib/generator");
  const { HERO_RUN } = await import("../lib/hero-run");

  mkdirSync(OUT_DIR, { recursive: true });

  const only = new Set(process.argv.slice(2));

  for (const night of HERO_RUN) {
    if (!night.scene || !night.image) continue;
    if (only.size && !only.has(night.id)) continue;

    process.stdout.write(`${night.id}: generating… `);

    const image = await generateImage(hookImagePrompt(night.scene, "nocturne"));

    if (!image) {
      console.log("no image returned");
      continue;
    }

    const original = path.join(OUT_DIR, `${night.id}.original`);
    const file = path.join(OUT_DIR, `${night.id}.jpg`);

    writeFileSync(original, image.bytes);

    try {
      execFileSync("sips", [
        "-Z", "720",
        "--setProperty", "format", "jpeg",
        "--setProperty", "formatOptions", "70",
        original,
        "--out", file,
      ]);
      unlinkSync(original);
    } catch {
      // sips is macOS-only. Elsewhere, keep the original and say so.
      renameSync(original, file);
      console.log("(sips unavailable — image not compressed) ");
    }

    const { size } = statSync(file);
    console.log(`${(size / 1024).toFixed(0)} KB → ${file}`);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
