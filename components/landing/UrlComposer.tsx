"use client";

import { ArrowUp, At, Paperclip } from "@phosphor-icons/react";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useId, useState } from "react";

import AuthDialog from "@/components/auth/AuthDialog";
import { studioHref } from "@/components/auth/copy";
import { normalizeSite } from "@/lib/site-url";
import { useHeroStage } from "@/components/landing/HeroStage";

/**
 * The whole top of the funnel is this one box.
 *
 * There is no second call to action above the fold and no form to fill in: you
 * paste where you already are on the internet, and everything else is inferred
 * or asked for later. That is the entire premise of the page, so it gets the
 * hero's only interactive element.
 *
 * Submitting sorts people into the two things that can happen next, and the
 * sorting is the part worth reading. Signed in, the address is a destination and
 * the box hands over to the studio. Signed out, it is a thing to hold onto: the
 * dialog opens over the page with the host still in state, so the address
 * survives the login and the page behind it is still where they left it.
 *
 * Clerk answers `isSignedIn` only once its script has loaded, which on a cold
 * marketing visit is not always before somebody hits the arrow. So a submit
 * records the host and the effect below acts on it, which means an early press
 * queues rather than misfires — the button holds its spinner for the moment it
 * takes to find out, instead of guessing and showing a sign-in dialog to
 * somebody who already has an account.
 */
export default function UrlComposer({
  autoFocus = false,
  showNote = true,
}: {
  autoFocus?: boolean;
  showNote?: boolean;
}) {
  const { lit } = useHeroStage();
  const { isLoaded, isSignedIn } = useAuth();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The submitted host, held from the press until it has been resolved into
  // either a navigation or an open dialog.
  const [host, setHost] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const errorId = useId();

  useEffect(() => {
    if (!host || !isLoaded || !isSignedIn) return;

    /**
     * The navigation is the document's, not the router's, and that is
     * deliberate.
     *
     * `router.push` into a protected route is a silent dead end. The push
     * issues an RSC request for /studio, the middleware answers it with a
     * redirect, and the router gets back an HTML document where it wanted a
     * flight payload. It cannot apply one, so it gives up — no error, no
     * navigation, no indication that anything happened. `location.assign` makes
     * it a real document request, so the redirect is the browser's to follow.
     * Leaving the marketing page for the app is a shell change anyway, so there
     * was never much of a soft navigation to save here.
     */
    setLeaving(true);
    window.location.assign(studioHref(host));
  }, [host, isLoaded, isSignedIn]);

  // Only once Clerk has answered, so the dialog cannot flash in front of
  // somebody who turns out to be signed in already.
  const dialogOpen = Boolean(host) && isLoaded && !isSignedIn;
  // A full navigation takes long enough on a cold route that a button which
  // springs back to its resting state reads as a press that missed.
  const busy = Boolean(host) && !dialogOpen;

  const submit = () => {
    const result = normalizeSite(value);

    if (!result.ok) {
      setError(result.reason);
      return;
    }

    setError(null);
    setHost(result.host);
  };

  return (
    <>
      <div className="mx-auto w-full max-w-[900px]">
        {/* The card is the form. Clicking anywhere inside it lands in the field,
            which is what people expect from a box that looks like a prompt. */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className={`relative rounded-3xl border bg-paper-lift p-2 shadow-[0_1px_2px_rgba(12,10,9,0.04),0_12px_32px_-12px_rgba(12,10,9,0.16)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] focus-within:shadow-[0_1px_2px_rgba(12,10,9,0.06),0_20px_44px_-14px_rgba(12,10,9,0.24)] ${
            error ? "border-[#c01f3f]" : "border-rule focus-within:border-graphite/30"
          }`}
        >
          <label htmlFor="site" className="sr-only">
            Your website address
          </label>

          {/* A standing caret in front of the placeholder, so an empty box reads
              as waiting for you rather than as a blank panel. It carries the same
              drift as the last word of the headline, which is the only other
              colour above the fold — one accent doing two jobs, not two accents.
              It goes the moment there is real text to sit in front of. */}
          {lit && value === "" ? (
            <span
              aria-hidden
              className="hero-caret pointer-events-none absolute left-5 top-[22px] block h-6 w-0.5"
            />
          ) : null}

          {/* Nested radius: 24px card, 8px padding, so the field takes 16px. */}
          {lit ? (
            <div className="hero-composer-primary">
              <input
                id="site"
                name="site"
                type="text"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="off"
                spellCheck={false}
                autoFocus={autoFocus}
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  if (error) setError(null);
                }}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
                placeholder="My website is…"
                className="w-full rounded-2xl bg-transparent pb-8 pl-6 pr-3 pt-3 text-lg text-graphite outline-none placeholder:text-mute"
              />
            </div>
          ) : (
            <span aria-hidden className="hero-stage-sheen" />
          )}

          {/* The input's own controls sit on the left, the send button on the
              right, so the row reads as one composer at every width. The attach
              and mention affordances are visual placeholders for now — they name
              what the box will accept, without pretending to work yet, so they
              stay out of the keyboard path and never submit the form. */}
          {lit ? (
            <div className="hero-composer-actions flex items-center justify-between gap-3 px-3 pb-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-full text-mute outline-none transition-colors duration-200 ease-out hover:bg-graphite/[0.06] hover:text-graphite active:scale-[0.96]"
                >
                  <Paperclip aria-hidden className="size-[18px]" />
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-full text-mute outline-none transition-colors duration-200 ease-out hover:bg-graphite/[0.06] hover:text-graphite active:scale-[0.96]"
                >
                  <At aria-hidden className="size-[18px]" />
                </button>
              </div>

              <button
                type="submit"
                disabled={busy || leaving}
                aria-label="Read my site and start"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-graphite text-white outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-graphite/85 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-graphite focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50"
              >
                {busy || leaving ? (
                  <span
                    aria-hidden
                    className="size-3.5 animate-spin rounded-full border border-white/30 border-t-white"
                  />
                ) : (
                  <ArrowUp weight="bold" aria-hidden className="size-4" />
                )}
              </button>
            </div>
          ) : null}
        </form>

        {showNote && lit && error ? (
          <p id={errorId} role="alert" className="mt-3 text-sm text-[#c01f3f]">
            {error}
          </p>
        ) : showNote && lit ? (
          <p className="mt-3 text-sm text-mute">
            Free while in early access · No card at signup · Cancel any time
          </p>
        ) : null}
      </div>

      <AuthDialog
        open={dialogOpen}
        // Dropping the host is what closes it, and it also returns the button to
        // its resting state — so dismissing the dialog leaves the box exactly as
        // it was, with the address still typed, ready to send again.
        onOpenChange={(next) => {
          if (!next) setHost(null);
        }}
        site={host}
        intent="sign-up"
      />
    </>
  );
}
