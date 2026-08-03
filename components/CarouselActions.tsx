"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import UpgradeLink from "@/components/upgrade/UpgradeLink";
import { Button } from "@/components/ui/button";
import {
  deleteCarousel,
  generateCarouselNow,
  publishNow,
  rerenderCarousel,
} from "@/lib/actions/carousel.actions";

/** Compact single-carousel trigger, for pages without the full Today panel. */
export function WriteOneButton({ exhausted }: { exhausted: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (exhausted) {
    return (
      <UpgradeLink reason="quota" variant="quiet">
        Start my free trial
      </UpgradeLink>
    );
  }

  return (
    <div className="grid gap-2 justify-items-end">
      <Button
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const { carouselId } = await generateCarouselNow();
              router.push(`/carousels/${carouselId}`);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Generation failed.");
            }
          });
        }}
      >
        {pending ? "Writing…" : "Write one now"}
      </Button>
      {pending ? (
        <span className="text-xs text-muted-foreground breathe">
          30–60 seconds
        </span>
      ) : null}
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  );
}

/** Publish / re-render / delete for a single carousel. */
export function CarouselControls({
  carouselId,
  hasConnections,
  canPublish,
}: {
  carouselId: string;
  hasConnections: boolean;
  /** False on the free plan, where slides are downloadable but not postable. */
  canPublish: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = (name: string, fn: () => Promise<void>) => {
    setError(null);
    setMessage(null);
    setBusy(name);

    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <div className="grid gap-3 justify-items-start">
      <div className="flex flex-wrap gap-2">
        {/* The gate replaces the button rather than disabling it: "Publish now"
            greyed out reads as "you have no accounts connected", which is a
            different problem with a different fix. */}
        {canPublish ? (
          <Button
            disabled={pending || !hasConnections}
            onClick={() =>
              run("publish", async () => {
                const outcomes = await publishNow(carouselId);
                setMessage(
                  outcomes
                    .map(
                      (o) =>
                        `${o.platform}: ${o.status}${o.error ? ` — ${o.error}` : ""}`
                    )
                    .join(" · ")
                );
              })
            }
          >
            {busy === "publish" ? "Publishing…" : "Publish now"}
          </Button>
        ) : (
          <UpgradeLink reason="publish" variant="quiet">
            Publish to my accounts
          </UpgradeLink>
        )}

        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => run("render", () => rerenderCarousel(carouselId))}
        >
          {busy === "render" ? "Rendering…" : "Re-render images"}
        </Button>

        {/* Deleting is irreversible, so it asks once rather than acting instantly. */}
        {confirmDelete ? (
          <span className="flex items-center gap-2 rise">
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() =>
                run("delete", async () => {
                  await deleteCarousel(carouselId);
                  router.push("/carousels");
                })
              }
            >
              {busy === "delete" ? "Deleting…" : "Confirm delete"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          </span>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
      </div>

      {!hasConnections ? (
        <p className="text-xs text-muted-foreground max-w-sm">
          No accounts connected — add one in Settings, or download the slides
          and post them by hand.
        </p>
      ) : null}
      {message ? <p className="text-xs text-emerald-400">{message}</p> : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
