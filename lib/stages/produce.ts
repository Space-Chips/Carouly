/**
 * Stage 5 — production. Bind a concept to a template's declared inputs, then run
 * the graph.
 *
 * The template declares what it needs; a model fills those slots from the brand
 * kit and the chosen concept. Nothing else in the graph is model-decided, which
 * is what makes the same concept produce a structurally identical video every
 * time — the creative varies, the construction does not.
 */

import { json as llmJson, MODEL } from "@/lib/agent/llm";
import type { ActorIdentity, Artifact, RunEvent, VideoConcept } from "@/lib/agent/events";
import type { BrandKit } from "@/lib/stages/brand";
import { templateById } from "@/lib/templates";
import * as render from "@/lib/tools/render";
import {
  execute,
  nodeWithRole,
  type NodeStore,
  type Workflow,
} from "@/lib/workflow/graph";
import "@/lib/workflow/nodes";

/** A URL that is a stand-in rather than a file. */
const isPlaceholder = (url?: string) =>
  !url || url.startsWith("https://dry-run.local/");

const BIND_SYSTEM = `You are a short-form video director filling in a production template.
You will be given a brand kit, one video concept, and the template's required inputs.
Return ONLY a JSON object whose keys are exactly the template's input names.

Rules:
- Write spoken language. Contractions. No marketing register.
- Respect any length limit stated in an input's description.
- Use the brand's real vocabulary and claims. Do not invent features.`;

/**
 * Ask the model for exactly the inputs this template declares, then repair.
 *
 * The repair pass matters more than it looks. The concept already contains
 * everything a template needs, so a binding call that comes back half empty is
 * recoverable — and falling through to a deterministic mapping is strictly
 * better than failing a run at the last stage before it spends anything.
 */
/**
 * The words half of reusing an actor.
 *
 * Reuse is two mechanisms working together, and they answer different questions.
 * The pin (below) settles *which face is on screen* — the saved master frame is
 * injected into the identity node, so every per-beat frame is an edit of the
 * real photograph of that person. This note settles what the *script* assumes:
 * the casting model still runs, because it writes the dialogue, and without the
 * note it would happily write lines for someone else's wardrobe and room.
 *
 * So the pixels are authoritative and the words agree with them, rather than the
 * words being all there is.
 */
export const actorNote = (actor: ActorIdentity) =>
  [actor.look, actor.wardrobe && `Wearing: ${actor.wardrobe}`, actor.voice && `Speaks: ${actor.voice}`]
    .filter(Boolean)
    .join(" ");

export const bindInputs = async (
  brand: BrandKit,
  concept: VideoConcept,
  templateId: string,
  supplied?: Workflow,
  actor?: ActorIdentity
) => {
  // Whichever graph is really running. A composed one declares its own inputs,
  // and binding against the shipped template of the same name would fill in
  // slots the graph does not have while leaving its actual ones empty.
  const template = supplied ?? templateById(templateId);
  if (!template) throw new Error(`no template '${templateId}'`);

  const spec = Object.fromEntries(
    Object.entries(template.inputs).map(([key, value]) => [key, value.description])
  );

  let values: Record<string, unknown> = {};

  try {
    values = await llmJson({
      system: BIND_SYSTEM,
      prompt: `BRAND
name: ${brand.brand_name}
summary: ${brand.brand_summary}
voice: ${brand.voice_tone}
value props: ${JSON.stringify(brand.value_props ?? [])}
personas: ${JSON.stringify(brand.target_personas ?? []).slice(0, 1200)}
real lines from the site: ${JSON.stringify(brand.facts?.copy_snippets ?? [])}

CONCEPT
title: ${concept.title}
hook: ${concept.hook}
format: ${concept.format}
beats: ${JSON.stringify(concept.beats ?? [])}
cta: ${concept.cta}

TEMPLATE «${template.name}»
${template.description}

REQUIRED INPUTS
${JSON.stringify(spec, null, 2)}

Return the JSON object with those exact keys.`,
      schema: spec,
      model: MODEL.synth,
      maxTokens: 2000,
      attempts: 2,
    });
  } catch {
    values = {};
  }

  const fallbacks: Record<string, unknown> = {
    hook: concept.hook,
    promise: concept.hook,
    pain: concept.hook,
    cta: concept.cta,
    beats: concept.beats,
    steps: concept.beats,
    turn: concept.beats?.[0],
    payoff: concept.beats?.[concept.beats.length - 1],
  };

  for (const [key, input] of Object.entries(template.inputs)) {
    if (!values[key] && fallbacks[key]) values[key] = fallbacks[key];
    if (!values[key] && input.required === false) values[key] = "";
  }

  // A reused actor overrides whatever the model would have cast. `presenter` is
  // the casting-note slot both UGC templates declare; a template without one
  // still gets the pinned frame, it just cannot brief the script about them.
  if (actor && "presenter" in template.inputs) {
    values.presenter = actorNote(actor);
  }

  return values;
};

export const produce = async ({
  brand,
  concept,
  templateId,
  template: supplied,
  actor,
  runId,
  store,
  emit,
  fresh = false,
}: {
  brand: BrandKit;
  concept: VideoConcept;
  templateId: string;
  /**
   * A graph composed for this idea rather than looked up.
   *
   * It has already been through the same validation a shipped template is held
   * to, so from here down there is nothing to distinguish the two — which is the
   * point. The engine never learns where a graph came from.
   */
  template?: Workflow;
  /** A saved actor to re-cast, from the library. */
  actor?: ActorIdentity;
  runId: string;
  store?: NodeStore;
  emit: (event: RunEvent) => void;
  fresh?: boolean;
}): Promise<{ video: Artifact; actor?: ActorIdentity }> => {
  const template = supplied ?? templateById(templateId);
  if (!template) throw new Error(`no template '${templateId}'`);

  const inputs = await bindInputs(brand, concept, templateId, template, actor);

  /**
   * Reuse the person, pixel for pixel.
   *
   * The identity node is whatever the template declares (see `role` in
   * graph.ts), so this works on the shipped UGC templates and on a graph a model
   * wrote ten seconds ago, without either of them being special-cased here. The
   * pinned value is shaped like what the node would have returned — `{ url }` —
   * because everything downstream reads `{{master.url}}` and neither knows nor
   * cares that no image was generated.
   *
   * A placeholder frame is never pinned: pinning a `dry-run.local` URL would
   * hand the edit models a URL that does not resolve, turning a free dry run
   * into a failed one.
   */
  const identityNode = nodeWithRole(template, "identity");
  const pins =
    actor && identityNode && !isPlaceholder(actor.masterFrameUrl)
      ? { [identityNode]: { url: actor.masterFrameUrl, pinned: true } }
      : undefined;

  const { scope, result } = await execute({
    workflow: template,
    inputs,
    brand: brand as unknown as Record<string, unknown>,
    runId,
    store,
    emit,
    fresh,
    stubbed: render.mode() === "dry",
    pins,
  });

  const final = (result ?? {}) as {
    url?: string;
    seconds?: number;
    captions?: string[];
    draft?: boolean;
  };

  // Casting is the node that knows what was actually said, and its id is stable
  // across the two UGC templates (`script` in the demo one). A template with
  // neither still produces a video; it just cannot show the script beside it.
  const casting = (scope.casting ?? scope.script) as
    | {
        shots?: { line?: string; seconds?: number }[];
        on_screen_text?: string[];
        actor?: string;
      }
    | undefined;

  const frames = (scope.frames ?? []) as { url?: string }[];

  // Whoever was on camera, surfaced as something reusable. Read from the node
  // playing the identity role rather than one called `master`, so this keeps
  // working on a graph that named it something else.
  const identityUrl = identityNode
    ? (scope[identityNode] as { url?: string } | undefined)?.url
    : undefined;

  // A reused actor keeps their identity — including the library row they
  // already are — so recording them again updates that row rather than forking
  // a near-identical twin on every reuse. Only a newly cast person is described
  // from scratch, and only then is the casting paragraph the source of truth.
  const identity: ActorIdentity | undefined = identityUrl
    ? actor
      ? { ...actor, masterFrameUrl: identityUrl }
      : {
          masterFrameUrl: identityUrl,
          look: String(casting?.actor ?? "").trim() || `A presenter for ${brand.brand_name}.`,
          voice: brand.voice_tone,
          persona: brand.target_personas?.[0]?.name,
          sourceUrl: brand.sourceUrl,
        }
    : undefined;

  if (identity) {
    emit({
      t: "artifact",
      artifact: {
        kind: "actor",
        name: identity.persona ?? `${brand.brand_name} presenter`,
        ...identity,
      },
    });
  }

  const shots = (casting?.shots ?? []).map((shot, index) => ({
    line: shot.line ?? "",
    seconds: Number(shot.seconds ?? 8),
    frame: frames[index]?.url,
  }));

  const video: Artifact = {
    kind: "video",
    template: template.id,
    concept: concept.title,
    seconds:
      Number(final.seconds) ||
      shots.reduce((total: number, shot: { seconds: number }) => total + shot.seconds, 0),
    url: final.url,
    poster: identityUrl ?? frames[0]?.url,
    captions: final.captions ?? casting?.on_screen_text ?? [],
    shots,
    stubbed: render.mode() === "dry",
    draft: render.mode() === "local" || final.draft === true,
  };

  // The actor comes back as well as being announced, because the caller is the
  // one that can record it — and a video's lineage needs the person it was made
  // with, which only exists as a pair with the cut itself.
  return { video, actor: identity };
};
