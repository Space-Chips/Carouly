"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { formatCredits } from "@/lib/credits/prices";

/**
 * The balance, as a meter rather than a number.
 *
 * The difference matters. A number is something you read when you go looking
 * for it; a meter is something you catch moving out of the corner of your eye,
 * and that is the whole job here — the studio spends money on the person's
 * behalf, sometimes hundreds of credits in one call, and the only honest way to
 * do that is to make the spending visible as it happens.
 *
 * So the figure counts rather than jumping, and the amount just taken rises off
 * it and fades. Both are short: 420ms for the count, which is long enough to
 * register as movement and short enough not to lag behind a fast run, and the
 * receipt is gone in under a second. Anything slower and a run that charges
 * twice in three seconds would still be animating the first charge.
 */
export default function Meter({
  balance,
  /** `bar` for the app's dark nav, `rail` for the studio's paper sidebar. */
  tone = "rail",
  href = "/credits",
}: {
  balance: number;
  tone?: "bar" | "rail";
  href?: string;
}) {
  const shown = useCounted(balance);
  const delta = useDelta(balance);
  const low = balance < 100;

  const paper = tone === "rail";

  return (
    <Link
      href={href}
      // A relative anchor for the floating receipt, which must not affect
      // layout — a delta that pushed the sidebar around every time the agent
      // spent something would be unbearable.
      className={`group relative inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors duration-300 ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 ${
        paper
          ? "border-rule bg-paper-lift text-graphite hover:border-graphite/25 focus-visible:outline-graphite"
          : "border-white/10 text-bone hover:border-white/25 focus-visible:outline-ember"
      }`}
    >
      <span
        aria-hidden
        className={`size-1.5 shrink-0 rounded-full transition-colors duration-300 ${
          low ? "bg-ember" : paper ? "bg-graphite/40" : "bg-bone/40"
        } ${delta ? "breathe" : ""}`}
      />

      {/* Tabular figures, always. A proportional font re-measures the string on
          every frame of the count and the whole pill twitches sideways. */}
      <span className="font-mono text-[13px] tabular-nums">
        {formatCredits(shown)}
      </span>

      <span className={`text-xs ${paper ? "text-mute" : "text-dim"}`}>
        credits
      </span>

      {delta ? (
        <span
          key={delta.id}
          aria-hidden
          className={`receipt pointer-events-none absolute -top-1 right-2 font-mono text-[11px] tabular-nums ${
            delta.amount < 0 ? "text-ember" : "text-ok"
          }`}
        >
          {delta.amount < 0 ? "−" : "+"}
          {formatCredits(Math.abs(delta.amount))}
        </span>
      ) : null}

      {/* The count is decoration; this is the number a screen reader gets, and
          only once it has settled. */}
      <span className="sr-only" aria-live="polite">
        {formatCredits(balance)} credits left
      </span>
    </Link>
  );
}

/**
 * Ease a displayed number toward the real one.
 *
 * Written by hand rather than with a spring library because the value is an
 * integer that must land exactly: a spring overshoots, and a balance that reads
 * 41 for two frames on its way to 42 is a bug report. Cubic ease-out, fixed
 * duration, and the final frame is assigned rather than interpolated.
 */
const useCounted = (target: number) => {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const frame = useRef(0);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = from.current;
    const distance = target - start;

    // Nothing to animate, or somebody asked for no motion. Either way the
    // number is simply correct, immediately.
    if (!distance || still) {
      from.current = target;
      setShown(target);
      return;
    }

    const began = performance.now();
    const DURATION = 420;

    const step = (now: number) => {
      const progress = Math.min(1, (now - began) / DURATION);
      const eased = 1 - Math.pow(1 - progress, 3);

      if (progress === 1) {
        from.current = target;
        setShown(target);
        return;
      }

      setShown(Math.round(start + distance * eased));
      frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [target]);

  return shown;
};

/**
 * The last change, held just long enough to be seen.
 *
 * Carries an id as well as an amount so that two identical charges in a row
 * still re-trigger the animation — keying a CSS animation on the value alone
 * means the second `−8` never plays.
 */
const useDelta = (balance: number) => {
  const previous = useRef(balance);
  const [delta, setDelta] = useState<{ id: number; amount: number } | null>(null);

  useEffect(() => {
    const change = balance - previous.current;
    previous.current = balance;

    if (!change) return;

    setDelta({ id: Date.now(), amount: change });
    const timer = setTimeout(() => setDelta(null), 900);
    return () => clearTimeout(timer);
  }, [balance]);

  return delta;
};
