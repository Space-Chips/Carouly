import { SampleSlideData } from "@/lib/sample-carousel";

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
      "a hand crank burr coffee grinder on a dark counter at night, worn steel and wood catching one warm shaft of light from the side, ground coffee scattered on the surface, the room behind falling into deep shadow, the whole grinder inside the frame in the upper two thirds, empty dark counter across the lower third, nobody in frame",
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
      "a tall glass of black cold brew on a dark counter at night, heavy condensation on the glass lit from behind so the rim glows, a single warm light source, the room behind falling into deep shadow, the glass fully inside the frame in the upper two thirds, empty dark counter across the lower third, nobody in frame",
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
      "an open foil coffee bag tipped over on dark wood at night, roasted beans spilling out, one warm raking light picking out the sheen on the beans, the room behind falling into deep shadow, the bag fully inside the frame in the upper two thirds, empty dark wood across the lower third, nobody in frame",
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
      "an espresso machine centered on a dark cafe counter late at night, the whole machine inside the frame in the upper two thirds, polished chrome blazing with a strong warm key light so the machine reads instantly even at thumbnail size, bright specular highlights along every edge, steam lit from behind, the room behind it falling away into deep shadow, empty counter and deep shadow across the lower third, nobody in frame",
  },
];
