/**
 * One ad, start to finish, outside the app.
 *
 *   npm run ad
 *
 * This is the scratchpad for making a single video without going through the
 * studio: edit the block marked EDIT below, run it, watch it in
 * `scratchpad/ad.mp4`. Everything under `execute()` is the shipped graph — the
 * same casting, master frame, per-beat frames, image-to-video with native audio,
 * concat and caption burn-in that a real run uses.
 *
 * ── The fast loop ───────────────────────────────────────────────────────────
 * A full run is ~25 minutes, and nearly every problem is the actor. So do not
 * iterate here. Iterate on the master frame on its own, which is 40 seconds:
 *
 *   curl -s -X POST localhost:8787/image -H 'Content-Type: application/json' \
 *     -d '{"prompt":"…","negative_prompt":"…"}'
 *
 * Look at the file it names, change the words, run it again. When the person is
 * right, paste that url into PIN below and run the whole thing — the graph will
 * use that exact frame as the identity anchor instead of casting a new stranger,
 * and every beat is derived from it.
 *
 * ── What steers what ────────────────────────────────────────────────────────
 *   PRESENTER here          who is on camera
 *   HOOK / BEATS / CTA here what she says
 *   BRAND here              what the product is, and the voice it is sold in
 *   presets/*.json          the house look, the negatives, how casting is briefed
 *                           — `style.frame`, `style.negative`, `casting.prompt`
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { RunEvent } from "@/lib/agent/events";
import { templateById } from "@/lib/templates";
import * as render from "@/lib/tools/render";
import { execute } from "@/lib/workflow/graph";
import "@/lib/workflow/nodes";

/* ══════════════════════════════════════════════════════════ EDIT FROM HERE ══ */

/** Which format. `ugc_talking_head`, `ugc_problem_solution`, `demo_screen_vo`. */
const TEMPLATE = "ugc_talking_head";

/**
 * An exact master frame to build the video on, or null to let casting invent
 * one.
 *
 * Pinning is the difference between "a woman roughly like this" and "this
 * woman". Generate one with the curl above, check it, paste the url here.
 */
const PIN: string | null = "http://127.0.0.1:8787/files/049e911f366420c8.png";

const BRAND = {
  brand_name: "Calanque Swim",
  brand_summary:
    "Swimwear sized the way lingerie is — band and cup separately — and built " +
    "with the support of a sports bra, for women who have a huge chest, like really huge and " +
    "athletic at the same time. Made in Marseille, sizes 36G+.",
  voice_tone:
    "dry, specific, a little exasperated; talks about fit like an engineer, " +
    "never like a catalogue",
  value_props: [
    "band and cup sized separately, not S/M/L",
    "underwire and a wide-set strap that survives a dive",
    "no gaping at the back on a narrow ribcage",
  ],
  target_personas: [
    {
      name: "Full-chested, athletic, sick of the choice",
      needs:
        "a top that actually holds a large cup without a scaffold of straps, and " +
        "does not ride up the second she gets in the water",
    },
  ],
  facts: {
    copy_snippets: [
      "Sizes 36G+.",
      "Band and cup, separately.",
      "Swim in it. Actually swim in it.",
    ],
  },
  products: [],
  evidence_check: { kept: 3, dropped: 0 },
  video_concepts: [],
};

/**
 * The casting note.
 *
 * Be blunt and anatomical. This is a fit model for a garment sold on cup size,
 * so "full chest" is not a description — it is a hedge, and the image model
 * resolves hedges toward its own average, which is small-busted. Say the size.
 * The negatives that stop it drifting back live in the preset's `style.negative`.
 */
const PRESENTER =
  "woman, 28, olive Mediterranean skin, lean athletic swimmer's build with " +
  "visible defined abs, narrow waist and broad shoulders, and a huge full heavy chest, " +
  "heavy 32G+ with clear canyon like cleavage with boobs pressed together; black underwired bikini with wide-set straps " +
  "and a supportive band; damp dark hair pushed back, faint sunburn across the " +
  "nose, small gold hoops; on a stone pool terrace above the sea in the south of " +
  "France, late afternoon; framed from mid-thigh up so the swimwear is visible; " +
  "dry-humoured rather than posed";

const HOOK =
  "Small ribcage, full chest — swimwear acts like that combination doesn't exist.";

const BEATS = [
  "Everything is small, medium, large, so the top that fits my chest gapes across my back",
  "Like look at my boobs [laughing and pressing them], they're huge only one that fits",
  "I did laps in this. It did not move",
];

const CTA = "Calanque Swim, 28D to 36G. Link in the bio.";

/* ════════════════════════════════════════════════════════════ EDIT TO HERE ══ */

const template = templateById(TEMPLATE);
if (!template) throw new Error(`no template '${TEMPLATE}'`);

if (render.mode() === "dry") {
  console.error(
    "Backend is 'dry' — nothing would render.\n" +
      "Set CAROULY_RENDER=local in .env.local, start ComfyUI and `npm run render`."
  );
  process.exit(1);
}

const started = Date.now();

const emit = (event: RunEvent) => {
  if (event.t === "node.start") console.log(`  · ${event.node}`);
  if (event.t === "node.ok") {
    console.log(
      `    ${event.node} ${event.cached ? "cached" : `${Math.round(event.ms / 1000)}s`}`
    );
  }
  if (event.t === "node.fail") console.error(`    ${event.node} failed: ${event.error}`);
};

console.log(`${BRAND.brand_name} — ${template.name}, backend ${render.mode()}`);
if (PIN) console.log(`pinned actor: ${PIN}`);
console.log();

const { scope, result } = await execute({
  workflow: template,
  inputs: { hook: HOOK, beats: BEATS, cta: CTA, presenter: PRESENTER },
  brand: BRAND as unknown as Record<string, unknown>,
  runId: "one-off-ad",
  emit,
  fresh: true,
  // Keyed by node id. `master` is the node the preset marks `role: "identity"`.
  ...(PIN ? { pins: { master: { url: PIN } } } : {}),
});

const final = result as { url?: string; seconds?: number };
const casting = scope.casting as {
  actor?: string;
  master_frame_prompt?: string;
  shots?: { line?: string }[];
  on_screen_text?: string[];
};

// Printed because these are the two things you will want to edit next: the
// person casting invented, and the still prompt it wrote to realise them.
console.log(`\ncast\n  ${casting?.actor ?? "—"}`);
console.log(`\nmaster frame prompt\n  ${casting?.master_frame_prompt ?? "—"}`);
console.log(`\nscript`);
for (const shot of casting?.shots ?? []) console.log(`  ${shot.line}`);
console.log(`\ncaptions: ${(casting?.on_screen_text ?? []).join(" / ")}`);

const out = join(process.cwd(), "scratchpad", "ad.mp4");

if (final.url) {
  const response = await fetch(final.url, { signal: AbortSignal.timeout(5 * 60 * 1000) });
  await writeFile(out, Buffer.from(await response.arrayBuffer()));
  console.log(`\n${out}  ·  ${Math.round((Date.now() - started) / 1000)}s`);
} else {
  console.error("\nthe run produced no file");
}
