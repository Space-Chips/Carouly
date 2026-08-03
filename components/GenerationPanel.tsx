"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import UpgradeLink from "@/components/upgrade/UpgradeLink";
import { Button } from "@/components/ui/button";
import {
  generateCarouselNow,
  runTodayNow,
} from "@/lib/actions/carousel.actions";

/**
 * Generation is a 30-60 second server round trip (LLM copy, then an image
 * model, then four PNG renders) and we get no progress events back from it.
 *
 * So the wait is presented honestly: a real elapsed counter, a plain
 * description of the work being done, and one placeholder per slide. No
 * progress bar and no step-by-step checklist — both would be inventing
 * information we do not have.
 */
export default function GenerationPanel({
  postsPerDay,
  autopilot,
  nextRun,
  timezone,
  isPaid,
  remaining,
}: {
  postsPerDay: number;
  autopilot: boolean;
  nextRun: string;
  timezone: string;
  isPaid: boolean;
  /** Free carousels left. Null on a paid plan, where there is no ceiling. */
  remaining: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useElapsed(pending);
  const exhausted = remaining !== null && remaining <= 0;

  const run = (name: string, fn: () => Promise<void>) => {
    setError(null);
    setMessage(null);
    setLabel(name);

    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Generation failed.");
      } finally {
        setLabel(null);
      }
    });
  };

  return (
    <section className="rise rounded-xl border border-white/10 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="font-medium">Today</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {autopilot
              ? `${postsPerDay} carousel${postsPerDay > 1 ? "s" : ""} · next batch ${nextRun} (${timezone})`
              : "Autopilot is off — nothing publishes on its own."}
          </p>
        </div>

        {/* The gate is enforced in the action either way. Swapping the button
            out here is what makes the refusal readable: a disabled control
            that throws on click tells the user nothing about why. */}
        {exhausted ? (
          <UpgradeLink reason="quota" variant="quiet">
            Start my free trial
          </UpgradeLink>
        ) : !pending ? (
          <div className="flex gap-2">
            <Button
              onClick={() =>
                run("one", async () => {
                  const { carouselId } = await generateCarouselNow();
                  router.push(`/carousels/${carouselId}`);
                })
              }
            >
              Write one now
            </Button>
            {/* Absent rather than clamped on the free plan: the action caps a
                free batch at one carousel, so offering a button labelled
                "today's batch" would promise something it will not do. */}
            {isPaid ? (
              <Button
                variant="secondary"
                onClick={() =>
                  run("batch", async () => {
                    const result = await runTodayNow();
                    setMessage(
                      `Created ${result.created.length} carousel${
                        result.created.length === 1 ? "" : "s"
                      }${result.published ? `, published ${result.published} time(s)` : ""}.${
                        result.errors.length
                          ? ` Issues: ${result.errors.join(" | ")}`
                          : ""
                      }`
                    );
                    router.refresh();
                  })
                }
              >
                Run today&apos;s batch
              </Button>
            ) : null}
          </div>
        ) : (
          <span className="text-sm tabular-nums text-muted-foreground breathe">
            {elapsed}s elapsed
          </span>
        )}
      </div>

      {pending ? (
        <div className="border-t border-white/10 p-5">
          <p className="text-sm">
            {label === "batch"
              ? `Writing today's ${postsPerDay} carousel${postsPerDay > 1 ? "s" : ""}…`
              : "Writing a carousel…"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Choosing the top-ranked keyword, writing the slides, generating the
            hook image, then rendering the PNGs. Usually 30–60 seconds.
          </p>

          <div className="mt-4 flex gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="shimmer h-32 w-[102px] shrink-0 rounded-lg border border-white/10 bg-white/[0.03]"
              />
            ))}
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="border-t border-white/10 p-4 text-sm text-emerald-400">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="border-t border-white/10 p-4 text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** Seconds since the current pending run started. Resets between runs. */
const useElapsed = (active: boolean) => {
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      startedAt.current = null;
      setSeconds(0);
      return;
    }

    startedAt.current = Date.now();
    const id = setInterval(() => {
      if (startedAt.current) {
        setSeconds(Math.round((Date.now() - startedAt.current) / 1000));
      }
    }, 1000);

    return () => clearInterval(id);
  }, [active]);

  return seconds;
};
