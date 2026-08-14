/**
 * Render each shipped template's own example.
 *
 *   npm run previews            every template that has no example yet
 *   npm run previews -- --force redo the lot
 *   npm run previews -- --only ugc_talking_head
 *
 * The card that asks somebody to choose a format has to show them what the
 * format does, and the only honest way to do that is to run the format. So this
 * does exactly what a real turn does — binds the template's declared inputs to a
 * brand, executes the graph — with one fixture brand standing in for a customer,
 * and drops the finished cut in `public/templates/` with a frame beside it.
 *
 * It deliberately refuses to run in dry mode. A manifest full of
 * `dry-run.local` URLs would look like success and produce cards that play
 * nothing, which is the exact failure this whole feature exists to remove.
 *
 * Cost: on the local backend this is free and slow — a few minutes a clip on a
 * laptop, so budget the better part of an hour for three templates. On fal it is
 * fast and billed, which is why nothing here runs by itself.
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { RunEvent, VideoConcept } from "@/lib/agent/events";
import type { BrandKit } from "@/lib/stages/brand";
import { produce } from "@/lib/stages/produce";
import { TEMPLATES } from "@/lib/templates";
import type { TemplatePreview } from "@/lib/templates/previews";
import * as render from "@/lib/tools/render";

const OUT_DIR = join(process.cwd(), "public", "templates");
const MANIFEST = join(process.cwd(), "lib", "templates", "previews.json");

/* --------------------------------------------------------------- fixture --- */

/**
 * The brand these examples are for.
 *
 * Invented on purpose, and invented to be obviously generic: a real customer's
 * brand in the example would be a claim we have not got permission to make, and
 * a beautiful one would set an expectation the person's own site cannot meet.
 * What the example is for is the *shape* — how many beats, how it cuts, where
 * the captions sit — so the brand under it should be unremarkable.
 */
const FIXTURE = {
  brand_name: "Northline Coffee",
  brand_summary:
    "A small-batch coffee roaster that sells whole beans direct to people who " +
    "brew at home, with a subscription that ships the week it is roasted.",
  voice_tone: "plain-spoken, dry, a little contrarian; no marketing register",
  value_props: [
    "roasted the week it ships",
    "one origin at a time",
    "cancel whenever",
  ],
  target_personas: [
    {
      name: "Home brewer, two years in",
      needs: "beans that are actually fresh, without a lecture about terroir",
    },
  ],
  facts: {
    copy_snippets: [
      "Roasted Tuesday, posted Wednesday.",
      "One origin at a time.",
      "No subscription trap. Cancel whenever.",
    ],
  },
  products: [],
  evidence_check: { kept: 3, dropped: 0 },
  video_concepts: [],
} as unknown as BrandKit;

/**
 * A stand-in for the assets a real run would have captured off the site.
 *
 * `demo_screen_vo` opens on the brand's own screenshot — `asset.pick` — and a
 * fixture brand has no site to have taken one from. Without this the template
 * hands `null` to an image-to-video model and the run dies at the first node,
 * which is a fact about the fixture rather than about the template.
 *
 * Generated rather than committed, so the example stays honest about being a
 * generated example all the way down.
 */
const fixtureAssets = async () => {
  const shot = await render.image({
    prompt:
      "A clean product photograph of a matte kraft coffee bag with a plain " +
      "typographic label, standing on a pale wooden counter, soft window light, " +
      "shallow depth of field, no text legible.",
    aspect_ratio: "9:16",
  });

  if (!shot.url) throw new Error("could not generate the fixture asset");

  // A flat list, each item carrying its own role — the shape `capture` produces
  // and the shape `asset.pick` filters. Not a map keyed by role: that was this
  // script's first guess, it happened to match an older implementation, and when
  // `asset.pick` was corrected to filter a list it started returning null here
  // instead — which looks exactly like "this brand has no product shot".
  return (["product", "image", "logo", "icon"] as const).map((role) => ({
    role,
    sourceUrl: shot.url!,
    file: "fixture.png",
  }));
};

/** One idea per template, matched to what that template is for. */
const CONCEPTS: Record<string, VideoConcept> = {
  ugc_talking_head: {
    title: "The grind size nobody checks",
    hook: "Your coffee isn't bitter. It's ground wrong.",
    format: "talking-head",
    beats: [
      "Everyone blames the beans when it tastes harsh",
      "It is almost always the grind, one notch too fine",
      "Go one coarser tomorrow and taste it again",
    ],
    cta: "Try it with a bag of this week's roast.",
  },
  ugc_problem_solution: {
    title: "The bag that was already stale",
    hook: "This bag was roasted in March. It's August.",
    format: "problem-solution",
    beats: [
      "Supermarket beans sit for months before anyone opens them",
      "Ours are roasted the week they ship",
      "Same money, coffee that still tastes of something",
    ],
    cta: "Get the one roasted this week.",
  },
  demo_screen_vo: {
    title: "Picking a roast in twenty seconds",
    hook: "Three questions and you're done.",
    format: "product-demo",
    beats: [
      "Pick how you brew",
      "Pick how often you want it",
      "That is the whole setup",
    ],
    cta: "Start with one bag.",
  },
};

/* ----------------------------------------------------------------- files --- */

const run = (bin: string, args: string[]) =>
  new Promise<number>((resolve) => {
    const child = spawn(bin, args, { stdio: "ignore" });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });

/** The same, but keeping stderr — which is where ffmpeg says everything. */
const capture = (bin: string, args: string[]) =>
  new Promise<{ code: number; stderr: string }>((resolve) => {
    const child = spawn(bin, args);
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
    child.on("error", () => resolve({ code: 1, stderr: "" }));
  });

const download = async (url: string, to: string) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(5 * 60 * 1000) });
  if (!response.ok) throw new Error(`could not fetch the render (${response.status})`);
  await writeFile(to, Buffer.from(await response.arrayBuffer()));
};

/**
 * A poster taken from the cut itself rather than from the master frame.
 *
 * The master frame is the shot the clip *starts* from, which after motion is
 * not quite the frame you see when the video is paused — and a card whose still
 * does not match its first frame flickers on play.
 *
 * Chosen rather than sampled at a fixed timestamp. Every one of these templates
 * asks the video model for natural blinking, so a fixed grab lands on a closed
 * eye often enough to matter — and a card whose one still frame is of somebody
 * mid-blink is a bad advertisement for the format. `thumbnail` scores a window
 * of frames against their own average and takes the most representative, which
 * skips blinks and motion blur for free. Limited to the opening seconds so the
 * still still belongs to the first shot.
 */
/**
 * Does this file actually carry speech?
 *
 * Asked of the file rather than inferred from the backend, because inferring is
 * how the whole pipeline came to believe local renders were silent: the graph
 * decoded only the video half, the server hardcoded `has_audio: false` to match,
 * and the belief outlived the graph. A stream can also be present and empty —
 * `concat` synthesises silence to make its inputs match — so the level matters,
 * not just the stream.
 */
const hasSpeech = async (video: string) => {
  const { stderr } = await capture("ffmpeg", ["-i", video, "-af", "volumedetect", "-f", "null", "-"]);
  const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(stderr);

  // Digital silence reads as -91dB. Anything with a voice in it sits far above.
  return mean ? Number(mean[1]) > -60 : false;
};

const posterFrom = async (video: string, to: string) => {
  const code = await run("ffmpeg", [
    "-y", "-loglevel", "error",
    "-t", "3",
    "-i", video,
    "-vf", "thumbnail=n=72",
    "-frames:v", "1",
    "-q:v", "3",
    to,
  ]);

  return code === 0;
};

/* ------------------------------------------------------------------- run --- */

const args = process.argv.slice(2);
const force = args.includes("--force");
/** `--only a,b` — a list, because a prompt change rarely touches every template. */
const only = args.includes("--only")
  ? new Set(args[args.indexOf("--only") + 1]?.split(",").map((id) => id.trim()))
  : null;

const main = async () => {
  const mode = render.mode();

  if (mode === "dry") {
    console.error(
      "Nothing would be rendered: the backend is 'dry'.\n" +
        "Set CAROULY_RENDER=local (with `npm run render` and ComfyUI up) or " +
        "CAROULY_RENDER=fal with a FAL_KEY, then run this again."
    );
    process.exit(1);
  }

  if (!process.env.OPEN_ROUTER_API?.trim()) {
    console.error("OPEN_ROUTER_API is not set — the script and casting stages need it.");
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const manifest: Record<string, TemplatePreview> = JSON.parse(
    await readFile(MANIFEST, "utf8").catch(() => "{}")
  );

  const wanted = TEMPLATES.filter(
    (template) => !only || only.has(template.id)
  ).filter((template) => force || !manifest[template.id]);

  if (!wanted.length) {
    console.log("Every template already has an example. Use --force to redo them.");
    return;
  }

  // Fail in two seconds rather than twenty minutes in. The local backend going
  // away mid-run is the normal failure here — it is a laptop process — and
  // finding that out at the first clip of the third template is expensive.
  if (mode === "local") {
    const health = await fetch("http://127.0.0.1:8787/health", {
      signal: AbortSignal.timeout(4000),
    }).catch(() => null);

    if (!health?.ok) {
      console.error("The local render server is not answering. Start it with `npm run render`.");
      process.exit(1);
    }
  }

  console.log(`Backend: ${mode}. Rendering ${wanted.length} example(s).\n`);

  // Only paid for if something actually needs it.
  const needsAssets = wanted.some((template) =>
    template.nodes.some((node) => node.type === "asset.pick")
  );
  const assets = needsAssets ? await fixtureAssets() : undefined;

  for (const template of wanted) {
    const concept = CONCEPTS[template.id];

    if (!concept) {
      console.error(`  ${template.id}: no fixture concept — add one to this script.`);
      continue;
    }

    console.log(`${template.name}`);
    const started = Date.now();

    // The graph narrates itself; this is the same event stream the studio
    // renders, printed one line per node so a forty-minute run is watchable.
    const emit = (event: RunEvent) => {
      if (event.t === "node.start") console.log(`  · ${event.node}`);
      if (event.t === "node.ok") {
        console.log(
          `    ${event.node} ${event.cached ? "cached" : `${Math.round(event.ms / 1000)}s`}`
        );
      }
      if (event.t === "node.fail") console.error(`    ${event.node} failed: ${event.error}`);
    };

    try {
      const { video: artifact } = await produce({
        brand: { ...FIXTURE, ...(assets ? { assets } : {}) } as BrandKit,
        concept,
        templateId: template.id,
        runId: `preview-${template.id}`,
        emit,
      });

      if (artifact.kind !== "video" || !artifact.url) {
        throw new Error("the run produced no file");
      }

      const mp4 = join(OUT_DIR, `${template.id}.mp4`);
      const jpg = join(OUT_DIR, `${template.id}.jpg`);

      await download(artifact.url, mp4);
      const still = await posterFrom(mp4, jpg);

      manifest[template.id] = {
        preview: `/templates/${template.id}.mp4`,
        ...(still ? { still: `/templates/${template.id}.jpg` } : {}),
        seconds: Math.round(artifact.seconds),
        silent: !(await hasSpeech(mp4)),
        madeAt: new Date().toISOString().slice(0, 10),
        backend: mode,
      };

      // Written after every template rather than at the end: an hour of
      // rendering should not be thrown away because the third one failed.
      await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

      console.log(
        `  ✓ ${template.id}.mp4 — ${Math.round(artifact.seconds)}s, ` +
          `${Math.round((Date.now() - started) / 1000)}s to make\n`
      );
    } catch (error) {
      console.error(
        `  ✗ ${template.id}: ${error instanceof Error ? error.message : error}\n`
      );
    }
  }
};

await main();
