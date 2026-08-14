"use client";

import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";

const sections = [
  { href: "#work", label: "What it makes" },
  { href: "#run", label: "How it works" },
  { href: "#faq", label: "Questions" },
];

/**
 * The marketing nav: a floating white pill detached from the top edge, so the
 * hero reads as a full canvas with something resting on it rather than as a page
 * sitting under a header bar. The app keeps its ordinary sticky header — see
 * components/Navbar.tsx, which hands off to this component only on "/".
 *
 * The active link is marked by a filled capsule rather than a colour change.
 * On paper a grey-to-black text shift at 14px is nearly invisible, and the
 * capsule also gives the pill something to do while you scroll.
 */
export default function LandingNav() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  // Which section the reader is actually in.
  //
  // The observer's root margin collapses the viewport to a single line at 40%
  // of its height, so a callback fires exactly when a section boundary crosses
  // that line and at no other time. The handler then recomputes from every
  // section's position rather than trusting the entry that woke it: entries
  // arrive one at a time, and a fast scroll can cross two boundaries inside a
  // single callback. This is why it is not a scroll listener — there is no
  // per-frame work here at all.
  useEffect(() => {
    const elements = sections
      .map((section) => document.getElementById(section.href.slice(1)))
      .filter((element): element is HTMLElement => Boolean(element));

    if (!elements.length) return;

    const resolve = () => {
      const line = window.innerHeight * 0.4;
      let current: string | null = null;

      for (const element of elements) {
        if (element.getBoundingClientRect().top <= line) current = element.id;
      }

      setActive(current);
    };

    // No separate initial pass: an observer queues a notification for every
    // target as soon as it starts observing, and that lands after the browser
    // has settled any anchor in the URL. Resolving by hand at mount instead
    // reads position zero on an anchored load and lights nothing.
    const observer = new IntersectionObserver(resolve, {
      rootMargin: "-40% 0px -60% 0px",
    });

    for (const element of elements) observer.observe(element);

    return () => observer.disconnect();
  }, []);

  // A screen filling overlay that scrolls the page behind it is disorienting,
  // and Escape has to close it for anyone not using a pointer.
  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const solidCta =
    "rounded-full bg-graphite px-3 py-2 text-sm font-semibold text-white outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-graphite/85 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-graphite focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-50 mt-6 flex justify-center px-4">
        <nav
          aria-label="Main"
          className="pointer-events-auto flex w-max items-center gap-2 rounded-full border border-rule bg-paper-lift/80 p-2 shadow-[0_1px_2px_rgba(12,10,9,0.04),0_8px_24px_-12px_rgba(12,10,9,0.2)] backdrop-blur-xl md:gap-2 md:pl-4"
        >
          <Link
            href="/"
            aria-current="page"
            className="rounded-full px-2 text-sm font-semibold tracking-tight text-graphite outline-none focus-visible:ring-2 focus-visible:ring-graphite md:px-0 md:pr-2"
          >
            Carouly
          </Link>

          <ul className="hidden items-center md:flex">
            {sections.map((section) => {
              const current = active === section.href.slice(1);

              return (
                <li key={section.href}>
                  <a
                    href={section.href}
                    aria-current={current ? "true" : undefined}
                    // Nested radius: the 24px pill has 8px of padding, which
                    // would give 16px — but a capsule inside a capsule has to
                    // stay a capsule, so this one keeps its full round.
                    className={`block rounded-full px-3 py-2 text-sm outline-none transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-graphite ${
                      current
                        ? "bg-paper-sunk font-semibold text-graphite"
                        : "text-mute hover:text-graphite"
                    }`}
                  >
                    {/* Both copies share one grid cell. The hidden semibold one
                        sets the width, so the pill cannot resize as the active
                        item changes and shove the whole nav sideways. */}
                    <span className="grid">
                      <span
                        aria-hidden
                        className="invisible col-start-1 row-start-1 font-semibold"
                      >
                        {section.label}
                      </span>
                      <span className="col-start-1 row-start-1">
                        {section.label}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>

          <div className="hidden items-center gap-2 md:flex">
            <Show when="signed-out">
              <SignInButton>
                <button className="rounded-full px-3 py-2 text-sm text-mute outline-none transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-graphite focus-visible:ring-2 focus-visible:ring-graphite">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton>
                <button className={solidCta}>Start free</button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link href="/studio" className={solidCta}>
                Open the studio
              </Link>
            </Show>
          </div>

          {/* Two lines that rotate into an X in place. They never fade out and
              swap for a close glyph — the shape itself has to travel. */}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="relative size-8 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-graphite md:hidden"
          >
            <span
              className={`absolute left-1/2 top-1/2 block h-px w-4 -translate-x-1/2 bg-graphite transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                open ? "-translate-y-1/2 rotate-45" : "-translate-y-[5px]"
              }`}
            />
            <span
              className={`absolute left-1/2 top-1/2 block h-px w-4 -translate-x-1/2 bg-graphite transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                open ? "-translate-y-1/2 -rotate-45" : "translate-y-[3px]"
              }`}
            />
          </button>
        </nav>
      </header>

      {/* Kept mounted so the links can animate out as well as in. */}
      <div
        aria-hidden={!open}
        className={`fixed inset-0 z-40 bg-paper/80 backdrop-blur-3xl transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <ul className="flex h-full flex-col justify-center gap-8 px-8">
          {sections.map((section, index) => (
            <li
              key={section.href}
              style={{ transitionDelay: `${open ? index * 60 + 80 : 0}ms` }}
              className={`overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                open
                  ? "translate-y-0 opacity-100"
                  : "translate-y-12 opacity-0"
              }`}
            >
              <a
                href={section.href}
                onClick={() => setOpen(false)}
                aria-current={
                  active === section.href.slice(1) ? "true" : undefined
                }
                className={`block rounded-lg text-3xl font-semibold tracking-tight outline-none transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-graphite ${
                  active === section.href.slice(1)
                    ? "text-graphite"
                    : "text-mute"
                }`}
              >
                {section.label}
              </a>
            </li>
          ))}

          <li
            style={{ transitionDelay: `${open ? 260 : 0}ms` }}
            className={`mt-4 flex flex-col gap-4 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              open ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
            }`}
          >
            <Show when="signed-out">
              <SignUpButton>
                <button className="w-full rounded-full bg-graphite px-3 py-2 text-base font-semibold text-white outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-graphite/85 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-graphite">
                  Start free
                </button>
              </SignUpButton>
              <SignInButton>
                <button className="rounded-full text-base text-mute outline-none transition-colors hover:text-graphite focus-visible:ring-2 focus-visible:ring-graphite">
                  Sign in
                </button>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <Link
                href="/studio"
                onClick={() => setOpen(false)}
                className="w-full rounded-full bg-graphite px-3 py-2 text-center text-base font-semibold text-white outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-graphite/85 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-graphite"
              >
                Open the studio
              </Link>
            </Show>
          </li>
        </ul>
      </div>
    </>
  );
}
