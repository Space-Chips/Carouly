import { SampleSlideData } from "@/lib/sample-carousel";
import { PresetId } from "@/types";

/**
 * The look the hero is drawn in, and the look its images were generated from.
 *
 * Exported rather than written into both places, because a preset now owns the
 * palette and the photography together: if the row rendered in one preset while
 * public/landing/ held another's pictures, every card would be a frame and an
 * image speaking different languages. One constant means re-shooting the run is
 * a one-line change followed by `npx tsx scripts/generate-hero-nights.ts`.
 *
 * The `scene` strings below are written to suit it — swapping this alone would
 * hand the model a golden-hour style over a midnight subject.
 */
export const HERO_PRESET: PresetId = "ember";

/**
 * The hero's run: several consecutive nights of output for one example brand,
 * ending in a slot for tonight that has not been written yet.
 *
 * One finished post proves the tool can make a picture. A run of them proves
 * the thing the page actually claims — that it keeps going without anyone
 * opening the app — which is why the hero shows four nights rather than one.
 *
 * `scene` is the prompt its hook image was generated from, kept beside the
 * headline it sits behind so the two cannot drift apart. See
 * scripts/generate-hero-nights.ts.
 */
export type HeroNight = {
  id: string;
  /** Short mono label on the card. */
  label: string;
  slide: SampleSlideData;
  /** Public path of the committed hook image, if this night has one. */
  image: string | null;
  scene: string | null;
};

export const HERO_RUN: HeroNight[] = [
  {
    id: "grinder",
    label: "Mon",
    slide: {
      kind: "hook",
      heading: "Your grinder matters more than your beans",
      body: "Uneven grounds cannot brew evenly",
    },
    image: "/landing/grinder.jpg",
    scene:
      "a hand crank burr coffee grinder on a wooden counter in late afternoon sun, worn steel and wood catching one low raking shaft of sunlight from the side, ground coffee scattered on the surface, the room behind it dissolving into warm haze, the whole grinder inside the frame in the upper two thirds, empty counter and one long shadow across the lower third, nobody in frame",
  },
  {
    id: "coldbrew",
    label: "Tue",
    slide: {
      kind: "hook",
      heading: "Cold brew is not iced coffee",
      body: "One is brewed cold, the other is just late",
    },
    image: "/landing/coldbrew.jpg",
    scene:
      "a tall glass of black cold brew on a wooden counter at golden hour, heavy condensation on the glass with the low sun directly behind it so the rim glows and halates, the room behind it dissolving into warm haze, the glass fully inside the frame in the upper two thirds, empty counter and one long shadow across the lower third, nobody in frame",
  },
  {
    id: "stale",
    label: "Wed",
    slide: {
      kind: "hook",
      heading: "Beans go stale in weeks, not months",
      body: "Buy less, more often",
    },
    image: "/landing/stale.jpg",
    scene:
      "an open foil coffee bag tipped over on sun-warmed wood in late afternoon, roasted beans spilling out, low raking sunlight picking out the sheen on the beans and the crease of the foil, the room behind it dissolving into warm haze, the bag fully inside the frame in the upper two thirds, empty wood and one long shadow across the lower third, nobody in frame",
  },
  {
    id: "bitter",
    label: "Last night",
    slide: {
      kind: "hook",
      heading: "Bitter coffee is not the beans",
      body: "It is almost always the water",
    },
    image: "/landing/bitter.jpg",
    scene:
      "an espresso machine centered on a cafe counter in the last hour of sunlight, the whole machine inside the frame in the upper two thirds, polished chrome blazing where the low sun rakes across it so the machine reads instantly even at thumbnail size, bright specular highlights and gentle flare along every edge, steam lit from behind, the room behind it dissolving into warm haze, empty counter and one long shadow across the lower third, nobody in frame",
  },
];
