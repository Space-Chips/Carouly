"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * The large type moment: a statement that starts nearly unlit and warms up one
 * word at a time as it crosses a line two thirds up the viewport.
 *
 * Two mechanics stacked, because either alone is wrong:
 *  - one IntersectionObserver per word, with a bottom root margin that puts
 *    the trigger at 65% of the viewport height. That is what makes the reveal
 *    track the scroll instead of firing the whole block at once.
 *  - a per word delay derived from its position *within its own line*, read
 *    from the DOM after layout. Every word on a line crosses the trigger in
 *    the same frame, so without this a line would flip as a unit.
 *
 * The line grouping is measured rather than assumed, so it stays correct when
 * the text rewraps at a different breakpoint.
 */
export default function TaglineReveal({
  text,
  tone = "ink",
  className = "",
}: {
  text: string;
  /** Which ground it sits on. The marketing page is on paper, the app is not. */
  tone?: "ink" | "paper";
  className?: string;
}) {
  // Roughly a third of the base text colour when unlit, in both directions, so
  // the warm-up reads the same whichever surface the section lands on.
  const [dark, light] =
    tone === "paper"
      ? ["text-graphite", "text-graphite/30"]
      : ["text-bone", "text-bone/30"];

  // Memoised so it is a stable effect dependency rather than a new array on
  // every render.
  const words = useMemo(() => text.split(" "), [text]);
  const containerRef = useRef<HTMLParagraphElement>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [lit, setLit] = useState<boolean[]>(() => words.map(() => false));
  const [delays, setDelays] = useState<number[]>(() => words.map(() => 0));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Reduced motion, or a document that is never composited and so never
    // delivers an intersection. See the same guard in Reveal.
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.visibilityState === "hidden"
    ) {
      setLit(words.map(() => true));
      return;
    }

    // Group by vertical position: same offsetTop means same rendered line.
    const measure = () => {
      const tops = wordRefs.current.map((node) => node?.offsetTop ?? 0);
      let lineStart = 0;

      setDelays(
        tops.map((top, index) => {
          if (index > 0 && top !== tops[index - 1]) lineStart = index;
          return (index - lineStart) * 55;
        })
      );
    };

    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const index = Number(
            (entry.target as HTMLElement).dataset.index ?? "-1"
          );
          if (index < 0) continue;

          setLit((previous) => {
            if (previous[index]) return previous;
            const next = [...previous];
            next[index] = true;
            return next;
          });

          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -35% 0px" }
    );

    for (const node of wordRefs.current) {
      if (node) observer.observe(node);
    }

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, [words]);

  return (
    <p
      ref={containerRef}
      className={`balance max-w-[680px] ${className}`}
    >
      {words.map((word, index) => (
        // The space sits outside the animated span. A trailing space inside an
        // inline-block is collapsed away, which welds every word to the next.
        <span key={`${word}-${index}`}>
          <span
            data-index={index}
            ref={(node) => {
              wordRefs.current[index] = node;
            }}
            style={{ transitionDelay: `${delays[index]}ms` }}
            className={`inline-block transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
              lit[index] ? dark : light
            }`}
          >
            {word}
          </span>
          {index < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}
