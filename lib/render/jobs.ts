/**
 * The render queue.
 *
 * `make_video` used to execute the graph inside the streaming turn, which cannot
 * work anywhere the process has a deadline: a fifteen-second cut measured 27.6
 * minutes on the local backend, against a serverless ceiling of five minutes.
 * The tool now writes a row here and returns, and a worker runs it.
 *
 * Claiming is the only part with any subtlety. Two workers must never take the
 * same job, and a worker that dies must not leave one wedged in `running`
 * forever — so a claim is a conditional update that only succeeds for one
 * caller, and a job whose claim has gone stale becomes claimable again.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { refund } from "@/lib/credits/ledger";

export type JobStatus = "queued" | "running" | "done" | "failed";

export type RenderJob = {
  id: string;
  user_id: string;
  status: JobStatus;
  template_id: string;
  concept_title: string | null;
  payload: Record<string, unknown>;
  progress: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * How long a claim is trusted before the job is considered abandoned.
 *
 * Comfortably longer than a worker's own budget, so a worker that is merely slow
 * is never overtaken by a second one picking up the same job — and short enough
 * that a worker killed mid-node is retried in minutes rather than never.
 */
const CLAIM_TTL_MS = 15 * 60 * 1000;

/** Give up rather than burn credits forever on a job that kills every worker. */
export const MAX_ATTEMPTS = 3;

export const enqueue = async (
  supabase: SupabaseClient,
  job: {
    userId: string;
    templateId: string;
    conceptTitle?: string;
    payload: Record<string, unknown>;
  }
): Promise<string> => {
  const { data, error } = await supabase
    .from("render_jobs")
    .insert({
      user_id: job.userId,
      template_id: job.templateId,
      concept_title: job.conceptTitle ?? null,
      payload: job.payload,
    })
    .select("id")
    .single();

  if (error) throw new Error(`could not queue the render: ${error.message}`);
  return (data as { id: string }).id;
};

/**
 * Take the next job that nobody is working on.
 *
 * The conditional update is the lock. Postgres serialises the two writes, so of
 * two workers reading the same candidate row only one finds it still matching
 * `status = 'queued'` (or stale) at write time and gets a row back; the other
 * gets nothing and moves on. No advisory lock and no transaction needed.
 */
export const claimNext = async (
  supabase: SupabaseClient
): Promise<RenderJob | null> => {
  const stale = new Date(Date.now() - CLAIM_TTL_MS).toISOString();

  const { data: candidates } = await supabase
    .from("render_jobs")
    .select("*")
    .or(`status.eq.queued,and(status.eq.running,claimed_at.lt.${stale})`)
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(5);

  for (const candidate of (candidates ?? []) as RenderJob[]) {
    const { data: claimed } = await supabase
      .from("render_jobs")
      .update({
        status: "running",
        claimed_at: new Date().toISOString(),
        attempts: candidate.attempts + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidate.id)
      // Only if nobody else has moved it since we read it.
      .eq("updated_at", candidate.updated_at)
      .select("*")
      .maybeSingle();

    if (claimed) return claimed as RenderJob;
  }

  return null;
};

/**
 * Save what the graph has done so far.
 *
 * Called as nodes finish, so the studio's poll shows the same picture a live run
 * would have — and so a worker that is killed leaves a record of how far it got
 * rather than an opaque `running`.
 */
export const saveProgress = async (
  supabase: SupabaseClient,
  id: string,
  progress: Record<string, unknown>
) => {
  await supabase
    .from("render_jobs")
    .update({ progress, updated_at: new Date().toISOString() })
    .eq("id", id);
};

export const finish = async (
  supabase: SupabaseClient,
  id: string,
  result: Record<string, unknown>
) => {
  await supabase
    .from("render_jobs")
    .update({
      status: "done",
      result,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
};

/**
 * Hand a job back, or bury it.
 *
 * A job that has attempts left returns to `queued` so the next worker retries
 * it — the cache means a retry resumes rather than starting over. One that has
 * exhausted them is marked failed with the reason, because a queue that silently
 * keeps retrying is one nobody can debug.
 *
 * Burying a job also refunds it. The credits were taken when it was queued, on
 * the promise of a cut, and a job that has exhausted its retries has produced
 * nothing anybody can watch — so keeping the money would be charging for the
 * failure. Only on the final attempt: a job going back on the queue is still
 * going to happen.
 */
export const release = async (
  supabase: SupabaseClient,
  job: RenderJob,
  reason: string
) => {
  const exhausted = job.attempts >= MAX_ATTEMPTS;

  await supabase
    .from("render_jobs")
    .update({
      status: exhausted ? "failed" : "queued",
      error: reason,
      claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  if (exhausted) await refundJob(job);
};

/**
 * Give back what a dead job was charged.
 *
 * Keyed on the job id, so a worker that is itself retried — or a sweeper that
 * releases the same row twice — cannot refund it twice. The amount rides in the
 * payload because it was quoted from the template at queue time and the price
 * list may have moved since; a person is owed what they were charged, not what
 * the same render would cost today.
 */
const refundJob = async (job: RenderJob) => {
  const charged = Number((job.payload as { credits?: number })?.credits ?? 0);
  if (!charged || !job.user_id) return;

  try {
    await refund({
      userId: job.user_id,
      amount: charged,
      detail: `${job.concept_title ?? job.template_id} — render failed`,
      key: `render-refund:${job.id}`,
    });
  } catch (error) {
    // Never allowed to take the queue down. The job is already marked failed,
    // and an unrefunded credit is a support ticket rather than a stuck worker.
    console.error("[credits] could not refund a failed render:", error);
  }
};

/**
 * Bury jobs that ran out of attempts without anybody noticing, and refund them.
 *
 * `release` covers a job whose worker lived long enough to catch the failure.
 * This covers the other kind: a worker killed at the platform's ceiling never
 * runs any of its own cleanup, so a job that has burned all three attempts that
 * way sits at `running` for ever — `claimNext` will not touch it again, nothing
 * marks it failed, and the credits it took are never handed back.
 *
 * Swept at the top of each worker invocation because that is the one thing
 * guaranteed to keep happening. A cron of its own would be a second schedule to
 * forget to configure.
 */
export const buryAbandoned = async (supabase: SupabaseClient) => {
  const stale = new Date(Date.now() - CLAIM_TTL_MS).toISOString();

  const { data } = await supabase
    .from("render_jobs")
    .select("*")
    .eq("status", "running")
    .lt("claimed_at", stale)
    .gte("attempts", MAX_ATTEMPTS)
    .limit(10);

  for (const job of (data ?? []) as RenderJob[]) {
    // Conditional on `updated_at`, like the claim, so a worker that is somehow
    // still alive and writing progress is not declared dead underneath it.
    const { data: buried } = await supabase
      .from("render_jobs")
      .update({
        status: "failed",
        error:
          job.error ??
          "The render was interrupted three times and did not finish. The credits have been returned.",
        claimed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("updated_at", job.updated_at)
      .select("id")
      .maybeSingle();

    if (buried) await refundJob(job);
  }
};

/** One job, for the studio's poll. Scoped to its owner by the caller. */
export const getJob = async (
  supabase: SupabaseClient,
  id: string,
  userId: string
): Promise<RenderJob | null> => {
  const { data } = await supabase
    .from("render_jobs")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  return (data as RenderJob) ?? null;
};
