"use client";

import { ArrowSquareOut, X } from "@phosphor-icons/react";
import Link from "next/link";

import { isPlaceholder, Player } from "@/components/studio/artifacts";
import type { collectState } from "@/components/studio/thread";

/**
 * What the run knows, as opposed to what it did.
 *
 * The thread is time: the palette arrives at the moment it is derived and then
 * scrolls away. This is state: the same palette, still to hand forty rows later.
 * Splitting them is what stops the transcript from having to double as a
 * dashboard, which is the failure mode of every agent UI that only has a thread.
 *
 * It closes, because on a laptop it is 320px that the transcript would rather
 * have, and because there is nothing in here you need while you are reading.
 */
export default function Inspector({
  site,
  state,
  kept,
  open,
  onClose,
}: {
  site: string | null;
  state: ReturnType<typeof collectState>;
  /** What this run has recorded into the library so far. */
  kept: { id: string; kind: string; name: string }[];
  open: boolean;
  onClose: () => void;
}) {
  const empty = !site;

  return (
    <aside
      aria-label="The kit"
      aria-hidden={!open}
      // `min-w-0` is load-bearing: a flex item defaults to `min-width: auto`,
      // so `w-0` alone leaves the panel at its content width.
      // Floats over the transcript on a narrow screen rather than squeezing it.
      className={`min-w-0 shrink-0 overflow-hidden border-l border-rule bg-paper-lift/60 transition-[width] duration-300 ease-[var(--ease-glide)] max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:bg-paper-lift max-lg:shadow-[-8px_0_32px_-16px_rgba(12,10,9,0.5)] ${
        open ? "w-80" : "w-0 border-l-0"
      }`}
    >
      <div className="flex h-full w-80 flex-col">
        <div className="flex items-center justify-between border-b border-rule px-4 py-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
            The kit
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide the kit"
            className="grid size-7 place-items-center rounded-md text-mute transition-colors duration-150 hover:bg-paper-sunk hover:text-graphite focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-graphite"
          >
            <X weight="bold" aria-hidden className="size-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {empty ? (
            <p className="pretty text-sm leading-relaxed text-mute">
              Colours, logo and the claims it can prove collect here.
            </p>
          ) : (
            <div className="space-y-5">
              <Section label="Site">
                <p className="break-all font-mono text-xs text-graphite">{site}</p>
              </Section>

              {state.palette?.colors.length ? (
                <Section label="Palette" note={state.palette.source}>
                  <ul className="flex flex-wrap gap-1.5">
                    {state.palette.colors.map((hex) => (
                      <li
                        key={hex}
                        title={hex}
                        className="size-6 rounded border border-graphite/10"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </ul>
                </Section>
              ) : null}

              {state.assets?.items.length ? (
                <Section label="Assets" note={`${state.assets.items.length}`}>
                  <ul className="grid grid-cols-4 gap-1.5">
                    {state.assets.items.slice(0, 8).map((asset) => (
                      <li
                        key={asset.sourceUrl}
                        className="aspect-square overflow-hidden rounded border border-rule bg-paper-sunk"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={asset.sourceUrl}
                          alt={asset.alt || asset.file}
                          loading="lazy"
                          className="size-full object-contain p-1"
                        />
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}

              {state.brand ? (
                <Section label="Brand" note={`${state.brand.evidence.length} verified`}>
                  <p className="text-sm font-medium text-graphite">{state.brand.name}</p>
                  <p className="pretty mt-1.5 text-xs leading-relaxed text-mute">
                    {state.brand.summary}
                  </p>

                  {state.brand.personas.length ? (
                    <ul className="mt-3 space-y-1.5">
                      {state.brand.personas.map((persona) => (
                        <li key={persona.name} className="text-xs">
                          <span className="text-graphite">{persona.name}</span>
                          <span className="text-mute"> — {persona.needs}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                </Section>
              ) : null}

              {state.actor && !isPlaceholder(state.actor.masterFrameUrl) ? (
                <Section label="Actor">
                  <div className="flex gap-3">
                    <div className="relative aspect-[4/5] w-16 shrink-0 overflow-hidden rounded-lg border border-rule bg-paper-sunk">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={state.actor.masterFrameUrl}
                        alt={state.actor.look}
                        className="size-full object-cover"
                      />
                    </div>
                    <p className="pretty text-xs leading-relaxed text-mute">{state.actor.look}</p>
                  </div>

                  {/* Reuse points at the library rather than at this panel: the
                      run holds this person for now, but the durable copy — the
                      one still there next week — is the row the run recorded. */}
                  <Link
                    href="/studio/library"
                    className="mt-3 inline-flex items-center gap-1 text-xs text-graphite underline underline-offset-4 transition-colors duration-150 hover:text-ember"
                  >
                    Use again from the library
                    <ArrowSquareOut weight="bold" aria-hidden className="size-3" />
                  </Link>
                </Section>
              ) : null}

              {state.concepts?.items.length ? (
                <Section label="Ideas" note={`${state.concepts.items.length}`}>
                  <ul className="space-y-1.5">
                    {state.concepts.items.map((concept) => (
                      <li key={concept.title} className="text-xs text-graphite">
                        {concept.title}
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}

              {/* The finished cut, still to hand.
                  The transcript is the only place it existed before, which meant
                  that forty rows later the one thing the run was for had scrolled
                  away and the way back to it was to scroll for it. */}
              {state.video && !isPlaceholder(state.video.url) ? (
                <Section
                  label="The cut"
                  note={`${Math.round(state.video.seconds)}s${
                    state.video.draft ? " · draft" : ""
                  }`}
                >
                  <div className="relative aspect-[9/16] w-32 overflow-hidden rounded-lg border border-rule bg-graphite">
                    <Player url={state.video.url!} poster={state.video.poster} />
                  </div>

                  <a
                    href={state.video.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-graphite underline underline-offset-4 transition-colors duration-150 hover:text-ember"
                  >
                    Open the file
                    <ArrowSquareOut weight="bold" aria-hidden className="size-3" />
                  </a>
                </Section>
              ) : null}

              {/* What this run put in the library, without being asked.
                  Stated once, as a summary, rather than as a badge on every
                  card: eleven "saved" chips is noise, one honest line is a
                  receipt — and the only reason to show it at all is so nobody
                  wonders whether they were supposed to save something. */}
              {kept.length ? (
                <Section label="Kept" note={`${kept.length}`}>
                  <ul className="space-y-1">
                    {kept.slice(-6).map((asset) => (
                      <li key={asset.id} className="truncate text-xs text-mute">
                        <span className="text-graphite">{asset.name}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/studio/library"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-graphite underline underline-offset-4 transition-colors duration-150 hover:text-ember"
                  >
                    Open the library
                    <ArrowSquareOut weight="bold" aria-hidden className="size-3" />
                  </Link>
                </Section>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

const Section = ({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) => (
  <section className="stream border-t border-rule pt-4 first:border-0 first:pt-0">
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
        {label}
      </h3>
      {note ? <span className="font-mono text-[10px] text-mute">{note}</span> : null}
    </div>
    <div className="mt-2">{children}</div>
  </section>
);
