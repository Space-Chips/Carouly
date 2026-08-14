/**
 * The template library.
 *
 * A template is not a preset in the old sense — a set of colours and a font. A
 * template is a production workflow: a DAG of nodes that casts an actor,
 * generates a master frame, derives every beat's frame from it, drives
 * image-to-video, and assembles the cut. The JSON in `presets/` is the whole
 * definition, so adding a format is adding a file.
 *
 * They are imported statically rather than read off disk because the studio runs
 * on the edge of a request: a glob at runtime would work in dev and fail on
 * deploy, which is the worst possible time to find out.
 */

import beforeAfter from "./presets/before_after.json";
import demoScreenVo from "./presets/demo_screen_vo.json";
import founderDirect from "./presets/founder_direct.json";
import povCaptions from "./presets/pov_captions.json";
import streetInterview from "./presets/street_interview.json";
import threeReasons from "./presets/three_reasons.json";
import threeVoices from "./presets/three_voices.json";
import ugcProblemSolution from "./presets/ugc_problem_solution.json";
import ugcTalkingHead from "./presets/ugc_talking_head.json";
import ugcUnboxing from "./presets/ugc_unboxing.json";
import usVsThem from "./presets/us_vs_them.json";

import { parseWorkflow, type Workflow } from "@/lib/workflow/graph";

/**
 * Declaration order is the tie-break, not the ranking.
 *
 * Scoring decides what a given brand is shown (see lib/stages/match.ts), but two
 * templates can tie, and a library that reorders itself between identical runs
 * looks like it is guessing. So the order here is fixed and deliberate: the
 * formats that fit the most brands first, the ones that need a particular kind
 * of product last.
 */
const RAW = [
  ugcTalkingHead,
  ugcProblemSolution,
  founderDirect,
  threeReasons,
  streetInterview,
  ugcUnboxing,
  beforeAfter,
  usVsThem,
  threeVoices,
  demoScreenVo,
  povCaptions,
] as Record<string, unknown>[];

export const TEMPLATES: Workflow[] = RAW.map((raw) =>
  parseWorkflow(raw, String(raw.id))
);

export const templateById = (id: string) =>
  TEMPLATES.find((template) => template.id === id);

/**
 * A one-line human description of what a template will actually do, built from
 * its own graph rather than written by hand — so it cannot drift from the file.
 */
export const templateShape = (template: Workflow) => {
  const counts = new Map<string, number>();

  for (const node of template.nodes) {
    const family = node.type.split(".")[0];
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([family, count]) => `${count} ${family}`)
    .join(" · ");
};
