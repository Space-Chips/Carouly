"use client";

import { Lock } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSchedule } from "@/lib/actions/brand.actions";
import { PaywallReason } from "@/lib/plans";
import { Brand } from "@/types";

/** Autopilot controls: how many, what time, and whether to post by itself. */
export default function ScheduleForm({
  brand,
  limits,
}: {
  brand: Brand;
  /** What the current plan allows. Mirrors Limits in lib/billing.ts. */
  limits: { postsPerDay: number; autopilot: boolean; autoPublish: boolean };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [autopilot, setAutopilot] = useState(brand.autopilot);
  const [autoPublish, setAutoPublish] = useState(brand.auto_publish);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const form = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        await updateSchedule({
          posts_per_day: Number(form.get("posts_per_day")),
          post_hour: Number(form.get("post_hour")),
          timezone: String(form.get("timezone")),
          autopilot,
          auto_publish: autoPublish,
        });
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-6 max-w-xl">
      <div className="grid sm:grid-cols-3 gap-4 sm:items-start">
        <div className="grid content-start gap-2">
          <Label htmlFor="posts_per_day" className="flex items-end sm:min-h-10">
            Carousels per day
          </Label>
          <Input
            id="posts_per_day"
            name="posts_per_day"
            type="number"
            min={1}
            // Free sits at 0, which is not a legal input value — the field
            // stays usable and the two switches below it carry the gate.
            max={Math.max(1, limits.postsPerDay)}
            defaultValue={brand.posts_per_day}
          />
          {limits.autopilot && limits.postsPerDay < 5 ? (
            <Link
              href="/upgrade?reason=posts_per_day"
              className="text-xs text-dim underline underline-offset-4 transition-colors hover:text-muted-foreground"
            >
              Studio writes up to 5 a day
            </Link>
          ) : null}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="post_hour" className="flex items-end sm:min-h-10">
            Hour (0–23)
          </Label>
          <Input
            id="post_hour"
            name="post_hour"
            type="number"
            min={0}
            max={23}
            defaultValue={brand.post_hour}
          />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="timezone" className="flex items-end sm:min-h-10">
            Timezone
          </Label>
          <Input
            id="timezone"
            name="timezone"
            defaultValue={brand.timezone}
            placeholder="Europe/Paris"
          />
        </div>
      </div>

      <Toggle
        checked={autopilot}
        onChange={setAutopilot}
        locked={!limits.autopilot}
        reason="autopilot"
        label="Autopilot"
        description="Generate today's carousels automatically, every day, at the hour above."
      />

      <Toggle
        checked={autoPublish}
        onChange={setAutoPublish}
        locked={!limits.autoPublish}
        reason="auto_publish"
        label="Auto-publish"
        description="Post to every connected account without review. Leave off to approve each carousel yourself."
      />

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {saved ? <p className="text-sm text-emerald-400">Saved.</p> : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save schedule"}
        </Button>
      </div>
    </form>
  );
}

/**
 * A locked toggle is shown, not hidden.
 *
 * Hiding the two switches that are the whole product would leave a free
 * account looking like a smaller app rather than the same app with the engine
 * off. Showing them, greyed, with the price attached, is the paywall touchpoint
 * that costs nothing to place and speaks at exactly the moment someone reaches
 * for the feature.
 */
const Toggle = ({
  checked,
  onChange,
  locked,
  reason,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  locked: boolean;
  reason: PaywallReason;
  label: string;
  description: string;
}) => {
  const body = (
    <>
      <input
        type="checkbox"
        checked={locked ? false : checked}
        disabled={locked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 accent-orange-500 disabled:opacity-40"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {locked ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-hair px-2 py-0.5 text-xs text-dim">
              <Lock weight="bold" aria-hidden className="size-3" />
              Plan
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
    </>
  );

  if (!locked) {
    return (
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 p-4">
        {body}
      </label>
    );
  }

  return (
    <Link
      href={`/upgrade?reason=${reason}`}
      className="surface flex items-start gap-3 rounded-lg border border-white/10 p-4"
    >
      {body}
      <span className="shrink-0 self-center text-xs font-medium text-ember-lit">
        Unlock
      </span>
    </Link>
  );
};
