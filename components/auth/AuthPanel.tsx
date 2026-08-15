import Link from "next/link";
import type { ReactNode } from "react";

import AuthScene from "@/components/auth/AuthScene";

/**
 * The auth card itself — one surface, shared by the /sign-in and /sign-up
 * routes and by the dialog the landing page opens in place.
 *
 * Two panes, and the asymmetry is the point. The left is the promise and never
 * asks for anything; the right is the only thing on screen you can act on. That
 * is the layout doing the pointing, rather than an arrow or a colour.
 *
 * The heading and blurb arrive as nodes rather than strings because the two
 * hosts owe the reader different elements for the same words: a page needs a
 * real `<h1>`, and a dialog needs Radix's `Title` and `Description` so the thing
 * is announced when it opens. Handing the classes out beside them keeps the two
 * looking identical without either one faking the other's semantics.
 */
export const authHeadingClass =
  "text-[1.7rem] font-semibold leading-[1.05] tracking-[-0.04em] text-graphite sm:text-[2.1rem]";

export const authBlurbClass = "mt-3 pretty text-[15px] leading-6 text-mute";

export default function AuthPanel({
  site,
  eyebrow,
  heading,
  blurb,
  children,
  close,
  className = "",
}: {
  /** The address they pasted, if they got here from the hero box. */
  site: string | null;
  eyebrow: string;
  /** Already wrapped in an `<h1>` or a `DialogTitle` by the caller. */
  heading: ReactNode;
  /** Already wrapped in a `<p>` or a `DialogDescription` by the caller. */
  blurb: ReactNode;
  /** Clerk's own form. */
  children: ReactNode;
  /** The dismiss control, when this is standing in a dialog. */
  close?: ReactNode;
  className?: string;
}) {
  return (
    <div
      /* The row tracks are declared rather than left to `auto`, and that is what
         makes the card's own max-height mean anything. An auto row sizes to its
         content and simply overflows a shorter container — the card clips it,
         the picture stretches with it, and the line pinned to the picture's foot
         ends up below the card's bottom edge. `minmax(0, 1fr)` pins the row to
         the card instead, which is also what lets the form column scroll. */
      className={`relative grid grid-rows-[9rem_minmax(0,1fr)] overflow-hidden rounded-[1.5rem] border border-rule bg-paper-lift shadow-[0_1px_2px_rgba(12,10,9,0.04),0_28px_70px_-24px_rgba(12,10,9,0.35)] sm:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)] sm:grid-rows-[minmax(0,1fr)] ${className}`}
    >
      {/* A band on a phone, a full column from `sm` up. One instance either
          way — rendering it twice behind a `hidden` would download three stills
          the visitor never sees. */}
      <AuthScene className="h-36 min-h-0 sm:h-auto sm:min-h-[32rem]" />

      {/* The form scrolls inside the card rather than the card growing past the
          viewport: a second factor or a verification code adds a lot of height,
          and on a laptop that is the difference between a legible panel and a
          submit button below the fold.

          `min-h-0` is what makes that true. A grid item's default `min-height:
          auto` refuses to shrink below its content, so the row would push past
          the card's own max-height, the card would clip it, and the picture
          beside it — stretched to the same oversized row — would lose the line
          pinned to its foot off the bottom of the card.

          `safe center` rather than plain `center`, and it is not a nicety. A
          centred flex column whose content is taller than it is overflows in
          both directions, and the half above the top edge cannot be scrolled to
          — on a 560px-tall laptop that silently ate the eyebrow and the top of
          the heading with no way to reach them. `safe` falls back to `start` the
          moment it stops fitting, so the form is centred while there is room and
          scrollable from its first pixel once there is not. */}
      <div className="flex min-h-0 min-w-0 flex-col [justify-content:safe_center] overflow-y-auto px-6 py-9 sm:px-9 sm:py-12 lg:px-14">
        <div className="mx-auto w-full max-w-[24rem]">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-mute">
            {eyebrow}
          </p>

          <div className="mt-3.5">{heading}</div>

          {/* The address comes through the wall with them.

              The blinking bar in front of it is the same element that stands in
              the empty hero box — the caret you typed next to, still holding
              your place on the screen that interrupted you. It is the one motif
              that crosses the funnel, and it is set in mono because this is a
              machine-readable thing about to be fetched rather than prose about
              a website. */}
          {site ? (
            <p className="mt-4 flex items-center gap-2.5 rounded-xl border border-rule bg-paper px-3.5 py-2.5">
              <span aria-hidden className="hero-caret block h-4 w-0.5 shrink-0" />
              <span className="min-w-0 truncate font-mono text-sm text-graphite">
                {site}
              </span>
            </p>
          ) : null}

          {blurb}

          <div className="auth-clerk-form mt-7">{children}</div>

          <p className="mt-7 text-center text-xs leading-5 text-mute">
            By continuing you agree to the{" "}
            <Link
              href="/terms"
              className="rounded underline decoration-rule underline-offset-2 transition-colors hover:text-graphite focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite"
            >
              terms
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="rounded underline decoration-rule underline-offset-2 transition-colors hover:text-graphite focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite"
            >
              privacy policy
            </Link>
            .
          </p>
        </div>
      </div>

      {/* Last in the DOM so the trap's first stop is the form rather than the
          way out of it, and positioned over the corner regardless. */}
      {close}
    </div>
  );
}
