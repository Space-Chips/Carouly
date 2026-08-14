"use client";

import {
  ArrowRight,
  ArrowSquareOut,
  ArrowsOut,
  BookmarkSimple,
  Play,
  Quotes,
  Warning,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Artifact } from "@/lib/agent/events";

/**
 * The things a run produces, as cards in the thread.
 *
 * Each one is shaped like the thing itself rather than like a summary of it: a
 * palette is swatches, assets are the actual images, evidence is the quote with
 * its source. A card reading "3 colours found" would be strictly less useful
 * than the three colours, and this whole screen exists to show the work.
 */

const Card = ({
  label,
  children,
  aside,
}: {
  label: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) => (
  <div className="stream rounded-2xl border border-rule bg-paper-lift p-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">{label}</p>
      {aside}
    </div>
    <div className="mt-4">{children}</div>
  </div>
);

/* -------------------------------------------------------------- pending --- */

/**
 * The shape of the card that is coming, while it is still being made.
 *
 * A skeleton is a promise about layout, so it is only worth drawing where the
 * layout is genuinely known in advance. These three are: a row of swatches, a
 * grid of thumbnails, a paragraph and some chips. Anything less predictable gets
 * no skeleton, because a skeleton that resolves into a different shape is worse
 * than a blank.
 */
export const PendingCard = ({ tool }: { tool: string }) => {
  if (tool === "read_site") {
    return (
      <div className="stream rounded-2xl border border-rule bg-paper-lift p-4">
        <div className="skeleton h-3 w-20 rounded" />
        <div className="mt-4 flex gap-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="skeleton size-7 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (tool === "build_brand_kit") {
    return (
      <div className="stream rounded-2xl border border-rule bg-paper-lift p-4">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="mt-4 space-y-2">
          <div className="skeleton h-4 w-40 rounded" />
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-11/12 rounded" />
          <div className="skeleton h-3 w-2/3 rounded" />
        </div>
        <div className="mt-4 flex gap-1.5">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton h-6 w-24 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  if (tool === "make_video") {
    return (
      <div className="stream rounded-2xl border border-rule bg-paper-lift p-4">
        <div className="skeleton h-3 w-16 rounded" />
        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
          <div className="skeleton mx-auto aspect-[9/16] w-full max-w-[180px] rounded-xl" />
          <div className="space-y-2">
            <div className="skeleton h-3 w-full rounded" />
            <div className="skeleton h-3 w-10/12 rounded" />
            <div className="skeleton h-3 w-8/12 rounded" />
          </div>
        </div>
      </div>
    );
  }

  return null;
};

/**
 * "This is in your library."
 *
 * Not a button — the run already kept it. This is only the receipt, because a
 * thing that was saved without being asked still has to *say* it was saved, or
 * the next question is "do I need to save this?" and we are back to filing.
 */
const Kept = ({ show }: { show: boolean }) =>
  show ? (
    <Link
      href="/studio/library"
      className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-mute transition-colors duration-150 hover:text-graphite"
    >
      <BookmarkSimple weight="fill" aria-hidden className="size-3" />
      Kept
    </Link>
  ) : null;

/* --------------------------------------------------------------- palette --- */

const PaletteCard = ({ artifact }: { artifact: Extract<Artifact, { kind: "palette" }> }) => (
  <Card
    label="Palette"
    aside={<span className="font-mono text-xs text-mute">{artifact.source}</span>}
  >
    {artifact.colors.length ? (
      <ul className="flex flex-wrap gap-2">
        {artifact.colors.map((hex) => (
          <li key={hex} className="flex items-center gap-2">
            {/* Hairline, or a near-white brand colour on near-white paper is an
                invisible rectangle. */}
            <span
              className="size-7 rounded-md border border-graphite/10"
              style={{ backgroundColor: hex }}
            />
            <code className="font-mono text-xs text-mute">{hex}</code>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-mute">None declared in the stylesheets.</p>
    )}
  </Card>
);

/* ---------------------------------------------------------------- assets --- */

const AssetsCard = ({ artifact }: { artifact: Extract<Artifact, { kind: "assets" }> }) => (
  <Card
    label="Assets"
    aside={<span className="font-mono text-xs text-mute">{artifact.items.length}</span>}
  >
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {artifact.items.map((asset) => (
        <li key={asset.sourceUrl} className="group/asset">
          <div className="relative aspect-square overflow-hidden rounded-lg border border-rule bg-paper-sunk">
            {/* Plain <img>: these are arbitrary customer-owned hosts, and putting
                every one through the optimiser would mean either a wildcard
                remote pattern or a run that fails on an unlisted CDN. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.sourceUrl}
              alt={asset.alt || asset.file}
              loading="lazy"
              className="size-full object-contain p-1.5"
            />
          </div>
          <p className="mt-1 truncate font-mono text-[10px] text-mute" title={asset.file}>
            {asset.role}
          </p>
        </li>
      ))}
    </ul>
  </Card>
);

/* ----------------------------------------------------------------- brand --- */

const BrandCard = ({ artifact }: { artifact: Extract<Artifact, { kind: "brand" }> }) => (
  <Card
    label="Brand kit"
    aside={
      <span className="font-mono text-xs text-mute">
        {artifact.evidence.length} verified
        {artifact.dropped ? ` · ${artifact.dropped} dropped` : ""}
      </span>
    }
  >
    <h4 className="text-lg font-semibold tracking-tight text-graphite">{artifact.name}</h4>
    <p className="pretty mt-2 text-sm leading-relaxed text-mute">{artifact.summary}</p>

    <p className="mt-4 text-sm text-graphite">
      <span className="text-mute">Writes like: </span>
      {artifact.voice}
    </p>

    {artifact.valueProps.length ? (
      <ul className="mt-4 flex flex-wrap gap-1.5">
        {artifact.valueProps.map((prop) => (
          <li
            key={prop}
            className="rounded-full bg-paper-sunk px-2.5 py-1 text-xs text-graphite"
          >
            {prop}
          </li>
        ))}
      </ul>
    ) : null}

    {artifact.evidence.length ? (
      <div className="mt-5 border-t border-rule pt-4">
        <ul className="space-y-2">
          {artifact.evidence.slice(0, 4).map((entry) => (
            <li key={entry.quote} className="flex gap-2">
              <Quotes weight="fill" aria-hidden className="mt-1 size-3 shrink-0 text-ember" />
              <p className="pretty text-sm leading-relaxed text-graphite">{entry.quote}</p>
            </li>
          ))}
        </ul>
      </div>
    ) : null}
  </Card>
);

/* -------------------------------------------------------------- concepts --- */

/**
 * The ideas, each one runnable.
 *
 * They were a read-only list, which made them a dead end: five things worth
 * making, and the only route to any of them was to describe it back in the
 * composer. Now the card is the control — an idea with no way to act on it is
 * just a paragraph.
 *
 * A list, not a grid. Two columns were tried and are worse: the ideas are read
 * top to bottom in one pass, and side-by-side tiles turn that into a scan with
 * a fold in the middle of it, ragged bottom edge and all.
 */
const ConceptsCard = ({
  artifact,
  onRun,
  busy,
}: {
  artifact: Extract<Artifact, { kind: "concepts" }>;
  onRun?: (title: string) => void;
  busy?: boolean;
}) => (
  <Card
    label="Ideas"
    aside={<span className="font-mono text-xs text-mute">{artifact.items.length}</span>}
  >
    <ul className="space-y-2">
      {artifact.items.map((concept) => (
        <li key={concept.title}>
          <button
            type="button"
            disabled={!onRun || busy}
            onClick={() => onRun?.(concept.title)}
            className="group w-full rounded-xl bg-paper-sunk p-3 text-left transition-all duration-200 ease-[var(--ease-out)] enabled:hover:bg-paper-sunk/70 enabled:hover:shadow-[0_6px_18px_-12px_rgba(12,10,9,0.5)] disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-medium text-graphite">{concept.title}</h4>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
                {concept.format}
              </span>
            </div>

            {/* The hook is the spoken first line, so it is set as speech. It is
                the only thing here that ends up in the video verbatim. */}
            <p className="pretty mt-1.5 text-sm italic leading-relaxed text-mute">
              &ldquo;{concept.hook}&rdquo;
            </p>

            {onRun ? (
              <span className="mt-2 inline-flex items-center gap-1 text-xs text-mute opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                Make this one
                <ArrowRight weight="bold" aria-hidden className="size-3" />
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  </Card>
);

/* ----------------------------------------------------------------- actor --- */

/**
 * The person the run cast.
 *
 * An actor was invisible before — a master frame buried in the graph, thrown
 * away with the tab. Giving them a card is what turns "use her again next week"
 * from a wish into a link, since by the time you know you want her the run that
 * made her is over.
 */
const ActorCard = ({ artifact }: { artifact: Extract<Artifact, { kind: "actor" }> }) => {
  const framed = !isPlaceholder(artifact.masterFrameUrl);

  return (
    <Card
      label="Actor"
      aside={<Kept show={framed} />}
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,120px)_minmax(0,1fr)]">
        <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-rule bg-paper-sunk">
          {framed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artifact.masterFrameUrl} alt={artifact.look} className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-mute">actor</p>
            </div>
          )}
        </div>

        <div className="space-y-2 text-sm">
          <p className="font-medium text-graphite">{artifact.name}</p>
          <p className="pretty leading-relaxed text-mute">{artifact.look}</p>
          {artifact.wardrobe ? (
            <p className="text-xs text-mute">
              <span className="text-graphite">Wears: </span>
              {artifact.wardrobe}
            </p>
          ) : null}
          {artifact.voice ? (
            <p className="text-xs text-mute">
              <span className="text-graphite">Sounds: </span>
              {artifact.voice}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
};

/* ----------------------------------------------------------------- video --- */

export const isPlaceholder = (url?: string) =>
  !url || url.startsWith("https://dry-run.local/");

/**
 * The player.
 *
 * A bare `<video controls>` was not enough, for two reasons that both showed up
 * as "I can't play the result". At 180px wide the native control strip is
 * roughly the width of its own scrubber, so there is nothing to aim at; and when
 * the file does not load — the usual cause being that the local render server
 * that serves it is not running — a `<video>` element fails completely
 * silently. You get a black rectangle and no way to tell a missing file from a
 * finished render of a dark first frame.
 *
 * So: a poster with one large target on it, native controls once it is playing,
 * and an explicit failure state that names the likely cause.
 */
export const Player = ({
  url,
  poster,
  autoPlay = false,
  onError,
}: {
  url: string;
  poster?: string;
  autoPlay?: boolean;
  onError?: () => void;
}) => {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(autoPlay);

  // Held in a ref so the listener below is attached once rather than on every
  // render — the caller passes an inline arrow, as callers do.
  const fail = useRef(onError);
  fail.current = onError;

  /**
   * Media `error` is not a React-friendly event.
   *
   * It does not bubble, and with `preload="metadata"` a bad URL resolves in the
   * same tick the element is created — often before React's own handler is in
   * place, which is exactly the case that matters here, because the URL that
   * fails is the local render server's and it fails immediately with
   * `ERR_CONNECTION_REFUSED`. So: a real listener, plus a check of the
   * element's own `error` for the failure that already happened.
   */
  useEffect(() => {
    const element = video.current;
    if (!element) return;

    const report = () => fail.current?.();
    if (element.error) report();

    element.addEventListener("error", report);
    return () => element.removeEventListener("error", report);
  }, [url]);

  return (
    <>
      <video
        ref={video}
        src={url}
        poster={isPlaceholder(poster) ? undefined : poster}
        controls={started}
        autoPlay={autoPlay}
        playsInline
        // Enough to get a duration and a first frame without pulling the whole
        // file down for a card that may never be played.
        preload="metadata"
        onPlay={() => setStarted(true)}
        className="size-full object-cover"
      />

      {!started ? (
        <button
          type="button"
          onClick={() => {
            setStarted(true);
            void video.current?.play();
          }}
          aria-label="Play the cut"
          className="group absolute inset-0 grid place-items-center bg-graphite/10 transition-colors duration-200 hover:bg-graphite/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite"
        >
          <span className="grid size-12 place-items-center rounded-full bg-white/90 text-graphite shadow-[0_8px_24px_-8px_rgba(12,10,9,0.6)] transition-transform duration-300 ease-[var(--ease-out)] group-hover:scale-110">
            <Play weight="fill" aria-hidden className="ml-0.5 size-5" />
          </span>
        </button>
      ) : null}
    </>
  );
};

/** What to say when the file will not load, which is nearly always the same thing. */
const unreachable = (url: string) =>
  /localhost|127\.0\.0\.1/.test(url)
    ? "This file is served by the local render server. Start it with `npm run render` and play it again."
    : "The file did not load. It may have expired at the provider, or the network dropped it.";

const VideoCard = ({ artifact }: { artifact: Extract<Artifact, { kind: "video" }> }) => {
  const placeholder = isPlaceholder(artifact.url);
  const [broken, setBroken] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <Card
      label="The cut"
      aside={
        <span className="flex items-center gap-2 font-mono text-xs text-mute">
          {/* A draft is a real file you can watch, at 480p and silent. It has to
              be labelled on the artifact itself — not in a status bar somewhere —
              because this card is the thing someone will screenshot and send. */}
          {artifact.draft ? (
            <span className="rounded-full bg-ember/12 px-2 py-0.5 uppercase tracking-[0.1em] text-ember">
              Draft · 480p
            </span>
          ) : null}
          {Math.round(artifact.seconds)}s · {artifact.shots.length} shots
          <Kept show={!placeholder} />
        </span>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[200px]">
          <div className="relative overflow-hidden rounded-xl border border-rule bg-graphite">
            <div className="aspect-[9/16]">
              {!placeholder && !broken ? (
                <Player
                  url={artifact.url!}
                  poster={artifact.poster}
                  onError={() => setBroken(true)}
                />
              ) : broken ? (
                <div className="flex size-full flex-col items-center justify-center gap-2 bg-paper-sunk px-3 text-center">
                  <Warning weight="fill" aria-hidden className="size-5 text-fail" />
                  <p className="text-[11px] leading-snug text-mute">
                    This file would not play.
                  </p>
                </div>
              ) : !isPlaceholder(artifact.poster) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={artifact.poster} alt="First frame" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bone/50">
                    9:16
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Under the frame rather than beside it: a 200px-wide player is for
              checking the cut, and the moment you want a real look at it you
              want it big. */}
          {!placeholder && !broken ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-rule px-3 py-1.5 text-xs text-graphite transition-colors duration-150 hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite"
            >
              <ArrowsOut weight="bold" aria-hidden className="size-3.5" />
              Full size
            </button>
          ) : null}
        </div>

        <div>
          {/* The script is the deliverable even when the render is not. A run
              that produced no media still produced a shot list someone can film. */}
          <ol className="space-y-2">
            {artifact.shots.map((shot, index) => (
              <li key={index} className="flex gap-3">
                <span className="mt-0.5 shrink-0 font-mono text-[10px] tabular-nums text-mute">
                  {String(
                    Math.round(index * (artifact.seconds / Math.max(artifact.shots.length, 1)))
                  ).padStart(2, "0")}
                  s
                </span>
                <p className="pretty text-sm leading-relaxed text-graphite">{shot.line}</p>
              </li>
            ))}
          </ol>

          {artifact.captions.length ? (
            <p className="mt-4 border-t border-rule pt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-mute">
              {artifact.captions.join(" / ")}
            </p>
          ) : null}

          {placeholder ? (
            <p className="mt-3 text-xs text-mute">
              Graph ran, nothing billed. Set <code>FAL_KEY</code> to render.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {broken ? (
                <p className="pretty text-xs leading-relaxed text-fail">
                  {unreachable(artifact.url!)}
                </p>
              ) : artifact.draft ? (
                <p className="text-xs text-mute">
                  Local draft — no sound, and the framing is what to judge, not
                  the picture quality.
                </p>
              ) : null}

              {/* Always offered, draft or not. The link was previously replaced
                  by the draft note, which left a real file on disk with no way
                  to reach it from the one card that knows where it is. */}
              <a
                href={artifact.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-graphite underline underline-offset-4 transition-colors duration-150 hover:text-ember"
              >
                Open the file
                <ArrowSquareOut weight="bold" aria-hidden className="size-3.5" />
              </a>

            </div>
          )}
        </div>
      </div>

      {/* The cut at a size worth judging. 9:16 against the viewport height, so
          the whole frame is on screen rather than cropped by the dialog. */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="border-rule bg-graphite p-0 sm:max-w-[min(92vw,calc(78vh*9/16))]">
          <DialogTitle className="sr-only">{artifact.concept}</DialogTitle>
          {expanded && artifact.url ? (
            <div className="relative aspect-[9/16] max-h-[78vh] overflow-hidden rounded-lg">
              <Player
                url={artifact.url}
                poster={artifact.poster}
                autoPlay
                onError={() => {
                  setBroken(true);
                  setExpanded(false);
                }}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

/* ---------------------------------------------------------------- switch --- */

export default function ArtifactCard({
  artifact,
  onRunIdea,
  busy,
}: {
  artifact: Artifact;
  onRunIdea?: (title: string) => void;
  busy?: boolean;
}) {
  switch (artifact.kind) {
    case "palette":
      return <PaletteCard artifact={artifact} />;
    case "assets":
      return <AssetsCard artifact={artifact} />;
    case "brand":
      return <BrandCard artifact={artifact} />;
    case "concepts":
      return <ConceptsCard artifact={artifact} onRun={onRunIdea} busy={busy} />;
    case "actor":
      return <ActorCard artifact={artifact} />;
    case "video":
      return <VideoCard artifact={artifact} />;
  }
}
