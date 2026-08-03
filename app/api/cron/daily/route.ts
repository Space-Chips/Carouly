import { NextRequest, NextResponse } from "next/server";

import { runDueBrands } from "@/lib/pipeline";
import { refreshExpiringConnections } from "@/lib/social";

/**
 * Daily generation cron.
 *
 * Hobby-plan deployment uses one daily invocation (see vercel.json), batching
 * every eligible brand. The pipeline retains its hourly mode: remove
 * `ignorePostHour` and restore the hourly expression when the plan supports it.
 * The unique (brand_id, run_date) index makes repeat runs within the same
 * local day a no-op.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically once
 * CRON_SECRET is set in the project env.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 }
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Renew tokens before generating: Instagram's expire after 60 days and
    // TikTok's after 24 hours, and a token can only be refreshed while it is
    // still alive.
    const refreshed = await refreshExpiringConnections();

    // A daily cron cannot wait for each local posting hour, so it creates and
    // publishes each eligible brand batch in this single run.
    const results = await runDueBrands({ ignorePostHour: true });

    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      refreshed,
      brands: results.length,
      created: results.reduce((sum, r) => sum + r.created.length, 0),
      published: results.reduce((sum, r) => sum + r.published, 0),
      results,
    });
  } catch (error) {
    console.error("[cron/daily]", error);

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
