import { PresetId } from "@/types";

/**
 * A preset is the complete identity of a carousel: palette, type treatment,
 * copy tone AND the look of the AI hook image.
 *
 * These used to be two registries — a preset for the slides and a "vibe" for
 * the image — which let a brand pick a warm filmic palette and a cold clinical
 * background and end up with a carousel that looked like two products. One
 * entry per look means the image is always shot in the same language as the
 * frame it sits behind.
 *
 * Adding a look is a matter of appending an entry here — nothing downstream
 * hardcodes a preset id. Set `hasPreview` only after running
 * `npx tsx scripts/generate-preset-previews.ts`, which commits the real sample
 * image the pickers show.
 */
export type Preset = {
  id: PresetId;
  label: string;
  description: string;

  /** Copy direction handed to the model when writing slides. */
  tone: string;

  /** Small label above the CTA headline. Part of the preset's voice. */
  ctaKicker: string;

  colors: {
    background: string;
    text: string;
    muted: string;
    accent: string;
  };

  /**
   * Appended verbatim to every hook-image prompt, so it reads as a
   * comma-separated list of style directives. It deliberately says nothing
   * about subject matter: the scene comes from the generator, and a style that
   * also dictates content fights it.
   */
  imageStyle: string;

  /**
   * One-line plain-English summary of the image look, shown under the sample.
   * `imageStyle` is prompt engineering, not something a user should have to
   * read to pick a look.
   */
  imageSummary: string;

  /** 0-1. How much the AI hook image shows through behind the headline. */
  hookImageOpacity: number;

  /** 0-1 opacity of the procedural grain overlay. */
  grain: number;

  /** True once a real sample image is committed to public/presets/<id>.jpg. */
  hasPreview: boolean;
};

export const PRESETS: Record<PresetId, Preset> = {
  grain: {
    id: "grain",
    label: "Grain",
    description:
      "Dark, filmic and physical. Limited palette, heavy grain, motion blur.",
    tone: [
      "Direct, confident, a little cinematic. Short declarative sentences.",
      "No corporate filler, no hype words, no emoji, no exclamation marks.",
      "Sound like a practitioner sharing something they actually learned.",
    ].join(" "),
    ctaKicker: "What we built",
    colors: {
      background: "#0B0B0D",
      text: "#EDE9E3",
      muted: "#8A857D",
      accent: "#C4552F",
    },
    imageStyle: [
      "grainy analogue photography",
      "dark limited color palette",
      "motion blur, shallow depth of field",
      "soft directional light",
    ].join(", "),
    imageSummary: "Heavy grain and motion blur. Warm, dark and physical.",
    hookImageOpacity: 0.55,
    grain: 0.22,
    hasPreview: true,
  },

  /**
   * Built for the timeline rather than the gallery: stop-power first. Low
   * luminance with a bright rim so the subject still reads at thumbnail size,
   * one accent kept near-pure, and the imperfections held to the level where
   * they look like optics instead of a broken export. The avoid-list is part
   * of the prompt because these are the exact failure modes the style invites.
   */
  nocturne: {
    id: "nocturne",
    label: "Nocturne",
    description:
      "Cinematic night. Crushed blacks and a single rim-lit focal point, so it still reads at thumbnail size.",
    tone: [
      "Quiet and assured. Long enough to land, never longer.",
      "Understatement over emphasis: no hype words, no emoji, no exclamation marks.",
      "Sound like someone explaining a hard-won detail late in the evening.",
    ].join(" "),
    ctaKicker: "Made for this",
    colors: {
      background: "#07090F",
      text: "#E6E9F2",
      muted: "#79819A",
      accent: "#4F8CFF",
    },
    imageStyle: [
      "cinematic night photography",
      "rich limited palette of deep black, indigo and charcoal with a single saturated accent",
      "low overall luminance but a bright rim light or glowing edge so the subject clearly pops",
      "dramatic side lighting and practical light sources",
      "one strong focal point, simple uncluttered composition that stays readable at thumbnail size",
      "crushed blacks, desaturated muted midtones",
      "moderate film grain",
      "soft bloom, subtle vignette",
      "moody atmospheric mood that suggests a story",
      "avoid a pure black void with no focal point",
      "avoid an over-sharpened digital look",
      "avoid busy backgrounds and tiny details",
    ].join(", "),
    imageSummary: "Near-black, one rim-lit subject, one cold accent.",
    hookImageOpacity: 0.6,
    grain: 0.16,
    hasPreview: true,
  },

  /**
   * The one light look. Its wash and grain are dialled right down: the same
   * values that read as filmic on a black frame read as a dirty scan on paper.
   */
  bleach: {
    id: "bleach",
    label: "Bleach",
    description:
      "High-key daylight on warm paper. Ink-black type, one burnt-orange accent, almost no grain.",
    tone: [
      "Plain and useful. Say the thing, then stop.",
      "Editorial rather than promotional: no hype words, no emoji, no exclamation marks.",
      "Sound like a well-edited trade magazine, not a brand account.",
    ].join(" "),
    ctaKicker: "In practice",
    colors: {
      background: "#F5F2EB",
      text: "#14120E",
      muted: "#6E695D",
      accent: "#C2410C",
    },
    imageStyle: [
      "bright high-key daylight photography",
      "warm off-white and bone palette with one burnt orange accent",
      "soft diffused window light, gentle shadows, airy overexposed highlights",
      "clean minimal composition with generous empty space",
      "fine subtle film grain",
      "avoid dark moody lighting",
      "avoid heavy saturation and busy backgrounds",
    ].join(", "),
    imageSummary: "Blown-out daylight, pale surfaces, lots of empty space.",
    hookImageOpacity: 0.7,
    grain: 0.07,
    hasPreview: false,
  },

  atlas: {
    id: "atlas",
    label: "Atlas",
    description:
      "Archival and documentary. Muted earth tones, natural light, nothing staged.",
    tone: [
      "Measured and factual, like a field note.",
      "Concrete details over adjectives: no hype words, no emoji, no exclamation marks.",
      "Sound like someone reporting what they observed, not selling it.",
    ].join(" "),
    ctaKicker: "The record",
    colors: {
      background: "#0E1411",
      text: "#E3EADF",
      muted: "#7F8C82",
      accent: "#8FB573",
    },
    imageStyle: [
      "archival documentary photography",
      "muted earth palette of moss, clay, sand and slate",
      "flat natural daylight, overcast, no artificial lighting",
      "candid unstaged composition, mid distance, one clear subject",
      "slightly faded contrast as if scanned from an old print",
      "moderate grain",
      "avoid glossy commercial polish",
      "avoid neon or vivid saturation",
    ].join(", "),
    imageSummary: "Faded documentary print. Overcast light, earth tones.",
    hookImageOpacity: 0.58,
    grain: 0.2,
    hasPreview: false,
  },

  signal: {
    id: "signal",
    label: "Signal",
    description:
      "Studio-lit and clinical. Seamless backdrop, hard shadows, one electric accent.",
    tone: [
      "Sharp and specific. Numbers and mechanisms, not vibes.",
      "Technical without jargon: no hype words, no emoji, no exclamation marks.",
      "Sound like an engineer explaining why the obvious answer is wrong.",
    ].join(" "),
    ctaKicker: "How it works",
    colors: {
      background: "#06070A",
      text: "#F2F4F8",
      muted: "#767D8C",
      accent: "#C7F53B",
    },
    imageStyle: [
      "studio product photography on a seamless backdrop",
      "cool neutral greys and near-black with one electric lime accent",
      "hard directional key light, crisp defined shadows",
      "centred geometric composition, precise and deliberate",
      "clean surfaces, minimal grain, high micro-contrast",
      "avoid outdoor scenes and natural clutter",
      "avoid warm nostalgic tones",
    ].join(", "),
    imageSummary: "Hard studio light on a seamless sweep. Precise and cold.",
    hookImageOpacity: 0.5,
    grain: 0.1,
    hasPreview: false,
  },

  ember: {
    id: "ember",
    label: "Ember",
    description:
      "Golden hour on 35mm. Warm haze, low sun, generous flare.",
    tone: [
      "Warm and personal, still concrete. First person is welcome.",
      "Conversational without filler: no hype words, no emoji, no exclamation marks.",
      "Sound like a note to someone a year behind you.",
    ].join(" "),
    ctaKicker: "Why we made it",
    colors: {
      background: "#140C08",
      text: "#F7EADB",
      muted: "#9B8570",
      accent: "#FF7A2F",
    },
    imageStyle: [
      "golden hour 35mm film photography",
      "warm amber, rust and sun-bleached tones",
      "low raking sunlight, long shadows, atmospheric haze",
      "gentle lens flare and halation on highlights",
      "relaxed handheld framing with one clear subject",
      "visible film grain, soft contrast",
      "avoid cold blue or clinical lighting",
      "avoid harsh midday sun",
    ].join(", "),
    imageSummary: "Low sun, warm haze and halation. Nostalgic 35mm.",
    hookImageOpacity: 0.52,
    grain: 0.18,
    hasPreview: false,
  },
};

export const DEFAULT_PRESET: PresetId = "grain";

/**
 * Real output from a preset's `imageStyle`, generated once by
 * scripts/generate-preset-previews.ts and committed. Every preset is given the
 * same scene, so the only difference between two samples is the style itself.
 */
export const presetPreviewSrc = (preset: Preset | PresetId): string =>
  `/presets/${typeof preset === "string" ? preset : preset.id}.jpg`;

export const getPreset = (id?: string | null): Preset =>
  PRESETS[(id ?? DEFAULT_PRESET) as PresetId] ?? PRESETS[DEFAULT_PRESET];

export const listPresets = (): Preset[] => Object.values(PRESETS);

export const isPresetId = (id: string): id is PresetId => id in PRESETS;
