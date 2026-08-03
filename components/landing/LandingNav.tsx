"use client";

import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";

const sections = [
  { href: "#example", label: "What it posts" },
  { href: "#run", label: "How it works" },
  { href: "#faq", label: "Questions" },
];

/**
 * The marketing nav: a floating pill detached from the top edge, so the hero
 * reads as a full canvas with something resting on it rather than as a page
 * sitting under a header bar. The app keeps its ordinary sticky header — see
 * components/Navbar.tsx, which hands off to this component only on "/".
 */
export default function LandingNav() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  // Nothing is lit until the first section clears the trigger line, which is
  // exactly the span the hero owns. While the hero's own ember button is on
  // screen the nav must not show a second one: two identical primary buttons
  // 500px apart do not double the pull, they split it.
  const inHero = active === null;

  // Same box in both states — a border in the quiet state and a matching one
  // under the fill — so the pill cannot change width as it warms up and shove
  // the links sideways mid scroll.
  const navCta = inHero
    ? "border-white/15 bg-transparent text-bone hover:border-white/30 hover:bg-white/5"
    : "border-ember bg-ember text-white hover:border-ember-lit hover:bg-ember-lit";

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

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-50 mt-6 flex justify-center px-4">
        <nav
          aria-label="Main"
          className="pointer-events-auto flex w-max items-center gap-2 rounded-full border border-white/10 bg-black/60 p-2 backdrop-blur-xl md:gap-6 md:pl-6"
        >
          <Link
            href="/"
            aria-current="page"
            className="rounded-full px-2 text-sm font-semibold tracking-tight text-bone outline-none focus-visible:ring-2 focus-visible:ring-ember md:px-0"
          >
            Carouly
          </Link>

          <ul className="hidden items-center gap-6 md:flex">
            {sections.map((section) => {
              const current = active === section.href.slice(1);

              return (
                <li key={section.href}>
                  <a
                    href={section.href}
                    aria-current={current ? "true" : undefined}
                    className="rounded-full text-sm outline-none focus-visible:ring-2 focus-visible:ring-ember"
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
                      <span
                        className={`col-start-1 row-start-1 transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                          current
                            ? "font-semibold text-bone"
                            : "text-dim hover:text-bone"
                        }`}
                      >
                        {section.label}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>

          <div className="hidden items-center gap-4 md:flex">
            <SignedOut>
              <SignInButton>
                <button className="rounded-full text-sm text-dim outline-none transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-bone focus-visible:ring-2 focus-visible:ring-ember">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton>
                <button
                  className={`rounded-full border px-3 py-2 text-sm font-semibold outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2 focus-visible:ring-offset-black ${navCta}`}
                >
                  Automate now
                </button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <Link
                href="/dashboard"
                className={`rounded-full border px-3 py-2 text-sm font-semibold outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2 focus-visible:ring-offset-black ${navCta}`}
              >
                Back to autopilot
              </Link>
            </SignedIn>
          </div>

          {/* Two lines that rotate into an X in place. They never fade out and
              swap for a close glyph — the shape itself has to travel. */}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="relative size-8 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ember md:hidden"
          >
            <span
              className={`absolute left-1/2 top-1/2 block h-px w-4 -translate-x-1/2 bg-bone transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                open ? "-translate-y-1/2 rotate-45" : "-translate-y-[5px]"
              }`}
            />
            <span
              className={`absolute left-1/2 top-1/2 block h-px w-4 -translate-x-1/2 bg-bone transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                open ? "-translate-y-1/2 -rotate-45" : "translate-y-[3px]"
              }`}
            />
          </button>
        </nav>
      </header>

      {/* Kept mounted so the links can animate out as well as in. */}
      <div
        aria-hidden={!open}
        className={`fixed inset-0 z-40 bg-black/80 backdrop-blur-3xl transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden ${
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
                className={`block text-3xl font-semibold tracking-tight outline-none transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-ember ${
                  active === section.href.slice(1) ? "text-bone" : "text-dim"
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
            <SignedOut>
              <SignUpButton>
                <button className="w-full rounded-full bg-ember px-3 py-2 text-base font-semibold text-white outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-ember-lit active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ember">
                  Automate now
                </button>
              </SignUpButton>
              <SignInButton>
                <button className="text-base text-dim outline-none transition-colors hover:text-bone focus-visible:ring-2 focus-visible:ring-ember">
                  Sign in
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="w-full rounded-full bg-ember px-3 py-2 text-center text-base font-semibold text-white outline-none transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-ember-lit active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ember"
              >
                Back to autopilot
              </Link>
            </SignedIn>
          </li>
        </ul>
      </div>
    </>
  );
}
