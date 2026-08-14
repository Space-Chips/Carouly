/**
 * Writing a format.
 *
 * The shipped templates cover the formats somebody sat down and built. An idea
 * that does not fit one of them used to get forced into the nearest — which is
 * how you end up shooting a side-by-side comparison as a talking head. This
 * lets the model assemble a graph for the idea instead, out of the same node
 * types the shipped templates are made of.
 *
 * The reason this is safe to hand to a model at all is that the engine already
 * takes an arbitrary DAG: edges come from `{{refs}}`, the topological sort
 * catches cycles, and unknown node types are refused at load. So a composed
 * graph is checked against exactly the same rules a hand-written one is, before
 * a single node runs — and a graph that fails validation costs a retry, not a
 * render.
 *
 * What it cannot check is whether the result is any good. That is what the graph
 * view is for: the composed DAG is drawn in the thread the moment it exists.
 */

import { json as llmJson, MODEL, ModelError } from "@/lib/agent/llm";
import type { VideoConcept } from "@/lib/agent/events";
import type { BrandKit } from "@/lib/stages/brand";
import { templateById } from "@/lib/templates";
import { NODE_DOCS } from "@/lib/workflow/nodes";
import {
  parseWorkflow,
  validateWorkflow,
  type Workflow,
} from "@/lib/workflow/graph";

const SYSTEM = `You compose production graphs for short vertical video.

A graph is a JSON object of nodes. Nodes reference each other with {{node_id.field}};
edges are derived from those references, so you never declare wiring. \`{{inputs.x}}\`
reads a declared input and \`{{brand.x}}\` reads the brand kit.

Rules that are not negotiable, because they are what makes the output watchable:
- Identity comes from pixels. Generate ONE master frame with fal.image, then derive
  every per-beat frame from it with fal.image_edit. Three independent generations
  produce three different people.
- The video model speaks for itself. There is no voiceover track to add later, so a
  spoken line belongs in the fal.video prompt, in quotes.
- foreach fans a node over a list; \`as\` names the loop variable. To pair two lists
  (script beats with their frames) you must zip them first.
- Pin shared style and negative prompts in one \`const\` node and reference it.

Return ONLY the JSON object.`;

type Composed = {
  id?: string;
  name?: string;
  description?: string;
  inputs?: Record<string, { description: string; required?: boolean }>;
  nodes?: Record<string, unknown>[];
  output?: string;
};

const shape = {
  id: "kebab_case_id",
  name: "Human name for this format",
  description: "one line on what it does",
  inputs: { hook: { description: "what this input is for", required: true } },
  nodes: [
    { id: "style", type: "const", value: { frame: "...", negative: "..." } },
    { id: "script", type: "llm.json", system: "...", prompt: "...", schema: {} },
  ],
  output: "{{final}}",
};

/**
 * Ask for a graph, check it, and hand back the problems if it is wrong.
 *
 * The repair loop is the whole point. Validation produces sentences like "node
 * 'clips': refers to '{{beats}}', which is not a node in this graph", and a model
 * given that fixes it — where a model given "invalid workflow" guesses.
 */
export const composeWorkflow = async ({
  concept,
  brief,
  brand,
}: {
  concept: VideoConcept;
  brief?: string;
  brand: BrandKit;
}): Promise<Workflow> => {
  // A worked example beats any amount of description: it shows the master-frame
  // anchor, the zip, and the foreach fan-out in the exact JSON dialect wanted.
  const example = templateById("ugc_talking_head");

  const base = `IDEA
title: ${concept.title}
hook: ${concept.hook}
format: ${concept.format}
beats: ${JSON.stringify(concept.beats ?? [])}
cta: ${concept.cta}
${brief ? `shape wanted: ${brief}` : ""}

BRAND
${brand.brand_name} — ${(brand.brand_summary ?? "").slice(0, 400)}
voice: ${brand.voice_tone}

NODE TYPES
${Object.entries(NODE_DOCS)
  .map(([name, doc]) => `- ${name}: ${doc}`)
  .join("\n")}

A WORKING EXAMPLE, for dialect only — do not copy its shape if the idea wants another
${JSON.stringify(
  {
    id: example?.id,
    inputs: example?.inputs,
    nodes: example?.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      ...(node.foreach ? { foreach: node.foreach, as: node.as } : {}),
      ...node.params,
    })),
    output: example?.output,
  },
  null,
  1
).slice(0, 6000)}

Compose a graph for the idea. Keep it under 10 nodes and under 25 seconds of video.`;

  let prompt = base;
  let lastProblems: string[] = [];

  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await llmJson<Composed>({
      system: SYSTEM,
      prompt,
      schema: shape,
      model: MODEL.synth,
      maxTokens: 4000,
      attempts: 1,
    });

    const workflow = parseWorkflow(
      raw as unknown as Record<string, unknown>,
      `composed_${Date.now().toString(36)}`
    );

    // Composed graphs get their own id space, so one can never quietly shadow a
    // shipped template that someone else is relying on.
    workflow.id = `composed_${(raw.id ?? "format").replace(/[^a-z0-9_]/gi, "_").slice(0, 32)}`;

    const problems = validateWorkflow(workflow);
    if (!problems.length) return workflow;

    lastProblems = problems;
    prompt = `${base}

Your previous graph could not run. Fix exactly these and return the whole object again:
${problems.map((problem) => `- ${problem}`).join("\n")}`;
  }

  throw new ModelError(
    `could not compose a runnable graph after 3 attempts. Last problems: ${lastProblems.join(
      "; "
    )}`
  );
};
