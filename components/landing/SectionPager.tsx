"use client";

import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

/**
 * Two buttons pinned to the right edge that step through the page a section at
 * a time.
 *
 * The page is long and every section is a full stop, so a reader who is
 * scanning rather than reading has a way to move in the units the page is
 * actually built in. It is an addition to scrolling, never a replacement:
 * nothing is hijacked, the wheel still does exactly what it always did.
 *
 * Hidden from screen readers and from keyboard order. It duplicates navigation
 * that the nav links and the page order already provide, so exposing it a
 * second time is noise rather than access — and a control whose only job is
 * "go down a bit" has nothing to announce.
 */
export default function SectionPager() {
  const [at, setAt] = useState(0);
  const [count, setCount] = useState(0);

  const stops = useCallback(
    () => [...document.querySelectorAll<HTMLElement>("main > section")],
    []
  );

  useEffect(() => {
    const sections = stops();
    setCount(sections.length);

    if (!sections.length) return;

    // The same trick the nav uses: collapse the viewport to a line a third of
    // the way down and recompute from every section's position when anything
    // crosses it, rather than trusting the entry that fired. No scroll
    // listener, so no per-frame work.
    const resolve = () => {
      const line = window.innerHeight * 0.34;
      let current = 0;

      sections.forEach((section, index) => {
        if (section.getBoundingClientRect().top <= line) current = index;
      });

      setAt(current);
    };

    const observer = new IntersectionObserver(resolve, {
      rootMargin: "-34% 0px -66% 0px",
    });

    for (const section of sections) observer.observe(section);

    return () => observer.disconnect();
  }, [stops]);

  const go = (delta: number) => {
    const sections = stops();
    const next = Math.min(Math.max(at + delta, 0), sections.length - 1);

    // Someone who asked for less motion asked for less of this most of all:
    // a smooth scroll over a full section is the longest movement on the page.
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    sections[next]?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
  };

  if (count < 2) return null;

  const box =
    "grid size-9 place-items-center rounded-xl border border-rule bg-paper-lift/80 text-mute shadow-[0_1px_2px_rgba(12,10,9,0.04)] backdrop-blur transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-graphite active:scale-[0.96] disabled:opacity-40 disabled:hover:text-mute";

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-2 lg:flex"
    >
      <button
        type="button"
        tabIndex={-1}
        disabled={at === 0}
        onClick={() => go(-1)}
        className={`pointer-events-auto ${box}`}
      >
        <CaretUp weight="bold" className="size-4" />
      </button>
      <button
        type="button"
        tabIndex={-1}
        disabled={at === count - 1}
        onClick={() => go(1)}
        className={`pointer-events-auto ${box}`}
      >
        <CaretDown weight="bold" className="size-4" />
      </button>
    </div>
  );
}
