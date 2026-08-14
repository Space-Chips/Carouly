/**
 * The streaming protocol between a run and the studio.
 *
 * This is the contract the whole product hangs on, so it is worth stating what
 * it is for. The old app hid the work: you pressed a button and a spinner ran
 * for sixty seconds. The pitch now is that the machine reads your site and you
 * can watch it do it — which only means anything if the run narrates itself in
 * enough detail to be believed.
 *
 * Everything the agent does arrives as a `tool` event. There is no separate
 * notion of a pipeline stage any more: the agent decides what to call and in
 * what order, so a fixed list of stages would have been a diagram of a pipeline
 * that no longer exists.
 *
 * Every event is JSON on one line. The route handler writes them as NDJSON and
 * the client parses them as they land.
 */

import type { CreditGate } from "@/lib/credits/gates";
import type { BrandKit } from "@/lib/stages/brand";
import type { Workflow } from "@/lib/workflow/graph";

export type GraphNodeShape = {
  id: string;
  type: string;
  deps: string[];
  foreach: boolean;
};

export type CapturedAsset = {
  file: string;
  role: "logo" | "icon" | "product" | "image";
  sourceUrl: string;
  alt?: string;
  width?: number;
  height?: number;
};

export type VideoConcept = {
  title: string;
  hook: string;
  format: string;
  beats: string[];
  cta: string;
};

/**
 * A reusable on-camera identity.
 *
 * This is the part of a run worth keeping: the master frame a video pins its
 * face to, plus enough words to describe the same person on the shots that are
 * written rather than edited. It lives in the run protocol (not only in the
 * library) because a run can be *seeded* with one — cast this exact actor again
 * — and because a run can *emit* one for the library to save. The asset-library
 * `ActorData` is an alias of this shape, so saving is a copy, not a conversion.
 */
export type ActorIdentity = {
  masterFrameUrl: string;
  look: string;
  wardrobe?: string;
  voice?: string;
  persona?: string;
  sourceUrl?: string;
  /**
   * The library row this person already is, when the run was given one.
   *
   * Load-bearing for two things: a video made with them records it as lineage,
   * and re-recording the actor at the end of the run updates that row instead of
   * forking a near-identical twin on every reuse.
   */
  assetId?: string;
};

export type TemplateCandidate = {
  id: string;
  name: string;
  description: string;
  score: number;
  reasons: string[];
  aspect: string;
  durationRange: [number, number];
  concept?: string;
  why?: string;
  /**
   * An example render of this template, and a frame from it.
   *
   * Produced by running the template itself — see `npm run previews` — rather
   * than illustrated, because the only honest answer to "what does this format
   * look like" is a video this format made. Absent until that has been run.
   */
  still?: string;
  preview?: string;
  /**
   * The example has no dialogue, because the backend that made it cannot speak.
   *
   * Worth carrying rather than inferring at the card: a local draft is silent by
   * nature (LTX gives you pictures), while the production path uses a model with
   * native audio and the same template comes back talking. Somebody judging a
   * format on a muted example needs to know which of those they are watching.
   */
  previewSilent?: boolean;
  /** The card image is supplied visual direction, not a generated example. */
  previewReference?: boolean;
  /**
   * The agent put this one in front of you, rather than it merely being in the
   * library.
   *
   * The two are genuinely different claims and the card has to be able to say
   * which it is making. A recommendation is answerable — "why that one?" has an
   * answer in `why`, written about this brand — whereas the rest of the library
   * is browsable, in score order, with nothing claimed about it at all.
   */
  recommended?: boolean;
  /**
   * How close this is to the best match, as a percentage of it.
   *
   * Relative, not absolute — see `rank` in lib/stages/match.ts. It exists so the
   * browse list can show the shape of the field rather than eleven identical
   * rows, and it is deliberately absent when nothing scored at all.
   */
  fit?: number;
};

/**
 * Somebody who could be on camera.
 *
 * Two sources, one shape. A `preset` is a written person from the shipped
 * casting shelf — no photograph exists yet, and the master frame is generated at
 * cast time in the template's own style. A `library` actor is someone this
 * account has already filmed, so `masterFrameUrl` is a real frame that gets
 * pinned into the graph and the same face comes back.
 *
 * The card has to distinguish them because the promise differs: one is "someone
 * like this", the other is "this person".
 */
export type ActorCandidate = {
  id: string;
  source: "preset" | "library";
  name: string;
  persona: string;
  /** The identity paragraph, which is also the image prompt. */
  look: string;
  wardrobe?: string;
  voice?: string;
  tags: string[];
  /** A portrait to draw them by, when one exists. */
  portrait?: string;
  /** Only a library actor has one; pinning it is what holds the face. */
  masterFrameUrl?: string;
  assetId?: string;
  score: number;
  reasons: string[];
  /** One line on why this person suits this brand, written for this brand. */
  why?: string;
};

/**
 * A chosen candidate as the thing a run actually consumes.
 *
 * A library actor brings a master frame, which gets pinned, so the face is
 * theirs pixel for pixel. A preset brings only words, and `masterFrameUrl` is
 * deliberately left empty rather than faked: `produce` refuses to pin a
 * placeholder, so the graph generates the frame from `look` in the template's
 * own visual style, and the person the run keeps afterwards is that face.
 *
 * Lives here, in the protocol, because both sides do this conversion — the
 * casting card when somebody picks, and the run when it is handed one — and two
 * implementations of it would drift on exactly the field that matters.
 */
export const identityFor = (candidate: ActorCandidate): ActorIdentity => ({
  masterFrameUrl: candidate.masterFrameUrl ?? "",
  look: candidate.look,
  wardrobe: candidate.wardrobe,
  voice: candidate.voice,
  persona: candidate.persona,
  assetId: candidate.assetId,
});

export type Artifact =
  | { kind: "palette"; colors: string[]; source: string }
  | { kind: "assets"; items: CapturedAsset[] }
  | {
      kind: "brand";
      name: string;
      summary: string;
      voice: string;
      valueProps: string[];
      personas: { name: string; needs: string }[];
      evidence: { quote: string; sourceUrl: string }[];
      dropped: number;
    }
  | { kind: "concepts"; items: VideoConcept[] }
  | ({ kind: "actor"; name: string; savedId?: string } & ActorIdentity)
  | {
      kind: "video";
      template: string;
      concept: string;
      seconds: number;
      url?: string;
      poster?: string;
      captions: string[];
      shots: { line: string; seconds: number; frame?: string }[];
      /** No render happened at all — the media is a placeholder. */
      stubbed: boolean;
      /**
       * A real render, at draft quality, from the local backend. Distinct from
       * `stubbed`: there is a file and you can watch it, it is just 480p and
       * silent. The two must never collapse into one flag — "nothing happened"
       * and "something happened that you cannot ship" need different answers.
       */
      draft?: boolean;
    };

/** Everything the run has learned, carried between turns by the client. */
export type StudioContext = {
  site?: string;
  capture?: {
    url: string;
    title: string;
    markdown: string;
    links: { href: string; label: string }[];
    palette: { colors: string[]; source: string };
    assets: CapturedAsset[];
    meta: Record<string, string>;
  };
  research?: Record<string, unknown>;
  kit?: BrandKit;
  /** The library row the kit is, so a cut made from it can record the lineage. */
  kitId?: string;
  /**
   * An actor this run has been told to reuse (from the library). Their saved
   * master frame is pinned into the identity node, so the same face appears
   * rather than a fresh interpretation of a description of them.
   */
  actor?: ActorIdentity;
  templates?: TemplateCandidate[];
  /**
   * The casting shelf this run has already shown, so a second look at it costs
   * nothing. Ranking actors is a model call; the answer cannot change while the
   * kit has not.
   */
  actors?: ActorCandidate[];
  /** Answers the user has given to the agent's questions, by question. */
  answers?: Record<string, string>;
  /** A graph the model wrote for an idea no shipped template fitted. */
  composed?: Workflow;
  /** The latest completed video, available to an explicit publish request. */
  video?: Extract<Artifact, { kind: "video" }>;
};

export type RunEvent =
  /** Assistant prose. Short — the tools carry the detail. */
  | { t: "say"; text: string }
  | { t: "tool.start"; id: string; name: string; label: string; detail?: string }
  /** A nested call made by a tool that is itself an agent, e.g. research. */
  | { t: "tool.step"; id: string; label: string; detail: string; ms?: number; ok?: boolean }
  | { t: "tool.end"; id: string; ms: number; summary: string }
  | { t: "tool.fail"; id: string; ms: number; error: string }
  | { t: "artifact"; artifact: Artifact }
  | { t: "graph"; template: string; nodes: GraphNodeShape[] }
  | { t: "node.start"; node: string; type: string; index?: number }
  /**
   * `cached` and `pinned` are different claims and must not be collapsed:
   * cached means we made this exact thing before, pinned means you supplied it.
   * Only the second one is a promise about *which face is on screen*.
   */
  | {
      t: "node.ok";
      node: string;
      type: string;
      index?: number;
      ms: number;
      cached: boolean;
      pinned?: boolean;
    }
  | { t: "node.fail"; node: string; type: string; index?: number; ms: number; error: string }
  /**
   * Formats to choose between. The run continues once one is picked.
   *
   * `items` is the recommendation — a few formats chosen for this brand, each
   * carrying its own reason. `library` is everything else the shelf holds, in
   * score order, so "show me the rest" is a disclosure rather than another turn.
   * Kept as two fields rather than one flagged list because the card treats them
   * as different objects: one is argued for, the other is merely available.
   */
  | {
      t: "choice";
      prompt: string;
      items: TemplateCandidate[];
      library?: TemplateCandidate[];
    }
  /**
   * Who should be on camera. Emitted after a format is chosen, before anything
   * is generated, and the turn ends here.
   *
   * This is the one decision the run used to make silently: the casting node
   * invented a person, and the first anybody saw of them was a finished video.
   * `template` travels with it because the answer depends on the format — a
   * founder piece and a street interview want different people — and `custom`
   * says whether writing your own is on offer at all.
   */
  | {
      t: "cast";
      prompt: string;
      template: string;
      items: ActorCandidate[];
      library?: ActorCandidate[];
      custom: boolean;
    }
  /**
   * The agent is missing something it cannot find and will not invent. The run
   * stops here; answering it starts the next turn.
   */
  | { t: "ask"; id: string; question: string; why?: string; placeholder?: string }
  /**
   * Something the run made has been recorded in the library.
   *
   * Emitted by the run itself, because the run is what made the thing and the
   * server is where the bytes already are. The client's job is to *say so*, not
   * to do the saving — a "Save" button on a card is a chore that turns a library
   * into a filing cabinet nobody files in.
   */
  | { t: "asset.saved"; id: string; kind: string; name: string; reused: boolean }
  /**
   * The balance moved.
   *
   * Sent after every charge rather than once at the end of the turn, because the
   * meter is the only place a person can see what the machine is spending on
   * their behalf — and a number that lands all at once when the work is over is
   * a receipt, not a meter. `charged` is zero on the event that accompanies a
   * refusal, where the balance is being corrected rather than reduced.
   */
  | { t: "credits"; balance: number; charged: number; operation?: string }
  /**
   * The balance will not cover what was asked for.
   *
   * Its own event rather than a `run.error`, because it is not a failure and must
   * not be dressed as one — nothing went wrong, nothing was spent, and the answer
   * is a decision rather than a retry. Both numbers travel with it so the card
   * can name the shortfall; the wording lives in `GATE_COPY`, which the client
   * already imports.
   */
  | { t: "credits.short"; gate: CreditGate; need: number; have: number }
  /**
   * The render was handed to the queue rather than run in this turn.
   *
   * The turn ends here and the card that follows polls the job, because a render
   * outlives the request that asked for it — measured at 27.6 minutes against a
   * five-minute function ceiling.
   */
  | { t: "render.queued"; jobId: string; template: string; concept: string }
  /** The updated context, so the client can carry it into the next turn. */
  | { t: "context"; context: StudioContext }
  | { t: "run.end"; ms: number }
  | { t: "run.error"; error: string; hint?: string };

export const encodeEvent = (event: RunEvent) => `${JSON.stringify(event)}\n`;

/**
 * Split a growing NDJSON buffer into whole events, returning the remainder.
 *
 * A chunk boundary lands mid-object often enough that parsing per-chunk drops
 * roughly one event in twenty — invisible in dev, and exactly the kind of bug
 * that only shows up as "the palette sometimes doesn't appear".
 */
export const decodeEvents = (buffer: string) => {
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";
  const events: RunEvent[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as RunEvent);
    } catch {
      // A malformed line is a bug on the writing side; dropping it keeps the
      // rest of the run visible rather than killing the stream.
    }
  }

  return { events, remainder };
};
