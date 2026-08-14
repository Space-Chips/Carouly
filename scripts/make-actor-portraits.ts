/**
 * Draw a portrait for each person on the casting shelf.
 *
 *   npm run actors             everyone who has no portrait yet
 *   npm run actors -- --force  redo the lot
 *   npm run actors -- --only nadia,tom
 *
 * A preset is a description, and the card can draw a description honestly — an
 * initial on a flat ground, with a line saying the face is made when they are
 * cast. That is the truthful fallback, and it works. But a shelf of faces is a
 * casting call and a shelf of monograms is a form, so one image each is worth
 * having: the same prompt the run itself would use, generated once and committed
 * rather than billed to every person who opens the picker.
 *
 * It refuses to run in dry mode for the same reason the template previews do: a
 * manifest full of `dry-run.local` URLs looks like success and produces cards
 * with broken images, which is worse than the fallback it replaced.
 *
 * Cost: one image per preset. Cheap on fal, free and slow on the local backend.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ACTOR_PRESETS } from "@/lib/actors/presets";
import type { ActorPortrait } from "@/lib/actors/previews";
import * as render from "@/lib/tools/render";

const OUT_DIR = join(process.cwd(), "public", "actors");
const MANIFEST = join(process.cwd(), "lib", "actors", "previews.json");

/**
 * The house look, applied to every portrait.
 *
 * Deliberately the same register the UGC templates ask for — a phone, one
 * window, no retouching — because the shelf is a promise about what the run will
 * produce. A shelf of studio headshots would be selling a polish this pipeline
 * does not make, and every video would land as a disappointment against it.
 */
const STYLE = `Vertical 9:16 photorealistic phone photograph of this person filming themselves at arm's length. Available light only, one direction, uneven shadows, honest colour with no grade. Skin has visible pores, lines and texture, no retouching, no beauty filter. Clothes have real creases. The room behind them is genuinely theirs, with specific everyday clutter. Slightly off-centre framing, mild phone-lens distortion, subtle grain. Both eyes open, looking straight into the lens, caught mid-sentence.`;

const NEGATIVE = `eyes closed, mid-blink, looking away, head turned away, profile view, studio lighting, three-point lighting, corporate headshot, green screen, cinematic colour grade, airbrushed skin, plastic skin, waxy skin, beauty filter, CGI, 3D render, stock photo, model headshot, polished commercial look, watermark, text overlay, subtitles, extra fingers, warped hands`;

const download = async (url: string, to: string) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(3 * 60 * 1000) });
  if (!response.ok) throw new Error(`could not fetch the image (${response.status})`);
  await writeFile(to, Buffer.from(await response.arrayBuffer()));
};

const args = process.argv.slice(2);
const force = args.includes("--force");
/** `--only a,b` — a list, because a prompt change rarely touches every preset. */
const only = args.includes("--only")
  ? new Set(args[args.indexOf("--only") + 1]?.split(",").map((id) => id.trim()))
  : null;

const main = async () => {
  const mode = render.mode();

  if (mode === "dry") {
    console.error(
      "Nothing would be drawn: the backend is 'dry'.\n" +
        "Set CAROULY_RENDER=local (with `npm run render` up) or CAROULY_RENDER=fal " +
        "with a FAL_KEY, then run this again."
    );
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const manifest: Record<string, ActorPortrait> = JSON.parse(
    await readFile(MANIFEST, "utf8").catch(() => "{}")
  );

  const wanted = ACTOR_PRESETS.filter((preset) => !only || only.has(preset.id)).filter(
    (preset) => force || !manifest[preset.id]
  );

  if (!wanted.length) {
    console.log("Everyone already has a portrait. Use --force to redo them.");
    return;
  }

  console.log(`Drawing ${wanted.length} portrait(s) on ${mode}.\n`);

  for (const preset of wanted) {
    const started = Date.now();
    console.log(`${preset.name} — ${preset.persona}`);

    try {
      const frame = await render.image({
        prompt: `${preset.look} Wearing: ${preset.wardrobe}\n\n${STYLE}`,
        negative_prompt: NEGATIVE,
        aspect_ratio: "9:16",
      });

      if (!frame.url) throw new Error("the model returned no file");

      await download(frame.url, join(OUT_DIR, `${preset.id}.jpg`));

      manifest[preset.id] = {
        url: `/actors/${preset.id}.jpg`,
        madeAt: new Date().toISOString().slice(0, 10),
        backend: mode,
      };

      // Written after each one rather than at the end: a dozen images should not
      // be thrown away because the eleventh failed.
      await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

      console.log(
        `  ✓ ${preset.id}.jpg — ${Math.round((Date.now() - started) / 1000)}s\n`
      );
    } catch (error) {
      console.error(
        `  ✗ ${preset.id}: ${error instanceof Error ? error.message : error}\n`
      );
    }
  }
};

await main();
