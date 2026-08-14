import type { Reel } from "@/components/landing/ReelCard";

/**
 * The sample gallery.
 *
 * Deliberately spread across trades rather than stacked in one niche: the
 * argument the page makes is that this works for whatever you already sell, and
 * a gallery of nothing but coffee undercuts it. Every title is a hook a real
 * creator would open on, because the frames are placeholders and the writing is
 * the only thing on them doing any work.
 *
 * Swap in `poster` per entry as renders land. Nothing else on the page changes.
 */
export const REELS: Reel[] = [
  { title: "The grind size nobody checks", kind: "Talking head", seconds: 14, tone: "ember" },
  { title: "POV: your first pour over", kind: "POV", seconds: 9, tone: "teal" },
  { title: "Same lace, three knots", kind: "Demo", seconds: 11, tone: "indigo" },
  { title: "What 400 grit actually does", kind: "Explainer", seconds: 18, tone: "acid" },
  { title: "Reading a soil test in 20s", kind: "Explainer", seconds: 21, tone: "fern" },
  { title: "Week one against week six", kind: "Before and after", seconds: 12, tone: "cherry" },
  { title: "The bit nobody photographs", kind: "Behind the counter", seconds: 16, tone: "pitch" },
  { title: "Sizing without a tape measure", kind: "Demo", seconds: 13, tone: "violet" },
  { title: "Ask for this by name", kind: "Talking head", seconds: 8, tone: "ember" },
  { title: "Everything we threw out today", kind: "Behind the counter", seconds: 19, tone: "teal" },
  { title: "Unboxing the seconds bin", kind: "Unboxing", seconds: 22, tone: "cherry" },
  { title: "One tool, four jobs", kind: "Demo", seconds: 7, tone: "indigo" },
];

/** The hero fan. Six frames wide enough to bleed off both edges. */
export const HERO_REELS: Reel[] = [
  REELS[1],
  REELS[0],
  REELS[6],
  REELS[3],
  REELS[5],
  REELS[8],
];
