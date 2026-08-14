import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The auth wall, written as step two of a run rather than as a gate.
 *
 * Somebody arriving here has just pasted their address into the hero and pressed
 * the arrow. The default Clerk screen answers that with a bare form on a white
 * page, which throws away the one thing they have already told us — and the
 * whole argument of the marketing page is that the address is the only input.
 * So the address comes with them: it is parked in Clerk's own `redirect_url`,
 * and this screen reads it back out and shows the run queued against it.
 *
 * Two columns, and only one of them is a card. The brief sits bare on paper,
 * exactly as the landing page's own step rail does; the form is the single
 * raised white surface because it is the only thing here you can act on. That
 * asymmetry is the layout doing the pointing, instead of an arrow or a colour.
 *
 * The blinking bar in front of the address is deliberately the same element that
 * stands in the empty hero box, carrying the same slow drift through blue and
 * violet. It is the one motif that crosses the funnel: the caret you typed next
 * to is still there, holding your place, on the screen that interrupted you.
 */

/** What the run does, in the order the agent's tools actually run it. */
const STEPS = [
  { marker: "Read", body: "Your copy, colours, logo and imagery, off the page itself." },
  { marker: "Build", body: "A brand kit: what you sell, how you write, who buys it." },
  { marker: "Choose", body: "The format that fits the idea, ranked against the brief." },
  { marker: "Cut", body: "A vertical cut, with its caption and cover frame." },
];

export default function AuthShell({
  site,
  eyebrow,
  heading,
  blurb,
  children,
}: {
  /** The address they pasted, if they got here from the hero box. */
  site: string | null;
  eyebrow: string;
  heading: string;
  blurb: string;
  /** Clerk's own form. */
  children: ReactNode;
}) {
  return (
    <main
      data-surface="paper"
      className="hero-wash min-h-screen max-w-none px-0 pt-0 text-graphite"
    >
      {/* The wordmark is the only navigation. Auth is a focused task, so the app
          bar is gone — but the way back out must not be, or the only exit from a
          screen somebody landed on by accident is the browser's own button. */}
      <div className="mx-auto w-full max-w-6xl px-6 pt-8">
        <Link
          href="/"
          className="rounded text-lg font-bold tracking-tight text-graphite transition-opacity duration-200 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-graphite"
        >
          Carouly
        </Link>
      </div>

      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:gap-20 lg:py-24">
        {/* ---------------------------------------------------------- brief --- */}
        <div>
          <p className="rise font-mono text-xs uppercase tracking-[0.2em] text-mute">
            {eyebrow}
          </p>

          {site ? (
            /* The address is the headline when there is one. Set in mono rather
               than the display sans: this is a machine-readable thing about to
               be fetched, and typing it in the page's voice would make it read
               as prose about a website instead of the website. */
            <p className="rise stagger-1 mt-5 flex items-center gap-3 text-2xl tracking-tight text-graphite sm:text-3xl">
              <span
                aria-hidden
                className="word-drift block h-7 w-0.5 shrink-0 rounded-full bg-current sm:h-8"
              />
              <span className="min-w-0 break-all font-mono">{site}</span>
            </p>
          ) : null}

          <h1
            className={`rise stagger-1 balance max-w-xl font-semibold tracking-tight text-graphite ${
              site
                ? "mt-6 text-xl sm:text-2xl"
                : "mt-5 text-3xl sm:text-4xl"
            }`}
          >
            {heading}
          </h1>

          <p className="rise stagger-2 pretty mt-5 max-w-lg text-base leading-relaxed text-mute">
            {blurb}
          </p>

          {/* The same rail the landing page uses for the nightly run, because it
              is the same sequence — and each step here is named after the tool
              that performs it, so the order is a fact rather than a flourish. */}
          <ol className="rise stagger-3 mt-10 max-w-md border-l border-rule">
            {STEPS.map((step) => (
              <li
                key={step.marker}
                className="relative grid gap-1 pb-6 pl-7 last:pb-0 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-5"
              >
                <span
                  aria-hidden
                  className="absolute -left-1 top-1.5 size-2 rounded-full bg-ember"
                />
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-mute">
                  {step.marker}
                </p>
                <p className="pretty text-sm leading-relaxed text-mute">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* ----------------------------------------------------------- form --- */}
        {/* Clerk sizes its own card, so the column is a centring box rather than
            a width. `min-w-0` keeps the long provider buttons from forcing the
            grid wider than the viewport on a phone. */}
        <div className="rise stagger-2 flex min-w-0 justify-center lg:justify-end">
          {children}
        </div>
      </div>
    </main>
  );
}
