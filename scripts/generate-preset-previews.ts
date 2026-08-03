/**
 * Renders one real sample image per preset into public/presets/.
 *
 *   npx tsx scripts/generate-preset-previews.ts
 *
 * The pickers need to show what a preset actually produces, and the honest way
 * to do that is to produce it — but at page-render time that would be a model
 * call per card. So they are generated once, committed, and served as static
 * assets. Re-run this after adding a preset or editing an `imageStyle`, then
 * set `hasPreview: true` on the presets it covered.
 *
 * Every preset gets the SAME scene on purpose: the only variable between the
 * cards should be the style, otherwise the comparison is meaningless.
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

/**
 * The scene both the settings cards and the landing page hero are built on.
 *
 * Chosen against three constraints at once: it has to read at thumbnail size
 * in a feed, it has to leave the lower half quiet enough for a headline to sit
 * on, and it has to belong to the example brand the landing page shows (a
 * coffee roaster). A single warm light source in a dark room does all three.
 *
 * Override for a one-off run with PRESET_PREVIEW_SCENE.
 */
const SCENE =
  process.env.PRESET_PREVIEW_SCENE ??
  "an espresso machine centered on a dark cafe counter late at night, the whole machine inside the frame in the upper two thirds, steam rising through one warm shaft of light, polished metal catching a bright rim highlight, the rest of the room falling away into deep shadow, empty counter and deep shadow across the lower third, nobody in frame";

const OUT_DIR = path.join(process.cwd(), "public", "presets");

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

  // Overrides the brand's configured image model for this run only: preview
  // quality is a one-off concern and need not match what the pipeline uses.
  process.env.OPENROUTER_IMAGE_MODEL =
    process.env.PRESET_PREVIEW_MODEL ?? "google/gemini-3-pro-image";

  // Imported after the env is set — the client reads the model id at import.
  const { generateImage } = await import("../lib/openrouter");
  const { hookImagePrompt } = await import("../lib/generator");
  const { listPresets } = await import("../lib/presets");

  mkdirSync(OUT_DIR, { recursive: true });

  for (const preset of listPresets()) {
    process.stdout.write(`${preset.id}: generating… `);

    const image = await generateImage(hookImagePrompt(SCENE, preset.id));

    if (!image) {
      console.log("no image returned");
      continue;
    }

    // Models return multi-megabyte originals. These are decoration on a
    // marketing page and a settings card, so they get resized to the largest
    // size either surface actually displays.
    const original = path.join(OUT_DIR, `${preset.id}.original`);
    const file = path.join(OUT_DIR, `${preset.id}.jpg`);

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
