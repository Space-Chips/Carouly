"use client";

import type { CSSProperties } from "react";

import { useHeroStage } from "@/components/landing/HeroStage";
import ReelCard from "@/components/landing/ReelCard";
import { HERO_REELS } from "@/lib/reels";

/**
 * The hero's proof, laid out as a fan that runs off the bottom of the section.
 *
 * A grid of thumbnails would read as a gallery you are meant to browse. A fan
 * that is cut off reads as a stack that keeps going, which is the claim the
 * headline just made. The frames sit in a shallow bowl — the middle pair
 * upright and highest, the outer pair dropped and rotated — so the eye lands
 * back on the composer above rather than sliding off the edge.
 *
 * On load it deals itself out. The stagger runs from the centre outward rather
 * than left to right: the middle pair are the ones directly under the composer,
 * so they are what the eye is already on when the animation starts, and the
 * outer frames arriving late is what makes the fan feel like it is opening
 * rather than sliding past.
 */

/* Exact desktop slot values from the reference hero. These are pixels—not
   viewport units—so the card spacing stays compact on wide screens. */
const SLOTS = [
  { x: -540, y: 22, rotate: -10, scale: .9, z: 1 },
  { x: -324, y: 8, rotate: -6, scale: .94, z: 2 },
  { x: -108, y: -4, rotate: -2, scale: .98, z: 3 },
  { x: 108, y: -4, rotate: 2, scale: .98, z: 3 },
  { x: 324, y: 8, rotate: 6, scale: .94, z: 2 },
  { x: 540, y: 22, rotate: 10, scale: .9, z: 1 },
];

const cardStyle = (slot: typeof SLOTS[number], index: number) => ({
  "--card-x": `${slot.x}px`,
  "--card-y": `${slot.y}px`,
  "--card-rotate": `${slot.rotate}deg`,
  "--card-scale": String(slot.scale),
  "--card-delay": `${2.3 + index * .24}s`,
  zIndex: slot.z,
} as CSSProperties);

export default function ReelFan() {
  const { movedUp } = useHeroStage();

  return (
    <div
      aria-hidden
      // The crop is intentional: the proof frames run below the fold, which
      // makes the hero feel like a live feed instead of a static gallery.
      className={`hero-card-stage pointer-events-none relative h-60 overflow-hidden sm:h-80 lg:h-[22rem] ${movedUp ? "hero-cards-live" : ""}`}
    >
      <div className="relative h-full">
        {HERO_REELS.map((reel, index) => (
          <div
            key={reel.title}
            style={cardStyle(SLOTS[index], index)}
            className={`hero-card absolute left-1/2 top-0 w-[clamp(9.5rem,19vw,15.1875rem)] ${index === SLOTS.length - 1 ? "hero-card-lead" : "hero-card-static"}`}
          >
            <ReelCard reel={reel} />
          </div>
        ))}
      </div>
    </div>
  );
}
