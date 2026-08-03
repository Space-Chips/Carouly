"use client";

import { useState } from "react";

import SampleSlide from "@/components/SampleSlide";
import { listPresets, presetPreviewSrc } from "@/lib/presets";
import { SAMPLE_CAROUSEL } from "@/lib/sample-carousel";
import { PresetId } from "@/types";

const kindLabel: Record<string, string> = {
  hook: "Hook",
  insight: "Value",
  cta: "The only pitch",
};

/**
 * The full four slide sequence, with the preset switch as its only control.
 *
 * A preset owns the palette, the type and the look of the generated image
 * together, so flipping one is the clearest possible demonstration of what a
 * visitor is actually choosing — and it is the one thing on this page they can
 * operate. Only presets with a committed sample image are offered, because the
 * hook slide would otherwise fall back to a bare background and the comparison
 * would be dishonest.
 *
 * Each slide is captioned with its job, because the whole pitch is that three
 * of the four give something away before the fourth asks for anything.
 */
export default function SampleCarousel({ width = 232 }: { width?: number }) {
  const options = listPresets().filter((option) => option.hasPreview);
  // Opens on the look a new brand is actually given, so the first thing a
  // visitor sees here is the thing they get if they never touch the picker.
  const [preset, setPreset] = useState<PresetId>("grain");

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-dim">
          Look
        </span>
        <div
          role="group"
          aria-label="Carousel look"
          className="flex gap-1 rounded-full border border-hair p-1"
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setPreset(option.id)}
              aria-pressed={option.id === preset}
              className={`rounded-full px-3 py-1 text-sm outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ember ${
                option.id === preset
                  ? "bg-ember/15 text-ember-lit"
                  : "text-dim hover:text-bone"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <ol className="mt-8 flex gap-4 overflow-x-auto pb-4">
        {SAMPLE_CAROUSEL.map((slide, index) => (
          <li key={slide.heading} className="shrink-0">
            <SampleSlide
              slide={slide}
              index={index}
              total={SAMPLE_CAROUSEL.length}
              width={width}
              preset={preset}
              backgroundUrl={
                slide.kind === "hook" ? presetPreviewSrc(preset) : undefined
              }
              className="transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-2"
            />
            <p
              className={`mt-3 font-mono text-xs uppercase tracking-[0.2em] ${
                slide.kind === "cta" ? "text-ember-lit" : "text-dim"
              }`}
            >
              {String(index + 1).padStart(2, "0")} · {kindLabel[slide.kind]}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
