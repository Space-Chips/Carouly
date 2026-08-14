"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSchedule } from "@/lib/actions/brand.actions";
import { CAROUSEL_COST, credits } from "@/lib/credits/prices";
import { Brand } from "@/types";

/**
 * Autopilot controls: how many, what time, and whether to post by itself.
 *
 * Nothing on this form is locked. Every switch here used to carry a plan gate
 * and a padlock; under credits there is nothing to unlock, because a schedule
 * costs nothing to set and the posts it writes are charged as they are written.
 * What replaced the padlock is a sentence saying what a day of this will cost —
 * which is the thing somebody actually wants to know before turning it on.
 */
export default function ScheduleForm({ brand }: { brand: Brand }) {
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
            Posts per day
          </Label>
          <Input
            id="posts_per_day"
            name="posts_per_day"
            type="number"
            min={1}
            max={5}
            defaultValue={brand.posts_per_day}
          />
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
        label="Autopilot"
        description={`Generate today's posts automatically, every day, at the hour above. Each one costs ${credits(
          CAROUSEL_COST
        )}, and it stops rather than overdrawing.`}
      />

      <Toggle
        checked={autoPublish}
        onChange={setAutoPublish}
        label="Auto-publish"
        description="Post to every connected account without review. Free — you are only ever charged for making something, never for sending it."
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

/** A switch and what it will do, including what it will spend. */
const Toggle = ({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
}) => (
  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 p-4">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="mt-1 size-4 accent-orange-500"
    />
    <span className="min-w-0 flex-1">
      <span className="text-sm font-medium">{label}</span>
      <span className="pretty mt-1 block text-xs text-muted-foreground">
        {description}
      </span>
    </span>
  </label>
);
