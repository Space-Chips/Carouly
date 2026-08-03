"use client";

import { useEffect, useRef } from "react";

import SampleSlide from "@/components/SampleSlide";
import { HERO_PRESET, HERO_RUN } from "@/lib/hero-run";

/** Width of one night. Its height follows the 1080 by 1350 slide ratio. */
const CARD = 224;

/**
 * The hero's visual: four nights of finished output for one example brand,
 * running left to right into a slot for tonight that has not been written yet.
 *
 * Two decisions carry the whole idea:
 *  - the row is right aligned and deliberately wider than the page, so the
 *    oldest night is cut off by the edge. Nothing announces "this has been
 *    running for a while" as economically as a sequence you cannot see the
 *    start of.
 *  - older nights are dimmer, on a graded ramp rather than a single dim step.
 *    Recency is encoded in the light rather than in a label, so the eye lands
 *    on last night without being told to, and the row reads as a run receding
 *    into the past instead of one lit card beside a wall of identical dim ones.
 *    The floor is 0.5 rather than lower: these are near-black slides on a black
 *    page, and below about half they stop being dim and start being absent.
 *
 * Hovering any night brings it back to full strength: the dimming is
 * atmosphere, not a claim that the older posts are worse.
 *
 * Rendered in HERO_PRESET because that is the preset whose imageStyle generated
 * these pictures. A preset now owns the palette and the photography together,
 * so pairing one preset's frame with another's image is exactly the mismatch
 * the registry was merged to prevent — hence one exported constant shared with
 * the generator rather than a preset id written out here.
 */
export default function HeroRun() {
  const scroller = useRef<HTMLDivElement>(null);

  // On a phone the row becomes a swipeable strip, and a strip parked at its
  // start opens on the oldest and dimmest night. Park it at the end instead:
  // tonight and last night are what matter, and swiping back through the
  // history is the same gesture as scrolling back through a feed. No-ops on
  // desktop, where the row is clipped rather than scrollable.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;

    const overflow = element.scrollWidth - element.clientWidth;
    if (overflow > 0) element.scrollLeft = overflow;
  }, []);

  return (
    <div
      ref={scroller}
      // The mask dissolves the clipped night instead of slicing it. On a phone
      // the row becomes an ordinary swipeable strip, where a fade over the
      // scroll direction would just hide content.
      className="overflow-x-auto md:overflow-hidden md:[mask-image:linear-gradient(to_right,transparent,black_16%)]"
    >
      <ol className="mx-auto flex w-full max-w-6xl gap-4 px-6 md:justify-end">
        {HERO_RUN.map((night, index) => {
          const latest = index === HERO_RUN.length - 1;

          // Evenly spaced from the floor up to full strength on last night.
          // Written inline rather than as a Tailwind class because the ramp
          // has to stay correct if a night is added to or removed from the run.
          const opacity = latest
            ? 1
            : 0.5 + (0.45 * index) / Math.max(1, HERO_RUN.length - 1);

          return (
            <li key={night.id} className="shrink-0">
              {/* Above the card, not below: the run is tall enough to meet the
                  fold on a laptop, and a label under the artwork is the first
                  thing to disappear — taking the sequence's meaning with it. */}
              <p
                className={`mb-3 font-mono text-xs uppercase tracking-[0.2em] ${
                  latest ? "text-bone" : "text-dim"
                }`}
              >
                {night.label}
              </p>
              {/* Carried as a custom property rather than as `opacity` itself:
                  an inline opacity would outrank the hover class and leave the
                  older nights stuck dim under the cursor. */}
              <div
                style={{ "--night": opacity } as React.CSSProperties}
                className="opacity-[var(--night)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-2 hover:opacity-100"
              >
                <SampleSlide
                  slide={night.slide}
                  index={0}
                  total={4}
                  width={CARD}
                  preset={HERO_PRESET}
                  backgroundUrl={night.image}
                  className={latest ? "ring-1 ring-ember/40" : ""}
                />
              </div>
            </li>
          );
        })}

        {/* Tonight. An empty frame shaped like the real thing, which is the
            one state the product cannot show you a finished picture of. */}
        <li className="shrink-0">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-ember-lit">
            Tonight
          </p>
          {/* `shimmer` sweeps a slow highlight across the whole card. It is the
              site's one indeterminate-wait affordance (see globals.css), and
              this is the one place on the page that genuinely is waiting: the
              post for tonight cannot be shown because it has not been generated
              yet. The class sets overflow:hidden, which the rounded corners
              want anyway, and it already falls still under reduced motion. */}
          <div
            style={{ width: CARD, height: CARD * 1.25 }}
            className="shimmer flex flex-col justify-between rounded-xl border border-hair bg-raise p-4"
          >
            <span className="font-mono text-xs text-dim">21:00</span>

            {/* Bottom anchored, where a real slide puts its type block, so the
                empty night reads as the same object waiting to be filled. */}
            <div>
              {/* Square, not rounded: at 16px of padding inside a 12px corner
                  the nested radius formula returns a negative number, which the
                  rule resolves as leaving the inner shape alone. */}
              <div aria-hidden className="space-y-2">
                <span className="block h-3 w-4/5 bg-white/[0.07]" />
                <span className="block h-3 w-3/5 bg-white/[0.07]" />
                <span className="block h-2 w-2/5 bg-white/[0.05]" />
              </div>

              <div className="mt-4 flex items-center gap-2">
                <span
                  aria-hidden
                  className="breathe size-1.5 rounded-full bg-ember"
                />
                <span className="font-mono text-xs text-dim">
                  not written yet
                </span>
              </div>
            </div>
          </div>
        </li>

        {/* A flex scroll container does not put its end padding into the
            scrollable area, so without this the last night sits flush against
            the edge of the phone. Desktop clips rather than scrolls, and the
            row is right aligned there, so it must not pick up the extra width. */}
        <li aria-hidden className="w-6 shrink-0 md:hidden" />
      </ol>
    </div>
  );
}
