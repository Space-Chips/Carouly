"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import Link from "next/link";

import BuyLink from "@/components/credits/BuyLink";
import { CAROUSEL_COST } from "@/lib/credits/prices";
import { Button } from "@/components/ui/button";
import {
  deleteCarousel,
  generateCarouselNow,
  publishNow,
  rerenderCarousel,
} from "@/lib/actions/carousel.actions";

/** Compact single-carousel trigger, for pages without the full Today panel. */
export function WriteOneButton({ broke }: { broke: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (broke) {
    return (
      <BuyLink gate="carousel" need={CAROUSEL_COST} variant="quiet">
        Out of credits — top up
      </BuyLink>
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
}: {
  carouselId: string;
  hasConnections: boolean;
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
        {/* Publishing is free — the credits went on writing the post — so the
            only thing that can stop it is having nowhere to send it. The link
            replaces the button rather than disabling it, because a greyed
            "Publish now" says nothing about what to do next. */}
        {hasConnections ? (
          <Button
            disabled={pending}
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
          /* No connected account, which is a setup step rather than a bill.
             Publishing costs nothing — the credits went on writing the thing. */
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ember-lit underline-offset-4 transition-colors duration-300 hover:underline"
          >
            Connect an account
          </Link>
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
