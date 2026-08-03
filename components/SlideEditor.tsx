"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateSlide } from "@/lib/actions/carousel.actions";
import { Slide } from "@/types";

/**
 * Inline copy editing. Saving re-renders the whole carousel's PNGs, so what
 * you see in the preview is always what would be posted.
 */
export default function SlideEditor({ slide }: { slide: Slide }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        await updateSlide(slide.id, {
          heading: String(form.get("heading") ?? ""),
          body: String(form.get("body") ?? ""),
          footnote: String(form.get("footnote") ?? ""),
        });
        setDirty(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save slide.");
      }
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      onChange={() => setDirty(true)}
      className="rounded-lg border border-white/10 p-4 grid gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          {String(slide.position + 1).padStart(2, "0")} · {slide.kind}
        </span>
        {dirty ? (
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Re-rendering…" : "Save & re-render"}
          </Button>
        ) : null}
      </div>

      <Input name="heading" defaultValue={slide.heading} required />

      {slide.kind !== "hook" || slide.body ? (
        <Textarea name="body" rows={3} defaultValue={slide.body ?? ""} />
      ) : (
        <input type="hidden" name="body" value="" />
      )}

      {slide.kind === "cta" ? (
        <Input
          name="footnote"
          defaultValue={slide.footnote ?? ""}
          placeholder="@brand — link in bio"
        />
      ) : (
        <input type="hidden" name="footnote" value={slide.footnote ?? ""} />
      )}

      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </form>
  );
}
