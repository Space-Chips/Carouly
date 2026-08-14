/**
 * Running one queued render.
 *
 * Shared by the worker route and anything else that wants to drain the queue, so
 * there is one description of what running a job means.
 *
 * Being killed is a supported outcome. A worker has a deadline it cannot control
 * and a single node can take nine minutes, so rather than trying to stop
 * politely, this leans on the node cache: everything finished is already in
 * `render_cache`, the claim goes stale after a while, and the next worker picks
 * the job up and recomputes only the node nobody reached. That is why there is no
 * cooperative time budget here — there is nothing useful to do with one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { RunEvent } from "@/lib/agent/events";
import { makeRecorder } from "@/lib/assets/recorder";
import {
  buryAbandoned,
  claimNext,
  finish,
  release,
  saveProgress,
  type RenderJob,
} from "@/lib/render/jobs";
import { tableStore } from "@/lib/render/store";
import type { BrandKit } from "@/lib/stages/brand";
import { produce } from "@/lib/stages/produce";
import type { Workflow } from "@/lib/workflow/graph";

/** What `make_video` parked in the row for the worker to pick up. */
type Payload = {
  brand: BrandKit;
  concept: { title: string } & Record<string, unknown>;
  template?: Workflow;
  actor?: Record<string, unknown>;
  runId: string;
  kitId?: string;
  /** What this render was charged when it was queued, so it can be handed back. */
  credits?: number;
};

/**
 * Node states, accumulated as the graph reports them.
 *
 * Deliberately the same shape the studio's live graph view already consumes, so
 * polling a job draws the identical picture to watching a run — one renderer,
 * two transports.
 */
const collectProgress = (
  progress: Record<string, unknown>,
  event: RunEvent
): Record<string, unknown> => {
  if (event.t === "graph") {
    return { ...progress, template: event.template, nodes: event.nodes };
  }

  if (event.t === "node.start" || event.t === "node.ok" || event.t === "node.fail") {
    const states = (progress.state ?? {}) as Record<string, unknown>;
    const previous = (states[event.node] ?? {}) as { runs?: number; ms?: number };

    return {
      ...progress,
      state: {
        ...states,
        [event.node]:
          event.t === "node.start"
            ? { status: "running", runs: previous.runs ?? 0, startedAt: Date.now() }
            : event.t === "node.ok"
              ? {
                  status: "ok",
                  ms: (previous.ms ?? 0) + event.ms,
                  cached: event.cached,
                  pinned: event.pinned,
                  runs: (previous.runs ?? 0) + 1,
                }
              : { status: "failed", ms: event.ms, error: event.error, runs: previous.runs ?? 0 },
      },
    };
  }

  return progress;
};

/**
 * Claim one job and run it to completion.
 *
 * Returns what happened so a caller can decide whether to go round again.
 */
export const runNext = async (
  supabase: SupabaseClient
): Promise<{ ran: boolean; id?: string; status?: "done" | "failed" }> => {
  // Before taking new work, settle the jobs whose workers were killed before
  // they could fail properly. They are holding somebody's credits.
  await buryAbandoned(supabase);

  const job = await claimNext(supabase);
  if (!job) return { ran: false };

  try {
    const result = await runJob(supabase, job);
    return { ran: true, id: job.id, status: result };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await release(supabase, job, reason);
    return { ran: true, id: job.id, status: "failed" };
  }
};

const runJob = async (
  supabase: SupabaseClient,
  job: RenderJob
): Promise<"done" | "failed"> => {
  const payload = job.payload as unknown as Payload;

  let progress: Record<string, unknown> = job.progress ?? {};
  let lastWrite = 0;

  // Written as the graph moves, but not on every event: a fanned-out node emits
  // per item, and a database round trip per item would cost more than the node.
  // Two seconds is well under a human's sense of "stuck" and well over the rate
  // a graph produces events at.
  const record = (event: RunEvent) => {
    progress = collectProgress(progress, event);

    if (Date.now() - lastWrite > 2000) {
      lastWrite = Date.now();
      void saveProgress(supabase, job.id, progress);
    }
  };

  const library = makeRecorder(job.user_id, () => {}, () => "");

  const { video, actor } = await produce({
    brand: payload.brand,
    concept: payload.concept as never,
    templateId: job.template_id,
    template: payload.template,
    actor: payload.actor as never,
    runId: payload.runId,
    // The table-backed store is what makes this resumable across invocations.
    store: tableStore(supabase),
    emit: record,
  });

  // Keep the person first, so the cut can point at them — same order the inline
  // path used, for the same reason.
  const kitId = payload.kitId;
  const actorId = actor
    ? await library.actor(actor, kitId ? [kitId] : [])
    : undefined;

  if (video.kind === "video") {
    await library.video(
      { ...video, kitId, actorId },
      [kitId, actorId].filter((id): id is string => Boolean(id))
    );
  }

  await saveProgress(supabase, job.id, progress);
  await finish(supabase, job.id, { video, actorId });

  return "done";
};
