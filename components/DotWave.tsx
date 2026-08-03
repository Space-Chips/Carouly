"use client";

import { useEffect, useRef } from "react";

/**
 * The hero's dot field: a staggered field of dots whose size and brightness
 * ride a slow travelling wave, fading out on every side so it dissolves into
 * the page instead of ending on a hard edge.
 *
 * Deliberate constraints:
 *  - it never competes with the headline. The field is dimmed hardest on the
 *    left, which is exactly where the copy sits, and densest out to the right.
 *    Its ceiling is low on purpose: the right of the hero is empty, and a
 *    field bright enough to read as a panel makes that emptiness look like a
 *    column someone forgot to fill rather than deliberate negative space
 *  - rows are offset by half a step, so it reads as a field rather than as
 *    graph paper — a square lattice draws the eye to its own rows and columns
 *  - the accent is blended in across a range rather than switched on past a
 *    threshold, which otherwise makes isolated dots pop like dead pixels
 *  - it stops entirely when scrolled out of view or the tab is hidden, so an
 *    idle marketing page costs nothing
 *  - prefers-reduced-motion renders a single static frame rather than nothing,
 *    so the composition still reads, and click pulses are skipped
 *  - the pointer nudges nearby dots; a click sends a pulse through them
 */
export default function DotWave({
  className = "",
  spacing = 24,
  accent = "#C4552F",
}: {
  className?: string;
  spacing?: number;
  accent?: string;
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

    let width = 0;
    let height = 0;
    let frame = 0;
    let time = 0;
    let visible = true;
    const pointer = { x: -9999, y: -9999 };

    /**
     * Click pulses. A ring expands from the click and dots crest as it passes,
     * so the whole field registers the click rather than just the dot under
     * the cursor. Capped because each one costs a term per dot per frame.
     */
    type Pulse = { x: number; y: number; born: number };
    let pulses: Pulse[] = [];

    const PULSE_LIFE = 1.9; // seconds
    const PULSE_SPEED = 620; // px/second
    const PULSE_BAND = 46; // px — thickness of the crest

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (elapsed: number) => {
      context.clearRect(0, 0, width, height);

      // Fade distances: the field must dissolve on every side, or the grid
      // ends on a visible straight line.
      const fadeX = width * 0.2;
      const fadeY = height * 0.26;

      const rowStep = spacing * 0.86; // hex-ish packing
      let row = 0;

      for (let y = rowStep / 2; y < height + rowStep; y += rowStep, row++) {
        const stagger = row % 2 ? spacing / 2 : 0;

        for (let x = spacing / 2 + stagger; x < width + spacing; x += spacing) {
          // Two out-of-phase waves so the pattern never visibly repeats.
          const wave =
            Math.sin(x * 0.0075 + time) * 0.5 +
            Math.sin((x * 0.5 + y * 1.1) * 0.008 - time * 0.7) * 0.5;

          let level = (wave + 1) / 2; // 0..1

          // A little drift, but less than the wave — the field should breathe,
          // not slosh.
          let offsetX = Math.sin(y * 0.016 + time * 0.9) * 2.2 * level;
          let offsetY = Math.cos(x * 0.014 + time * 0.7) * 2.2 * level;

          // Pointer proximity lifts dots and nudges them aside — a hint, not
          // a spotlight.
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const pointerDistance = Math.hypot(dx, dy);

          if (pointerDistance < 160) {
            const influence = 1 - pointerDistance / 160;
            level += influence * 0.4;

            if (pointerDistance > 0.001) {
              const push = influence * influence * 6;
              offsetX += (dx / pointerDistance) * push;
              offsetY += (dy / pointerDistance) * push;
            }
          }

          let pulseLift = 0;

          for (const pulse of pulses) {
            const age = elapsed - pulse.born;
            const distance = Math.hypot(x - pulse.x, y - pulse.y);
            const ring = age * PULSE_SPEED;
            const offset = (distance - ring) / PULSE_BAND;

            // Gaussian band: only dots the ring is currently crossing react.
            const band = Math.exp(-offset * offset);
            if (band < 0.02) continue;

            const fade = 1 - age / PULSE_LIFE;
            const strength = band * fade * fade;

            pulseLift += strength;

            if (distance > 0.001) {
              const push = strength * 9;
              offsetX += ((x - pulse.x) / distance) * push;
              offsetY += ((y - pulse.y) / distance) * push;
            }
          }

          level = Math.min(level + pulseLift, 1);

          // Soft edges on all four sides. The horizontal ramp is deliberately
          // asymmetric: dimmest behind the copy on the left.
          const edge =
            smoothstep(x / fadeX) *
            smoothstep((width - x) / fadeX) *
            smoothstep(y / fadeY) *
            smoothstep((height - y) / fadeY);

          const lateral = 0.18 + 0.82 * smoothstep(x / (width * 0.8));
          const falloff = edge * lateral;
          const alpha = (0.03 + level * 0.28) * falloff;

          if (alpha < 0.015) continue;

          const radius = 0.6 + level * 1.6 + pulseLift * 1.4;

          context.beginPath();
          context.arc(x + offsetX, y + offsetY, radius, 0, Math.PI * 2);
          // Accent blends in over the top of the range instead of switching
          // on, so crests warm up gradually.
          context.fillStyle = mix(
            BASE_RGB,
            accentRgb,
            smoothstep((level - 0.72) / 0.28),
            Math.min(1, alpha * (1 + pulseLift))
          );
          context.fill();
        }
      }
    };

    const accentRgb = toRgb(accent);

    const loop = (now: number) => {
      const elapsed = now / 1000;

      time += 0.005;
      pulses = pulses.filter((pulse) => elapsed - pulse.born < PULSE_LIFE);
      draw(elapsed);

      frame = requestAnimationFrame(loop);
    };

    const start = () => {
      if (reduceMotion || frame) return;
      frame = requestAnimationFrame(loop);
    };

    const stop = () => {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
    };

    const onPointerLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
    };

    // The canvas itself is pointer-events-none so it never swallows a click on
    // the buttons above it; the listener lives on the window and filters by
    // hit area instead.
    const onPointerDown = (event: PointerEvent) => {
      if (reduceMotion) return;

      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

      pulses = [...pulses.slice(-4), { x, y, born: performance.now() / 1000 }];
      start();
    };

    const onVisibilityChange = () => {
      if (document.hidden || !visible) stop();
      else start();
    };

    resize();
    draw(performance.now() / 1000);
    if (!reduceMotion) start();

    const resizeObserver = new ResizeObserver(() => {
      resize();
      draw(performance.now() / 1000);
    });
    resizeObserver.observe(canvas);

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        onVisibilityChange();
      },
      { threshold: 0 }
    );
    intersectionObserver.observe(canvas);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [spacing, accent]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}

/** Clamped ease — 0 at the edge, 1 past the fade distance, no hard step. */
const smoothstep = (t: number) => {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
};

const BASE_RGB: [number, number, number] = [237, 233, 227];

const toRgb = (hex: string): [number, number, number] => {
  const value = hex.replace("#", "");

  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
};

const mix = (
  from: [number, number, number],
  to: [number, number, number],
  t: number,
  alpha: number
) => {
  const r = Math.round(from[0] + (to[0] - from[0]) * t);
  const g = Math.round(from[1] + (to[1] - from[1]) * t);
  const b = Math.round(from[2] + (to[2] - from[2]) * t);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
