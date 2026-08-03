"use client";

import { useEffect, useRef } from "react";

export type DotIconShape = "brand" | "rank" | "design" | "post";

/**
 * A huge icon drawn entirely out of dots, meant to be anchored to a corner and
 * clipped by its container so only part of it is ever visible.
 *
 * It shares the hero field's vocabulary — staggered rows, the same dot sizes,
 * the same click pulse — so the two read as one system rather than as a canvas
 * effect plus an icon set. Shapes are built from filled primitives instead of
 * SVG path data because the sampler asks "is this point inside the fill?", and
 * a stroked outline has no inside to speak of.
 *
 * Idle cost is zero: it draws once and only starts a loop while a pulse is
 * alive.
 */
export default function DotIcon({
  shape,
  size = 320,
  spacing = 11,
  className = "",
  color = "#EDE9E3",
}: {
  shape: DotIconShape;
  size?: number;
  spacing?: number;
  className?: string;
  color?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Sample once: which grid points land inside the shape never changes.
    const scale = size / 100;
    const path = buildShape(shape, scale);
    const dots: { x: number; y: number; alpha: number }[] = [];

    // isPointInPath applies the current transform to the path but takes the
    // point untransformed, so sampling under the DPR scale tests the grid
    // against a double-size shape — which lands almost entirely outside the
    // canvas. Sample under identity, then restore the drawing transform.
    context.setTransform(1, 0, 0, 1, 0, 0);

    const rowStep = spacing * 0.86;
    let row = 0;

    for (let y = rowStep / 2; y < size; y += rowStep, row++) {
      const stagger = row % 2 ? spacing / 2 : 0;

      for (let x = spacing / 2 + stagger; x < size; x += spacing) {
        if (!context.isPointInPath(path, x, y)) continue;

        // Brightest at the top-left — the part that stays inside the card once
        // the bottom-right is clipped away — and thinning toward the crop, so
        // the shape dissolves outward instead of being cut off mid-strength.
        const inward = 1 - ((x / size) * 0.5 + (y / size) * 0.5);
        dots.push({ x, y, alpha: 0.1 + 0.42 * inward * inward });
      }
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    type Pulse = { x: number; y: number; born: number };
    let pulses: Pulse[] = [];
    let frame = 0;

    const PULSE_LIFE = 1.5;
    const PULSE_SPEED = 420;
    const PULSE_BAND = 40;

    const draw = (elapsed: number) => {
      context.clearRect(0, 0, size, size);

      for (const dot of dots) {
        let lift = 0;

        for (const pulse of pulses) {
          const age = elapsed - pulse.born;
          const distance = Math.hypot(dot.x - pulse.x, dot.y - pulse.y);
          const offset = (distance - age * PULSE_SPEED) / PULSE_BAND;
          const band = Math.exp(-offset * offset);

          if (band < 0.02) continue;

          const fade = 1 - age / PULSE_LIFE;
          lift += band * fade * fade;
        }

        const alpha = Math.min(0.9, dot.alpha * (1 + lift * 2.2));
        const radius = 1.5 + lift * 2;

        context.beginPath();
        context.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
        context.fillStyle = withAlpha(color, alpha);
        context.fill();
      }
    };

    const loop = () => {
      const elapsed = performance.now() / 1000;
      pulses = pulses.filter((pulse) => elapsed - pulse.born < PULSE_LIFE);

      draw(elapsed);

      // Stop as soon as the last pulse dies — this is a static icon otherwise.
      if (!pulses.length) {
        frame = 0;
        return;
      }

      frame = requestAnimationFrame(loop);
    };

    // The canvas is pointer-events-none so it cannot swallow clicks meant for
    // the card. The surface that *should* trigger it is marked by the parent.
    const surface =
      (canvas.closest("[data-dot-surface]") as HTMLElement | null) ??
      canvas.parentElement;

    const onPointerDown = (event: PointerEvent) => {
      if (reduceMotion || !surface) return;

      const surfaceRect = surface.getBoundingClientRect();

      if (
        event.clientX < surfaceRect.left ||
        event.clientX > surfaceRect.right ||
        event.clientY < surfaceRect.top ||
        event.clientY > surfaceRect.bottom
      ) {
        return;
      }

      const rect = canvas.getBoundingClientRect();

      pulses = [
        ...pulses.slice(-2),
        {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          born: performance.now() / 1000,
        },
      ];

      if (!frame) frame = requestAnimationFrame(loop);
    };

    draw(performance.now() / 1000);
    window.addEventListener("pointerdown", onPointerDown, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [shape, size, spacing, color]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`pointer-events-none ${className}`}
    />
  );
}

/** Shapes live in a 100x100 space and are scaled to the canvas. */
const buildShape = (shape: DotIconShape, scale: number): Path2D => {
  const path = new Path2D();
  const s = (n: number) => n * scale;

  const rounded = (x: number, y: number, w: number, h: number, r: number) => {
    path.moveTo(s(x + r), s(y));
    path.arcTo(s(x + w), s(y), s(x + w), s(y + h), s(r));
    path.arcTo(s(x + w), s(y + h), s(x), s(y + h), s(r));
    path.arcTo(s(x), s(y + h), s(x), s(y), s(r));
    path.arcTo(s(x), s(y), s(x + w), s(y), s(r));
    path.closePath();
  };

  switch (shape) {
    // A person: the brand you describe once.
    case "brand":
      path.moveTo(s(67), s(32));
      path.arc(s(50), s(32), s(17), 0, Math.PI * 2);
      rounded(20, 58, 60, 46, 22);
      break;

    // Ranked bars: the scored keyword bank.
    case "rank":
      rounded(16, 62, 17, 34, 5);
      rounded(41, 42, 17, 54, 5);
      rounded(66, 22, 17, 74, 5);
      break;

    // A stack of slides: the carousel that gets designed.
    case "design":
      rounded(28, 12, 44, 20, 6);
      rounded(22, 38, 56, 20, 6);
      rounded(16, 64, 68, 20, 6);
      break;

    // A dart: it posts itself.
    case "post":
      path.moveTo(s(12), s(48));
      path.lineTo(s(88), s(14));
      path.lineTo(s(66), s(90));
      path.lineTo(s(48), s(60));
      path.closePath();
      break;
  }

  return path;
};

const withAlpha = (hex: string, alpha: number) => {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
