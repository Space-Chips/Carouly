import { CaretRight } from "@phosphor-icons/react/dist/ssr";

/**
 * One night's run, opened up.
 *
 * The page's claim is that a web address is enough input, so this is where that
 * gets shown rather than asserted: what was read off the site, which formats it
 * picked and why, and the cut it produced. It is the only dark surface in the
 * argument, because a working panel should look like the tool and not like the
 * brochure around it.
 *
 * Static markup on purpose. The reel rail below is already moving, and a second
 * animated centrepiece would leave nowhere for the eye to rest.
 */

const read = [
  "Sells single origin beans and a monthly subscription",
  "Buyers grind at home and are new to it",
  "Roast dates on every bag, which nobody else in the search results mentions",
];

const chosen = [
  { format: "Talking head", why: "Wins on explanation. Cheap to shoot, cheap to redo." },
  { format: "Close-up demo", why: "The grind is visual. Hands and sound do the argument." },
  { format: "POV first try", why: "The objection is that it is fiddly. Show it not being." },
];

const cut = [
  { scene: "Hook — the bag you already own", seconds: 3 },
  { scene: "Where the roast date hides", seconds: 4 },
  { scene: "Grind, side by side", seconds: 5 },
  { scene: "The pour, uncut", seconds: 6 },
  { scene: "Taste, and the face", seconds: 3 },
  { scene: "Where to get it", seconds: 3 },
];

export default function RunPanel() {
  return (
    <div className="overflow-hidden rounded-3xl border border-hair bg-raise">
      {/* 24px card radius, 16px inset, so nothing inside goes above 8px. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hair px-4 py-3">
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-dim">
          <span aria-hidden className="breathe size-1.5 rounded-full bg-ember" />
          Run · tonight · 21:40
        </p>
        <p className="font-mono text-xs text-dim">northline.coffee</p>
      </div>

      <div className="grid divide-y divide-hair lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <section className="p-4">
          <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-ember-lit">
            Read off the site
          </h3>
          <ul className="mt-4 space-y-3">
            {read.map((line) => (
              <li key={line} className="flex gap-2">
                <CaretRight
                  weight="bold"
                  aria-hidden
                  className="mt-1 size-3 shrink-0 text-dim"
                />
                <span className="pretty text-sm leading-relaxed text-bone">
                  {line}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="p-4">
          <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-ember-lit">
            Formats it picked
          </h3>
          <ul className="mt-4 space-y-3">
            {chosen.map((item) => (
              <li key={item.format} className="rounded-lg bg-raise-2 p-3">
                <p className="text-sm font-semibold text-bone">{item.format}</p>
                <p className="pretty mt-1 text-sm leading-relaxed text-dim">
                  {item.why}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="p-4">
          <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-ember-lit">
            The cut
          </h3>
          <ol className="mt-4 space-y-2">
            {cut.map((item) => (
              <li
                key={item.scene}
                className="flex items-center justify-between gap-3 rounded-lg bg-raise-2 px-3 py-2"
              >
                <span className="truncate text-sm text-bone">{item.scene}</span>
                <span className="shrink-0 font-mono text-xs text-dim">
                  0:{String(item.seconds).padStart(2, "0")}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-hair px-4 py-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-dim">
          24 seconds · 3 variants · captions and covers written with it
        </p>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-dim">
          Queued for 09:00 · TikTok, Reels, Shorts
        </p>
      </div>
    </div>
  );
}
