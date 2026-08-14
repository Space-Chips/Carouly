import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getJob } from "@/lib/render/jobs";
import { nudgeWorker } from "@/lib/render/nudge";
import { createSupabaseAdminClient } from "@/lib/supabase";

/**
 * One render job, for the studio to poll.
 *
 * Scoped to its owner explicitly rather than relying on the table's policy: this
 * reads with the service-role key, which bypasses RLS, so the `user_id` filter in
 * `getJob` *is* the access control here rather than a belt-and-braces extra.
 *
 * Polling also keeps the queue moving. A job still sitting `queued` means no
 * worker has picked it up — the invocation that was meant to may have been
 * dropped, or the job may have been released after its worker was killed — so
 * looking at it pokes a worker. That makes the person watching the render the
 * thing that drives it forward, which is exactly who wants it to progress.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const job = await getJob(supabase, id, userId);

  if (!job) return NextResponse.json({ error: "No such render." }, { status: 404 });

  if (job.status === "queued") void nudgeWorker();

  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    result: job.result,
    error: job.error,
    attempts: job.attempts,
  });
};
