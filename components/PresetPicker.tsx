"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updatePreset } from "@/lib/actions/brand.actions";
import { Preset } from "@/lib/presets";
import { PresetId } from "@/types";

/**
 * Picks the carousel's look: palette, tone and hook-image style in one choice.
 *
 * Saves on click rather than behind a submit button — there is one field, and
 * the samples already show the result. Each card renders two real slides
 * through the same component that produces the exported PNGs, with the hook
 * slide sitting on the preset's own sample image, so the card is the product
 * rather than a description of it.
 */
export default function PresetPicker({
  presets,
  active,
  brandName,
  handle,
}: {
  presets: Preset[];
  active: PresetId;
  brandName: string;
  handle: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Selection is optimistic: the round trip is a write plus a revalidate, and
  // a card that stays unselected until then reads as a dropped click.
  const [selected, setSelected] = useState<PresetId>(active);

  const choose = (id: PresetId) => {
    if (id === selected || pending) return;

    const previous = selected;
    setSelected(id);
    setError(null);

    startTransition(async () => {
      try {
        await updatePreset(id);
        router.refresh();
      } catch (err) {
        setSelected(previous);
        setError(err instanceof Error ? err.message : "Could not save preset.");
      }
    });
  };

  const sampleSrc = (preset: Preset, kind: "hook" | "cta") =>
    `/api/preset-preview?preset=${preset.id}&kind=${kind}&brand=${encodeURIComponent(
      brandName
    )}&handle=${encodeURIComponent(handle)}`;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 max-w-3xl">
        {presets.map((preset) => {
          const isActive = preset.id === selected;

          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => choose(preset.id)}
              aria-pressed={isActive}
              disabled={pending}
              className={`text-left rounded-lg border p-5 transition-colors disabled:opacity-70 ${
                isActive
                  ? "border-orange-500/60 bg-orange-500/5"
                  : "border-white/10 hover:border-white/25"
              }`}
            >
              <div className="flex items-center gap-2">
                <p className="font-medium">{preset.label}</p>
                {isActive ? (
                  <span className="text-xs uppercase tracking-wide text-orange-400">
                    Active
                  </span>
                ) : null}
              </div>

              <p className="mt-2 text-sm text-muted-foreground">
                {preset.description}
              </p>

              <div className="mt-4 flex gap-3 overflow-x-auto">
                {(["hook", "cta"] as const).map((kind) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={kind}
                    src={sampleSrc(preset, kind)}
                    alt={`${preset.label} ${kind} slide sample`}
                    width={160}
                    height={200}
                    loading="lazy"
                    className="rounded border border-white/10 shrink-0"
                  />
                ))}
              </div>

              <p className="mt-4 text-xs text-muted-foreground">
                {preset.imageSummary}
                {preset.hasPreview ? null : " (sample image not generated yet)"}
              </p>
            </button>
          );
        })}
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
