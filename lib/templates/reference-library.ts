/**
 * Supplied visual directions available to the template-writing agent.
 *
 * These are deliberately separate from generated previews: they show the
 * intended editorial language, but do not pretend to be output from a graph.
 */
export const TEMPLATE_REFERENCE_DIRECTIONS = [
  "Cafe POV Meltdown — direct-to-camera founder confession; bold hook at the top.",
  "Desk Direct-to-Camera Pitch — desk-side expert explains one practical point.",
  "Expert Tax-Tip Explainer — confident specialist, one oversized proof statistic.",
  "My Money Breakdown — candid personal story with stacked number call-outs.",
  "Cafe Founder Struggles — founder problem/solution talking head with a top hook.",
  "Calorie Swap Tabletop — overhead product comparison; numbers label each option.",
  "Calorie Density Face-Off — presenter compares two physical options with labels.",
  "Hedgehog Supermarket Date — playful character-led mini scene with a simple premise.",
  "Snoring Night Routine — POV relationship moment with a short top caption.",
  "POV Screen Demo — real product UI, guided by a hook and step labels.",
  "Three Tools Roundup — three quick picks, each numbered and labelled over the shot.",
] as const;

/** Source files are shipped with the app for future card and preview work. */
export const TEMPLATE_REFERENCE_ASSETS = "/templates/references";
