/**
 * What the agent can do.
 *
 * Every stage of the old fixed pipeline is now a tool. That is the whole change
 * behind "agentic first": the order is not baked into a function that calls
 * capture, then research, then synthesis. The agent decides, which is what lets
 * it do the things a fixed sequence could not — re-read a page after the user
 * corrects it, skip research on a site that already said everything, or stop in
 * the middle and ask a question.
 *
 * `ask_user` is the interesting one. It does not return a value; it ends the
 * turn. Everything else the agent might do about a missing fact — guess, hedge,
 * leave a hole — is worse than stopping, so stopping is a first-class move.
 */

import type {
  ActorCandidate,
  RunEvent,
  StudioContext,
  TemplateCandidate,
} from "@/lib/agent/events";
import { renderCost } from "@/lib/credits/prices";
import type { Wallet } from "@/lib/credits/wallet";
import type { ToolDef } from "@/lib/agent/loop";
import type { Recorder } from "@/lib/assets/recorder";
import { templateById } from "@/lib/templates";
import { buildBrandKit, research } from "@/lib/stages/brand";
import { capture } from "@/lib/stages/capture";
import { matchTemplates, rank } from "@/lib/stages/match";
import { castingOptions, rankActors } from "@/lib/stages/cast";
import { composeWorkflow } from "@/lib/stages/compose";
import { produce } from "@/lib/stages/produce";
import { describeGraph, nodeWithRole } from "@/lib/workflow/graph";
import { dryRun } from "@/lib/tools/fal";
import { publishVideoForUser } from "@/lib/social";

/** Raised by `ask_user` to unwind the loop and end the turn. */
export class AskUser extends Error {
  constructor(
    readonly question: string,
    readonly why?: string,
    readonly placeholder?: string
  ) {
    super(question);
    this.name = "AskUser";
  }
}

export type ToolWorld = {
  context: StudioContext;
  userId?: string | null;
  emit: (event: RunEvent) => void;
  /** The id of the tool call currently running, for nested step events. */
  currentId: () => string;
  /**
   * What this run is spending, and what is left.
   *
   * Every tool that costs money charges before it spends any, which is the whole
   * discipline here: a charge that happens afterwards is a bill for work the
   * person could not have refused. The amounts are wildly uneven and that is the
   * point — reading a site is two credits and a cut is a few hundred, so a free
   * account can do the entire run up to the render several times over and cannot
   * do the render once.
   *
   * Required rather than optional. A caller that forgets it should get a type
   * error, not free renders; scripts pass `freeWallet()` and say so.
   */
  wallet: Wallet;
  /**
   * Where what this run makes gets kept. Every method is best-effort and
   * announces itself, so a tool never has to decide whether recording is worth
   * the risk of failing the thing it just made.
   */
  library: Recorder;
};

/**
 * Do two references point at the same site?
 *
 * Both sides get the same treatment — scheme added if missing, `www.` dropped —
 * because the agent will hand back whatever it was originally given, which is
 * rarely the canonical form the capture stored. Anything unparseable is simply
 * not a match, so a malformed address falls through to a real fetch and gets a
 * proper error from there rather than throwing inside a comparison.
 */
export const sameSite = (a: string, b: string) => {
  const host = (value: string) => {
    try {
      return new URL(/^https?:\/\//.test(value) ? value : `https://${value}`).hostname
        .replace(/^www\./, "")
        .toLowerCase();
    } catch {
      return null;
    }
  };

  const left = host(a);
  return left !== null && left === host(b);
};

const needCapture = (world: ToolWorld) => {
  if (!world.context.capture) {
    throw new Error("No site has been read yet. Call read_site first.");
  }
  return world.context.capture;
};

const needKit = (world: ToolWorld) => {
  if (!world.context.kit) {
    throw new Error("There is no brand kit yet. Call build_brand_kit first.");
  }
  return world.context.kit;
};

/**
 * Did the agent mean it?
 *
 * Every expensive tool now takes a flag that lets it redo finished work, because
 * sometimes redoing it is right — the person says the site has changed, or
 * corrects what they sell. The flag is a string off a JSON tool call, so it
 * arrives as `true`, `"true"`, or `"yes"` depending on the model and the day.
 */
const asked = (value: unknown) =>
  value === true || value === "true" || value === "yes" || value === "1";

export const buildTools = (world: ToolWorld): ToolDef[] => [
  {
    name: "read_site",
    label: "Reading the site",
    description:
      "Fetch a web address and extract its copy, brand colours, logo and imagery. " +
      "Always the first thing to do with a new address.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The address, e.g. northline.coffee" },
        refresh: {
          type: "boolean",
          description:
            "Read it again from scratch. Only when the person has said the site " +
            "itself changed. Never to re-orient yourself — the page you already " +
            "read is handed straight back to you.",
        },
      },
      required: ["url"],
    },
    run: async ({ url, refresh }) => {
      // Already read, same site: hand back what we have.
      //
      // The system prompt tells the agent not to redo finished work, but a
      // prompt is a request and this is a guarantee. After an interruption the
      // model quite reasonably reaches for read_site again to re-orient, and
      // without this that costs a full re-fetch every time somebody presses
      // stop and carries on.
      const known = world.context.capture;
      if (known && !asked(refresh) && sameSite(known.url, url)) {
        return JSON.stringify({
          already_read: true,
          title: known.title,
          copy_chars: known.markdown.length,
          palette: known.palette.colors,
          pages_available: known.links.slice(0, 20).map((link) => link.href),
          excerpt: known.markdown.slice(0, 2500),
        });
      }

      // Charged here rather than at the top of the tool, so handing back a page
      // that has already been read stays free. The agent reaches for this tool
      // to re-orient itself after an interruption, and billing for that would be
      // charging somebody for the machine's own forgetfulness.
      await world.wallet.charge("read_site", { detail: url });

      const result = await capture(url, (message) =>
        world.emit({
          t: "tool.step",
          id: world.currentId(),
          label: "note",
          detail: message,
          ok: true,
        })
      );

      world.context.site = result.url.replace(/^https?:\/\//, "");
      world.context.capture = {
        url: result.url,
        title: result.title,
        markdown: result.markdown,
        links: result.links,
        palette: result.palette,
        assets: result.assets,
        meta: result.meta,
      };

      world.emit({
        t: "artifact",
        artifact: {
          kind: "palette",
          colors: result.palette.colors,
          source: result.palette.source,
        },
      });

      if (result.assets.length) {
        world.emit({ t: "artifact", artifact: { kind: "assets", items: result.assets } });
        await world.library.brandAssets(result.assets, world.context.site);
      }

      return JSON.stringify({
        title: result.title,
        copy_chars: result.markdown.length,
        palette: result.palette.colors,
        pages_available: result.links.slice(0, 20).map((link) => link.href),
        excerpt: result.markdown.slice(0, 2500),
      });
    },
  },

  {
    name: "research_site",
    label: "Looking around",
    description:
      "Explore the site's other pages — pricing, about, FAQ — for facts the landing " +
      "page does not carry. Returns what it found and, importantly, what it could not find.",
    parameters: {
      type: "object",
      properties: {
        again: {
          type: "boolean",
          description:
            "Look around a second time. Only when you are after something specific " +
            "the first pass did not cover.",
        },
      },
      required: [],
    },
    run: async ({ again }) => {
      const captured = needCapture(world);

      // The most expensive tool in the set — it fetches and reads several pages
      // — and the one with no natural reason to run twice. Without this it did,
      // whenever the model reached for it to re-orient after a stop or an answer.
      if (world.context.research && !asked(again)) {
        return JSON.stringify({ already_done: true, ...world.context.research });
      }

      await world.wallet.charge("research_site", {
        detail: world.context.site,
      });

      const notes = await research(
        {
          url: captured.url,
          finalUrl: captured.url,
          title: captured.title,
          markdown: captured.markdown,
          links: captured.links,
          slug: "",
          meta: captured.meta,
          palette: captured.palette,
          assets: captured.assets,
          httpFallback: null,
        },
        (report) =>
          world.emit({
            t: "tool.step",
            id: world.currentId(),
            label: report.name,
            detail: report.detail,
            ms: report.ms,
            ok: report.ok,
          })
      );

      world.context.research = notes;
      return JSON.stringify(notes);
    },
  },

  {
    name: "ask_user",
    label: "Asking you",
    description:
      "Stop and ask the person a direct question. Use this the moment something " +
      "you need is genuinely not on the site — pricing, what a product actually " +
      "does, who it is for — instead of guessing or leaving it vague. The run " +
      "pauses here and resumes with their answer.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "One direct question, plainly worded." },
        why: {
          type: "string",
          description: "One short line on what you looked at and why it matters.",
        },
        placeholder: { type: "string", description: "An example answer, as a hint." },
      },
      required: ["question"],
    },
    run: async ({ question, why, placeholder }) => {
      throw new AskUser(question, why, placeholder);
    },
  },

  {
    name: "build_brand_kit",
    label: "Working out the brand",
    description:
      "Turn everything read so far into a brand kit: what they sell, how they write, " +
      "who buys it, and five video ideas. Every quote is checked against the real page " +
      "and dropped if it is not there verbatim. Builds once — if a kit already " +
      "exists you get it back, unchanged, at no cost.",
    parameters: {
      type: "object",
      properties: {
        rebuild: {
          type: "boolean",
          description:
            "Throw the existing kit away and build it again. Only when the person " +
            "has corrected something the kit is wrong about — what they sell, who " +
            "buys it, how they talk. Their correction is already in front of you " +
            "under 'the owner has told you'. Rebuilding writes five new ideas and " +
            "discards the ones on screen, so it is not a way to refresh yourself.",
        },
      },
      required: [],
    },
    run: async ({ rebuild }) => {
      /**
       * The kit is built once.
       *
       * This is the tool that made a run look like it had started over: it is
       * the one that emits the brand card and the five ideas, so calling it a
       * second time replaced both on screen with different text. Nothing had
       * gone wrong — the model simply reached for it again after an answer came
       * back — but from the outside it is indistinguishable from the machine
       * losing its place and beginning again.
       */
      if (world.context.kit && !asked(rebuild)) {
        const existing = world.context.kit;

        return JSON.stringify({
          already_built: true,
          brand: existing.brand_name,
          summary: existing.brand_summary,
          voice: existing.voice_tone,
          concepts: existing.video_concepts.map((concept) => concept.title),
          note:
            "This kit is already on screen. Do not rebuild it to look at it — " +
            "everything it holds is in this reply.",
        });
      }

      const captured = needCapture(world);

      // The most expensive thing that is not a render, and the one the free
      // grant is really sized around: a person can afford this three times over
      // before they ever meet the price of a cut.
      await world.wallet.charge("build_brand_kit", {
        detail: world.context.site,
      });

      const { kit, dropped } = await buildBrandKit(
        {
          url: captured.url,
          finalUrl: captured.url,
          title: captured.title,
          markdown: captured.markdown,
          links: captured.links,
          slug: world.context.site ?? "",
          meta: captured.meta,
          palette: captured.palette,
          assets: captured.assets,
          httpFallback: null,
        },
        {
          ...(world.context.research ?? {}),
          // Anything the person told us outranks anything inferred from the page.
          answers_from_the_owner: world.context.answers ?? {},
        },
        // The longest step in the run by a wide margin — a single large
        // generation, sometimes two or three when the schema comes back short.
        // read_site and research_site have always narrated themselves; this one
        // used to sit silent for two minutes, which is long enough to read as a
        // hang rather than as work.
        (step) =>
          world.emit({
            t: "tool.step",
            id: world.currentId(),
            label: step.label,
            detail: step.detail,
            ms: step.ms,
            ok: step.ok,
          })
      );

      world.context.kit = kit;

      world.emit({
        t: "artifact",
        artifact: {
          kind: "brand",
          name: kit.brand_name,
          summary: kit.brand_summary,
          voice: kit.voice_tone,
          valueProps: kit.value_props ?? [],
          personas: (kit.target_personas ?? []).map((persona) => ({
            name: persona.name,
            needs: persona.needs,
          })),
          evidence: (kit.products ?? []).flatMap((product) =>
            (product.evidence ?? []).map((entry) => ({
              quote: entry.quote,
              sourceUrl: entry.source_url,
            }))
          ),
          dropped: kit.evidence_check.dropped,
        },
      });

      world.emit({ t: "artifact", artifact: { kind: "concepts", items: kit.video_concepts } });

      // Kept as it is built. A kit is the expensive thing on this path — several
      // model calls and a crawl — and the one most worth never paying for twice.
      world.context.kitId = await world.library.kit(kit);

      return JSON.stringify({
        brand: kit.brand_name,
        verified_quotes: kit.evidence_check.kept,
        dropped_quotes: kit.evidence_check.dropped,
        dropped_examples: dropped.slice(0, 3),
        concepts: kit.video_concepts.map((concept) => concept.title),
      });
    },
  },

  {
    name: "suggest_templates",
    label: "Choosing a format",
    description:
      "Score every production format in the library against this brand, then " +
      "recommend the few worth shooting and show them to the person to pick from. " +
      "The rest of the library travels with them, so they can browse past your " +
      "recommendation without another turn. The run waits for their choice.",
    parameters: { type: "object", properties: {}, required: [] },
    run: async () => {
      const kit = needKit(world);

      // Ranking costs a model call, and the answer cannot change while the kit
      // has not. Re-showing the cards is right — the person still has to choose
      // — but re-deriving them is not, so the charge sits with the derivation.
      let shortlist = world.context.templates;
      let library: TemplateCandidate[] | undefined;

      if (!shortlist) {
        await world.wallet.charge("suggest_templates", {
          detail: kit.brand_name,
        });
        const matched = await matchTemplates(kit);
        shortlist = matched.shortlist;
        library = matched.all;
      } else {
        // Cached recommendation, fresh browse list. The ranking is deterministic
        // — no model, no charge — so re-deriving it costs nothing and beats
        // carrying eleven templates through every turn of the conversation.
        library = rank(kit);
      }

      // What is left after the recommendation, computed once. Counting the
      // unfiltered ranking here said "also browsable: 11" beside three
      // recommendations drawn from those same eleven, which is the sort of
      // number the agent then repeats out loud.
      const rest = library.filter(
        (template) => !shortlist.some((pick) => pick.id === template.id)
      );

      world.context.templates = shortlist;
      world.emit({
        t: "choice",
        prompt: "Picked for this brand.",
        items: shortlist,
        library: rest,
      });

      return JSON.stringify({
        recommended: shortlist.map((template: TemplateCandidate) => ({
          id: template.id,
          concept: template.concept,
          why: template.why,
        })),
        also_browsable: rest.length,
        // The cards carry the price, so the agent does not have to quote it —
        // but it does need to know there is one, or it offers to render as
        // though the next step were free.
        costs: shortlist.map((template: TemplateCandidate) => ({
          id: template.id,
          credits: renderCost(template),
        })),
        balance: world.wallet.balance(),
        note: "The person is choosing now. Stop and wait — do not call make_video yourself.",
      });
    },
  },

  {
    name: "cast_actor",
    label: "Casting",
    description:
      "Show the person a shelf of possible actors for the format they just chose — " +
      "people they have filmed before, plus the casting library ranked against " +
      "their audience — and wait while they pick one or describe somebody else. " +
      "Call this immediately after a format is chosen and before make_video, " +
      "unless they have already told you who is on camera. Never choose for them.",
    parameters: {
      type: "object",
      properties: {
        template_id: {
          type: "string",
          description: "The format they chose, whose look the casting has to suit.",
        },
      },
      required: ["template_id"],
    },
    run: async ({ template_id }) => {
      const kit = needKit(world);

      /**
       * A format with nobody in it has nothing to cast.
       *
       * Read off the graph rather than from a list of template ids, so it stays
       * true for a format a model wrote ten seconds ago: the `identity` role is
       * the node whose face every other frame is derived from, and a graph
       * without one — a silent POV cut, a screen demo — genuinely has no such
       * decision to offer. Saying so is better than showing a shelf of people
       * who will not appear.
       */
      const template =
        world.context.composed?.id === template_id
          ? world.context.composed
          : templateById(template_id);

      if (template && !nodeWithRole(template, "identity")) {
        return JSON.stringify({
          casting: "not applicable",
          note:
            `«${template.name}» holds no single face across its shots, so there is ` +
            "nobody to cast. Say that in one short line and call make_video.",
        });
      }

      // Already chosen, this run. Re-showing the shelf after somebody has picked
      // reads as the machine forgetting, and the identity is already in context
      // where make_video will find it.
      if (world.context.actor) {
        return JSON.stringify({
          already_cast: true,
          who: world.context.actor.persona ?? world.context.actor.look.slice(0, 80),
          note: "This person is already cast. Call make_video — do not ask again.",
        });
      }

      const saved = await world.library.savedActors();

      let shortlist = world.context.actors;
      let all: ActorCandidate[] | undefined;

      if (!shortlist) {
        // Charged with the ranking, not with the shelf. Showing the same people
        // again after a stop costs nothing, for the same reason re-reading a
        // captured site does.
        await world.wallet.charge("cast_actor", { detail: kit.brand_name });

        const options = await castingOptions(kit, saved);
        shortlist = options.shortlist;
        all = options.all;
      } else {
        // Cached shelf, fresh browse list. Scoring the presets is deterministic
        // — no model, no charge — so re-deriving it costs nothing, and without
        // this a second showing loses everybody who was not on the shelf.
        all = rankActors(kit);
      }

      const rest = all.filter(
        (candidate) => !shortlist.some((pick) => pick.id === candidate.id)
      );

      world.context.actors = shortlist;

      world.emit({
        t: "cast",
        prompt: "Who is on camera?",
        template: template_id,
        items: shortlist,
        library: rest,
        custom: true,
      });

      return JSON.stringify({
        shown: shortlist.map((candidate: ActorCandidate) => candidate.name),
        also_browsable: rest.length,
        from_their_library: saved.length,
        note:
          "The person is casting now. Stop and wait — do not call make_video, and " +
          "do not pick somebody for them.",
      });
    },
  },

  {
    name: "compose_template",
    label: "Writing a format",
    description:
      "Build a bespoke production graph for one idea, out of the same node types " +
      "the shipped templates are made of. Use this when an idea does not fit any " +
      "of the ranked templates — a format nobody has built yet — rather than " +
      "forcing it into the nearest one. Validated before anything runs, so a " +
      "mistake costs a retry and not a render.",
    parameters: {
      type: "object",
      properties: {
        concept_title: { type: "string", description: "Which idea this is for." },
        brief: {
          type: "string",
          description: "In one line, what shape this format has and why it suits the idea.",
        },
      },
      required: ["concept_title"],
    },
    run: async ({ concept_title, brief }) => {
      const kit = needKit(world);
      const concept =
        kit.video_concepts.find((item) => item.title === concept_title) ??
        kit.video_concepts[0];

      await world.wallet.charge("compose_template", { detail: concept.title });

      const composed = await composeWorkflow({ concept, brief, brand: kit });

      world.context.composed = composed;

      // Show the graph the moment it exists. A format written by a model is
      // exactly the thing you want to look at before it spends anything.
      world.emit({
        t: "graph",
        template: composed.id,
        nodes: describeGraph(composed),
      });

      return JSON.stringify({
        template_id: composed.id,
        name: composed.name,
        nodes: composed.nodes.map((node) => `${node.id} (${node.type})`),
        inputs: Object.keys(composed.inputs),
        note: "Call make_video with this template_id to run it.",
      });
    },
  },

  {
    name: "make_video",
    label: "Making the video",
    description:
      "Execute a template's graph and produce the cut. Only call this once the " +
      "person has chosen a template.",
    parameters: {
      type: "object",
      properties: {
        template_id: { type: "string", description: "The template to run." },
        concept_title: { type: "string", description: "Which video idea to make." },
      },
      required: ["template_id"],
    },
    run: async ({ template_id, concept_title }) => {
      const kit = needKit(world);

      const concept =
        kit.video_concepts.find((item) => item.title === concept_title) ??
        kit.video_concepts[0];

      // A composed graph lives in the context, not in the shipped library.
      const composed =
        world.context.composed && world.context.composed.id === template_id
          ? world.context.composed
          : undefined;

      /**
       * The bill, quoted from the length the format produces.
       *
       * Taken before anything is resolved and before a single frame is asked
       * for, so a refusal costs nothing and the person is not left looking at a
       * half-built graph — everything above this line is already on their screen
       * and stays there.
       *
       * The same number the template card showed them, because both come from
       * `renderCost` and the card is the quote. A charge that disagrees with the
       * quote by even a credit is the end of anyone trusting the meter.
       */
      const cost = renderCost(composed ?? templateById(template_id));

      await world.wallet.charge("make_video", {
        amount: cost,
        detail: concept.title,
        gate: "render",
      });

      /** Put back what was taken, when the render never started. */
      const unwind = async (why: string) => {
        await world.wallet.refund(cost, `${concept.title} — ${why}`);
      };

      /**
       * On a deployment the render is queued; locally it runs here.
       *
       * Not a compromise — the two environments genuinely differ. A dev server
       * has no execution ceiling, and the local backend takes 27 minutes for a
       * fifteen-second cut, so running it inline is both possible and the fastest
       * way to iterate on a template. A serverless function is killed after five
       * minutes, so inline is not merely slow there, it cannot finish.
       *
       * `VERCEL` is set on every deployment including previews; the env var is
       * the override for testing the queued path locally.
       */
      const queued =
        process.env.CAROULY_RENDER_QUEUE === "1" || Boolean(process.env.VERCEL);

      if (queued) {
        const jobId = await world.library.queueRender({
          templateId: template_id,
          conceptTitle: concept.title,
          payload: {
            brand: kit,
            concept,
            template: composed,
            actor: world.context.actor,
            runId: world.context.site ?? "run",
            kitId: world.context.kitId,
            // Travels with the job so the worker can hand it back if the render
            // never produces anything. The worker has no session and no price
            // list at that point — only the row — so the amount has to be in it.
            credits: cost,
          },
        });

        if (!jobId) {
          await unwind("the render was never queued");

          // Two causes, and the message names both rather than guessing: the
          // recorder is a no-op without a signed-in user, and `enqueue` fails if
          // the table is absent. Either way nothing was started, which is the
          // part that must not be reported as a render in progress.
          throw new Error(
            "The render could not be queued, so nothing was started. Either this " +
              "run has no signed-in user to own the job, or supabase_schema.sql " +
              "has not been run against this project yet."
          );
        }

        world.emit({ t: "render.queued", jobId, template: template_id, concept: concept.title });

        return JSON.stringify({
          queued: true,
          job: jobId,
          concept: concept.title,
          charged: cost,
          balance: world.wallet.balance(),
          note:
            "The render is running in the background and the person is watching it. " +
            "Say one short line that it has started. Do not call make_video again.",
        });
      }

      /**
       * A render that threw is a render nobody can watch, so it costs nothing.
       *
       * Deliberately all of it, even though some nodes did complete and the
       * provider did bill for them. Refunding the finished half would be more
       * accurate and completely unexplainable — and the node cache means those
       * nodes are not lost anyway: the retry resumes from them, so the credits
       * handed back here buy the same work a second time round.
       */
      let video, actor;

      try {
        ({ video, actor } = await produce({
          brand: kit,
          concept,
          templateId: template_id,
          template: composed,
          // Reuse a library actor when the run was given one: their saved frame
          // is pinned into the graph, so the same face carries across sessions
          // rather than being described and redrawn.
          actor: world.context.actor,
          runId: world.context.site ?? "run",
          emit: world.emit,
        }));
      } catch (error) {
        await unwind("the render failed");
        throw error;
      }

      world.emit({ t: "artifact", artifact: video });
      if (video.kind === "video") world.context.video = video;

      // Keep the person first, so the cut can point at them. Reusing an actor
      // updates that same row, which is what keeps one person from becoming
      // eight near-identical rows over eight runs.
      const kitId = world.context.kitId;
      const actorId = actor
        ? await world.library.actor(actor, kitId ? [kitId] : [])
        : undefined;

      if (actor && actorId) {
        world.context.actor = { ...actor, assetId: actorId };
      }

      if (video.kind === "video") {
        await world.library.video(
          { ...video, kitId, actorId },
          [kitId, actorId].filter((id): id is string => Boolean(id))
        );
      }

      return JSON.stringify({
        made: template_id,
        concept: concept.title,
        seconds: video.kind === "video" ? video.seconds : 0,
        charged: cost,
        balance: world.wallet.balance(),
        placeholder_media: dryRun(),
      });
    },
  },

  {
    name: "publish_video",
    label: "Posting the video",
    description:
      "Publish the latest completed video to connected Instagram and TikTok accounts. " +
      "Only call this when the person explicitly asks you to post or publish. Never call it automatically after make_video.",
    parameters: {
      type: "object",
      properties: {
        caption: { type: "string", description: "Optional caption; leave empty to use the brand and video concept." },
        hashtags: { type: "string", description: "Optional comma-separated hashtags without the # symbol." },
      },
      required: [],
    },
    run: async ({ caption, hashtags }) => {
      if (!world.userId) throw new Error("You must be signed in to publish a video.");
      const video = world.context.video;
      if (!video?.url || video.stubbed || video.url.startsWith("https://dry-run.local/")) {
        throw new Error("There is no publishable rendered video yet. Make a video first.");
      }

      const kit = needKit(world);
      const tags = String(hashtags ?? "")
        .split(/[\s,#]+/)
        .map((tag) => tag.trim())
        .filter(Boolean);
      const outcomes = await publishVideoForUser(world.userId, {
        videoUrl: video.url,
        caption: String(caption ?? "").trim() || `${kit.brand_name}: ${video.concept}`,
        hashtags: tags,
      });

      if (!outcomes.length) {
        throw new Error("No enabled Instagram or TikTok account is connected. Connect one in Settings first.");
      }

      return JSON.stringify({
        published: outcomes.filter((outcome) => outcome.status === "published").map((outcome) => outcome.platform),
        failed: outcomes.filter((outcome) => outcome.status === "failed").map((outcome) => ({ platform: outcome.platform, error: outcome.error })),
        links: outcomes.filter((outcome) => outcome.permalink).map((outcome) => outcome.permalink),
      });
    },
  },
];
