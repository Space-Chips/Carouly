"use client";

import { ArrowUp } from "@phosphor-icons/react";
import { useId, useState } from "react";

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
 * It always routes to /studio. That route is protected, so Clerk lifts a
 * signed-out visitor into sign-in and drops them back on the same URL with the
 * host still attached — one code path for both states, instead of a signed-in
 * branch and a signed-out branch that drift apart. The studio reads the host off
 * the query and starts the run itself, so the box on this page and the box in
 * the product are the same door.
 *
 * The navigation is the document's, not the router's, and that is the whole
 * reason this component has no `useRouter` in it.
 *
 * `router.push` into a protected route is a silent dead end for exactly the
 * people this box exists for. The push issues an RSC request for /studio, the
 * middleware answers it with a redirect to /sign-in, and the router follows that
 * redirect and gets back an HTML document where it wanted a flight payload. It
 * cannot apply one, so it gives up — no error, no navigation, no indication that
 * anything happened. The address bar still said `/` and the button had already
 * stopped spinning. The page's only primary action did nothing at all, and it
 * did nothing only when signed out, which is every first visit.
 *
 * `location.assign` makes it a real document request, so the redirect is the
 * browser's to follow and it lands on the branded sign-in with `redirect_url`
 * intact. Leaving the marketing page for the app is a shell change anyway, so
 * there was never much of a soft navigation to save here.
 */
export default function UrlComposer({
  autoFocus = false,
  showNote = true,
}: {
  autoFocus?: boolean;
  showNote?: boolean;
}) {
  const { lit } = useHeroStage();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Held true until the document goes. A full navigation takes long enough on a
  // cold route that a button which springs back to its resting state reads as a
  // press that missed.
  const [leaving, setLeaving] = useState(false);
  const errorId = useId();

  const submit = () => {
    const result = normalizeSite(value);

    if (!result.ok) {
      setError(result.reason);
      return;
    }

    setError(null);
    setLeaving(true);
    window.location.assign(`/studio?site=${encodeURIComponent(result.host)}`);
  };

  return (
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
        ) : <span aria-hidden className="hero-stage-sheen" />}

        {/* The footnote is gone on a phone, and `justify-between` with one
            child left-aligns it — the send button belongs on the right at
            every width. */}
        {lit ? <div className="hero-composer-actions flex items-center justify-end gap-3 px-3 pb-2 sm:justify-between">
          {/* Two lines of letterspaced small caps beside a round button reads
              as a broken row, and this is a footnote rather than a promise, so
              on a phone it simply goes. */}
          <p className="hidden font-mono text-xs uppercase tracking-[0.2em] text-mute sm:block">
            9:16 · 6 to 20 seconds · every night
          </p>

          <button
            type="submit"
            disabled={leaving}
            aria-label="Read my site and start"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-graphite text-white outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-graphite/85 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-graphite focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50"
          >
            {leaving ? (
              <span
                aria-hidden
                className="size-3.5 animate-spin rounded-full border border-white/30 border-t-white"
              />
            ) : (
              <ArrowUp weight="bold" aria-hidden className="size-4" />
            )}
          </button>
        </div> : null}
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
  );
}
