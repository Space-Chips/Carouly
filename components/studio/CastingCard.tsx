"use client";

import {
  ArrowRight,
  BookmarkSimple,
  CaretDown,
  Sparkle,
  UserPlus,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { identityFor, type ActorCandidate, type ActorIdentity } from "@/lib/agent/events";
import { portraitFor } from "@/lib/actors/previews";
import type { Block } from "@/components/studio/thread";
import { formatCredits, COSTS } from "@/lib/credits/prices";

/**
 * Casting.
 *
 * The run used to decide this silently. A casting node read the brand, wrote a
 * paragraph about a person, and the first anybody saw of them was a finished
 * video — which is a strange way to treat the single most visible choice in the
 * whole thing. So it stops here and asks, with a shelf that has already been
 * ranked against this brand's own customers.
 *
 * Three kinds of person are on that shelf and the card has to be honest about
 * which is which, because the promises differ:
 *
 *   library — somebody this account has already filmed. Their master frame is
 *             real and gets pinned, so the same face comes back. Marked, and
 *             first, because that is a stronger claim than any match score.
 *   preset  — a written person. No photograph exists yet; the face is generated
 *             at cast time in the chosen format's own visual style, which is why
 *             the plate is typographic rather than a stock headshot standing in
 *             for somebody who does not exist.
 *   custom  — described here, and optionally generated here, so it can be seen
 *             before it is committed to.
 *
 * The plates are 3:4, not 9:16: this is a casting call, not a format, and the
 * two shelves in a run should not read as the same decision made twice.
 */

/** The inks the format cards use, so the two shelves stay one family. */
const TONES = ["#2b2a55", "#3f8a5e", "#6f56b5", "#128f96", "#c01f3f", "#d4552b"];

const toneFor = (id: string) => {
  const sum = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
  return TONES[sum % TONES.length];
};

/**
 * A face, or the absence of one, said out loud.
 *
 * The absence is the interesting case. A preset with no portrait rendered is not
 * a loading state and must not shimmer like one — it is a person who exists as a
 * description, and the honest drawing of that is their initial set large on a
 * flat ground. Running `npm run actors` fills these in with real frames; until
 * then the plate should look deliberate rather than pending.
 */
const Plate = ({ candidate }: { candidate: ActorCandidate }) => {
  // Older streamed candidates may not carry a portrait URL, but their preset
  // id is stable and maps to the generated actor image shipped with the app.
  const portrait = candidate.portrait ?? portraitFor(candidate.id);

  if (portrait) {
    return (
      // A generated frame, not a photograph of a real person — so it is decorative
      // and the name beside it is the label.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={portrait}
        alt=""
        loading="lazy"
        className="absolute inset-0 size-full object-cover"
      />
    );
  }

  /**
   * Tinted paper, not poster paint.
   *
   * Four saturated plates in a row read as a colour chart, and they compete with
   * the one thing on this shelf that should be saturated — an actual generated
   * face, once there is one. So the tone is mixed down into the paper and spent
   * on the letter instead: the shelf stays quiet until real portraits arrive,
   * and each person is still told apart at a glance.
   */
  const tone = toneFor(candidate.id);

  return (
    <>
      <span
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundColor: `color-mix(in oklab, ${tone} 14%, var(--paper-sunk))` }}
      />
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-3xl font-semibold leading-none"
        style={{ color: tone }}
      >
        {candidate.name.slice(0, 1)}
      </span>
    </>
  );
};

/** A stale event name should not leak into the shelf's visible label. */
const displayName = (candidate: ActorCandidate) =>
  candidate.name === "Elena" ? "Maya" : candidate.name;

const Card = ({
  candidate,
  index,
  state,
  onPick,
}: {
  candidate: ActorCandidate;
  index: number;
  state: "open" | "picked" | "passed";
  onPick: () => void;
}) => (
  <li
    style={{ "--i": index } as React.CSSProperties}
    className={`card-in w-[42%] shrink-0 snap-start sm:w-auto ${
      state === "passed" ? "shelved" : ""
    }`}
  >
    <button
      type="button"
      onClick={onPick}
      disabled={state !== "open"}
      className="group w-full text-left outline-none disabled:cursor-default"
      aria-label={`Cast ${displayName(candidate)}, ${candidate.persona}`}
    >
      <div
        className={`relative aspect-[3/4] overflow-hidden rounded-xl border transition-all duration-300 ease-[var(--ease-out)] group-focus-visible:ring-2 group-focus-visible:ring-graphite group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-paper ${
          state === "picked"
            ? "border-graphite ring-2 ring-graphite"
            : "border-black/10 group-enabled:group-hover:-translate-y-1 group-enabled:group-hover:shadow-[0_12px_28px_-14px_rgba(12,10,9,0.5)]"
        }`}
      >
        <Plate candidate={candidate} />

        {candidate.source === "library" ? (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-white">
            <BookmarkSimple weight="fill" aria-hidden className="size-2.5" />
            Yours
          </span>
        ) : null}

        {state === "picked" ? (
          <span className="absolute inset-x-0 bottom-0 bg-graphite py-1 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-white">
            Cast
          </span>
        ) : null}
      </div>

      <p className="mt-2 truncate text-sm font-semibold text-graphite">
        {displayName(candidate)}
      </p>
      <p className="truncate text-xs text-graphite/75">{candidate.persona}</p>
      {candidate.why ? (
        <p className="pretty mt-1.5 text-xs leading-snug text-graphite/75">{candidate.why}</p>
      ) : null}
    </button>
  </li>
);

export default function CastingCard({
  block,
  busy,
  onCast,
}: {
  block: Extract<Block, { kind: "cast" }>;
  busy?: boolean;
  /**
   * `id` is the candidate that was picked, and is absent when somebody wrote
   * their own — which is exactly why it is a separate argument rather than a
   * field on the person: the shelf needs to know which card to light, and a
   * written casting note has no card.
   *
   * The identity travels whole rather than as a name and a paragraph. A saved
   * actor carries their `assetId`, and dropping it here would have the run
   * record them as a *new* person on every reuse — a fresh near-identical row
   * each week, which is precisely what the library exists to prevent.
   */
  onCast: (id: string | undefined, person: { name: string; identity: ActorIdentity }) => void;
}) {
  const [browsing, setBrowsing] = useState(false);
  const [writing, setWriting] = useState(false);
  const [description, setDescription] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const decided = Boolean(block.chosen || block.cast);
  const library = block.library ?? [];
  const total = block.items.length + library.length;

  const anyLibrary = useMemo(
    () => block.items.some((candidate) => candidate.source === "library"),
    [block.items]
  );

  const state = (candidate: ActorCandidate) =>
    block.chosen === candidate.id ? "picked" : decided ? "passed" : "open";

  /**
   * Draw the person somebody described, before they commit to them.
   *
   * Deliberately a separate step from casting them: the description alone is
   * enough to run the video, so generating a portrait is an option rather than a
   * toll on the way through. Failures land in the panel rather than the
   * transcript — nothing about the run has changed, and the answer is to edit
   * the sentence and press it again.
   */
  const draw = async () => {
    if (description.trim().length < 12) {
      setProblem("Say a little more — age, look, wardrobe, and where they are.");
      return;
    }

    setDrawing(true);
    setProblem(null);

    try {
      const response = await fetch("/api/studio/actor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() }),
      });

      /**
       * Read the body before trusting it to be JSON.
       *
       * A session that has expired does not come back as JSON at all — the
       * middleware answers the fetch with the sign-in page, and calling
       * `.json()` on that put «Unexpected token '<'» in front of somebody who
       * was casting an actor. The status is the thing worth reporting.
       */
      const body = await response.text();
      let result: { url?: string; stub?: boolean; note?: string; error?: string } = {};

      try {
        result = JSON.parse(body);
      } catch {
        throw new Error(
          // 404 and not only 401: Clerk answers a signed-out request to a
          // protected API route with a bare 404, so "not found" here means the
          // session, not the endpoint. See the note in middleware.ts.
          response.status === 401 || response.status === 404
            ? "Your session has expired. Sign in again and this will work."
            : `Casting is not answering right now (${response.status}).`
        );
      }

      if (!response.ok) throw new Error(result.error ?? "Casting failed.");

      if (result.url) setDrawn(result.url);
      // A dry run has no image and says so, rather than leaving a spinner to
      // resolve into nothing.
      if (result.stub && result.note) setProblem(result.note);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Casting failed.");
    } finally {
      setDrawing(false);
    }
  };

  return (
    <div className="stream rounded-2xl border border-rule bg-white p-4 shadow-[0_1px_2px_rgba(12,10,9,0.04),0_12px_28px_-18px_rgba(12,10,9,0.18)]">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
          {block.prompt}
        </p>
        {library.length ? (
          <p className="shrink-0 font-mono text-[11px] tabular-nums text-mute">
            {block.items.length} of {total}
          </p>
        ) : null}
      </div>

      {/* Once, under the heading, rather than on every card: what a preset
          actually is. The plates are not photographs of anybody, and somebody
          who thinks they are will be surprised by their own video. */}
      <p className="pretty mt-1.5 text-sm leading-relaxed text-graphite/75">
        {anyLibrary
          ? "People you have filmed keep their exact face. The rest are written — their face is made in this format's own style when you cast them."
          : "These are written, not photographed. The face is made in this format's own style when you cast them."}
      </p>

      {/* Five columns when there is a way in for somebody who is not on the
          shelf, four when there is not — so "cast your own" sits in the row as
          the last option rather than wrapping onto a line of its own, where it
          reads as a separate feature instead of the fifth choice. */}
      <ul
        className={`-mx-1 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 sm:grid sm:overflow-visible ${
          block.custom && !decided ? "sm:grid-cols-5" : "sm:grid-cols-4"
        }`}
      >
        {block.items.map((candidate, index) => (
          <Card
            key={candidate.id}
            candidate={candidate}
            index={index}
            state={state(candidate)}
            onPick={() =>
              !busy &&
              onCast(candidate.id, {
                name: candidate.name,
                identity: identityFor(candidate),
              })
            }
          />
        ))}

        {/* Last on the shelf, and drawn as a gap in it. Somebody who does not
            recognise their customer in four faces needs somewhere obvious to
            say so, and that place should not look like a fifth person. */}
        {block.custom && !decided ? (
          <li
            style={{ "--i": block.items.length } as React.CSSProperties}
            className="card-in w-[42%] shrink-0 snap-start sm:w-auto"
          >
            <button
              type="button"
              onClick={() => setWriting((current) => !current)}
              aria-expanded={writing}
              aria-label="Cast somebody who is not on the shelf"
              className="group w-full text-left outline-none"
            >
              <div
                className={`relative grid aspect-[3/4] place-items-center rounded-xl border border-dashed transition-all duration-300 ease-[var(--ease-out)] group-focus-visible:ring-2 group-focus-visible:ring-graphite group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-paper ${
                  writing
                    ? "border-graphite/40 bg-paper-sunk"
                    : "border-rule bg-paper-lift group-hover:-translate-y-1 group-hover:border-graphite/30 group-hover:bg-paper-sunk/60"
                }`}
              >
                <span className="flex flex-col items-center gap-2 text-mute transition-colors duration-200 group-hover:text-graphite">
                  <UserPlus weight="regular" aria-hidden className="size-6" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
                    Someone else
                  </span>
                </span>
              </div>

              <p className="mt-2 truncate text-sm font-medium text-graphite">Cast your own</p>
              <p className="truncate text-xs text-mute">Describe them</p>
            </button>
          </li>
        ) : null}
      </ul>

      {/* The writing panel, below the shelf rather than inside a card: it needs a
          full line to type into, and a textarea squeezed into a 3:4 plate is a
          form pretending to be a portrait. */}
      {block.custom && !decided ? (
        <div className="unfurl" data-open={writing}>
          <div>
            <div inert={!writing} className="mt-1 rounded-2xl border border-rule bg-paper-lift p-4">
              <div className="grid gap-4 sm:grid-cols-[96px_minmax(0,1fr)]">
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-black/10">
                  {drawn ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={drawn}
                      alt=""
                      className="card-in absolute inset-0 size-full object-cover"
                    />
                  ) : drawing ? (
                    <span className="skeleton absolute inset-0" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center bg-paper-sunk px-2 text-center font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-mute">
                      No portrait
                      <br />
                      yet
                    </span>
                  )}
                </div>

                <div className="flex min-w-0 flex-col">
                  <label
                    htmlFor={`cast-${block.id}`}
                    className="font-mono text-[11px] uppercase tracking-[0.14em] text-mute"
                  >
                    Who is on camera
                  </label>
                  <textarea
                    id={`cast-${block.id}`}
                    value={description}
                    onChange={(event) => {
                      setDescription(event.target.value);
                      // The portrait belongs to the sentence that made it. Left
                      // on screen while the words change underneath, it becomes
                      // a picture of somebody the run will not cast.
                      if (drawn) setDrawn(null);
                    }}
                    rows={3}
                    maxLength={600}
                    placeholder="Woman, 50s, runs a garden centre. Fleece over a shirt, mud on her hands, standing among the trays outside."
                    className="mt-2 min-h-[76px] w-full resize-y rounded-xl border border-rule bg-paper px-3 py-2 text-sm leading-relaxed text-graphite outline-none transition-colors duration-200 placeholder:text-mute focus:border-graphite/30"
                  />

                  <p className="pretty mt-2 text-xs leading-relaxed text-mute">
                    Age, build, wardrobe and the room they are in. The more
                    specific, the more they hold together across shots.
                  </p>

                  {problem ? (
                    <p className="stream pretty mt-2 text-xs leading-relaxed text-fail">
                      {problem}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void draw()}
                      disabled={drawing || busy || description.trim().length < 12}
                      className="flex items-center gap-1.5 rounded-full border border-rule px-3 py-2 text-sm text-graphite transition-all duration-200 ease-[var(--ease-out)] hover:bg-paper-sunk active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite disabled:opacity-40"
                    >
                      <Sparkle weight="fill" aria-hidden className="size-3.5" />
                      {drawing
                        ? "Drawing them…"
                        : drawn
                          ? "Draw again"
                          : "See them first"}
                      <span className="font-mono text-[10px] tabular-nums text-mute">
                        {formatCredits(COSTS.cast_actor)}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onCast(undefined, {
                          name: "Your own casting",
                          identity: {
                            // Empty rather than absent when nothing was drawn:
                            // `produce` refuses to pin a placeholder, so the
                            // graph draws them from these words instead of
                            // being handed a URL that does not resolve.
                            masterFrameUrl: drawn ?? "",
                            look: description.trim(),
                            persona: "Your own casting",
                          },
                        })
                      }
                      disabled={busy || description.trim().length < 12}
                      className="flex items-center gap-2 rounded-full bg-graphite px-4 py-2 text-sm font-medium text-white transition-all duration-200 ease-[var(--ease-out)] hover:bg-graphite/85 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite disabled:opacity-40"
                    >
                      Cast them
                      <ArrowRight weight="bold" aria-hidden className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {library.length && !decided ? (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setBrowsing((current) => !current)}
            aria-expanded={browsing}
            className="flex items-center gap-1.5 rounded-md py-1 text-xs text-mute transition-colors duration-150 hover:text-graphite focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite"
          >
            <CaretDown
              weight="bold"
              aria-hidden
              className={`size-3 transition-transform duration-300 ease-[var(--ease-out)] ${
                browsing ? "rotate-180" : ""
              }`}
            />
            {browsing
              ? "Hide the rest of the casting library"
              : `See ${library.length} more`}
          </button>

          <div className="unfurl" data-open={browsing}>
            <div>
              <ul
                inert={!browsing}
                className="-mx-1 mt-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 sm:grid sm:grid-cols-4 sm:overflow-visible"
              >
                {library.map((candidate, index) => (
                  <Card
                    key={candidate.id}
                    candidate={candidate}
                    index={index}
                    state={state(candidate)}
                    onPick={() =>
                      !busy &&
                      onCast(candidate.id, {
                        name: candidate.name,
                        identity: identityFor(candidate),
                      })
                    }
                  />
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {/* What was sent back, once it has been. The custom path has no card to
          light up, so without this the panel would simply close and leave no
          record of who is in the video. */}
      {block.cast && !block.chosen ? (
        <p className="stream mt-2 flex items-center gap-2 text-sm text-graphite">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
            Cast
          </span>
          <span className="truncate">{block.cast.look}</span>
        </p>
      ) : null}
    </div>
  );
}
