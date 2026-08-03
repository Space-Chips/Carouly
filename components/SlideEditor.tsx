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
  const [error, setError] = useState<string | null>(null);

  const server = {
    heading: slide.heading,
    body: slide.body ?? "",
    footnote: slide.footnote ?? "",
  };

  // Controlled, but re-seeded whenever the server sends different copy: a
  // re-render (or a regeneration) rewrites the slide, and uncontrolled inputs
  // would happily keep showing the text it replaced.
  const [values, setValues] = useState(server);
  const [seed, setSeed] = useState(server);

  if (
    seed.heading !== server.heading ||
    seed.body !== server.body ||
    seed.footnote !== server.footnote
  ) {
    setSeed(server);
    setValues(server);
  }

  const dirty =
    values.heading !== server.heading ||
    values.body !== server.body ||
    values.footnote !== server.footnote;

  const set = (field: keyof typeof values) => (value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await updateSlide(slide.id, values);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save slide.");
      }
    });
  };

  return (
    <form
      onSubmit={onSubmit}
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

      <Input
        name="heading"
        value={values.heading}
        onChange={(e) => set("heading")(e.target.value)}
        required
      />

      {slide.kind !== "hook" || slide.body ? (
        <Textarea
          name="body"
          rows={3}
          value={values.body}
          onChange={(e) => set("body")(e.target.value)}
        />
      ) : null}

      {slide.kind === "cta" ? (
        <Input
          name="footnote"
          value={values.footnote}
          onChange={(e) => set("footnote")(e.target.value)}
          placeholder="@brand — link in bio"
        />
      ) : null}

      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </form>
  );
}
