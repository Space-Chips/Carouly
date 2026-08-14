import { NextResponse, type NextRequest } from "next/server";

import { runNext } from "@/lib/render/run";
import { createSupabaseAdminClient } from "@/lib/supabase";

/**
 * Drains the render queue, one job per invocation.
 *
 * Server-to-server only. It is not a user-facing route and holds no session: the
 * job row carries the user it belongs to, which is what lets a render outlive the
 * request that asked for it.
 *
 * Authenticated with `CRON_SECRET` rather than a second secret, because it is the
 * same class of caller — the platform, not a person — and one fewer secret to
 * leave unset. Vercel Cron already sends this header, so the daily cron can sweep
 * the queue with no extra configuration.
 *
 * One job per call, deliberately. A loop would make the invocation as long as the
 * queue, which is the problem this whole mechanism exists to avoid; instead the
 * response says whether more work is waiting and the caller decides.
 */
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const authorised = (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
};

const handle = async (request: NextRequest) => {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured, so the render worker is disabled." },
      { status: 500 }
    );
  }

  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  try {
    const outcome = await runNext(supabase);

    return NextResponse.json({
      ok: true,
      ...outcome,
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    // A failure to *claim* is different from a job failing — that is handled
    // inside `runNext` and recorded on the row. Reaching here means the queue
    // itself is unreachable, which is worth a 500 so a sweeper retries.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
};

// POST is what the app and the nudge use; GET is what Vercel Cron sends.
export const POST = handle;
export const GET = handle;
