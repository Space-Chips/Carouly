"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll entrance for a block of marketing content.
 *
 * Heavy and slow on purpose: 64px of travel with a blur that resolves, over
 * 800ms on a spring-shaped curve, so sections arrive with mass rather than
 * popping. It fires once and then disconnects — a section that re-animates
 * every time it re-enters the viewport reads as a screensaver.
 *
 * IntersectionObserver rather than a scroll listener: a scroll handler on a
 * page this long recalculates layout on every frame of a flick scroll.
 */
export default function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
}: {
  children: React.ReactNode;
  /** Milliseconds. Use to sequence siblings, not to slow a single block. */
  delay?: number;
  as?: "div" | "section" | "li" | "article";
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }

    // A document that is never composited (headless screenshotters, prerender
    // services, a background tab) never delivers an intersection, which would
    // leave every section below the hero at opacity 0 forever. Nobody is
    // watching the animation in that state, so skip straight to the end.
    if (document.visibilityState === "hidden") {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      // Trigger a little before the block is fully on screen, so the movement
      // is over by the time it reaches a comfortable reading position.
      { rootMargin: "0px 0px -12% 0px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      // The union of intrinsic tags narrows the ref to their intersection,
      // which no single element satisfies. The observer only needs an Element.
      ref={ref as React.Ref<never>}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-[800ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
        shown
          ? "translate-y-0 opacity-100 blur-0"
          : "translate-y-16 opacity-0 blur-md"
      } ${className}`}
    >
      {children}
    </Tag>
  );
}
