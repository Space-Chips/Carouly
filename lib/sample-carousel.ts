import { SlideKind } from "@/types";

export type SampleSlideData = {
  kind: SlideKind;
  heading: string;
  body?: string;
  footnote?: string;
};

/**
 * The carousel the landing page shows. It lives here rather than in a
 * component because both the hero (one slide, large) and the proof strip (all
 * four) render it, and they must not drift apart.
 *
 * All four are kept together on purpose: the entire pitch is that the product
 * only arrives on the last slide, which an excerpt cannot demonstrate.
 *
 * The example brand is a coffee roaster rather than another marketing tool, so
 * a visitor reads it as "this is what it would make for my business" instead of
 * "this is what the company posts about itself". The advice is real and
 * checkable, which is the whole point being demonstrated.
 */
export const SAMPLE_CAROUSEL: SampleSlideData[] = [
  {
    kind: "hook",
    heading: "Bitter coffee is not the beans",
    body: "It is almost always the water",
  },
  {
    kind: "insight",
    heading: "Let the kettle rest",
    body: "Take it off the boil and wait 30 seconds. Above 96 degrees you strip tannins out of the grounds, and no bean survives that.",
  },
  {
    kind: "insight",
    heading: "Sour means fast, bitter means slow",
    body: "If the cup is sour, grind finer. If it is bitter, grind coarser. Adjust one thing at a time or you will never know which one fixed it.",
  },
  {
    kind: "cta",
    heading: "Beans that were still green last week",
    body: "We roast on Tuesday and it is on your doorstep Thursday. Nothing sits in a warehouse going flat.",
    footnote: "@haldenroasters — link in bio",
  },
];
