import { auth } from "@clerk/nextjs/server";

import { streamTurn, type Turn } from "@/lib/agent/chat";
import type { StudioContext } from "@/lib/agent/events";
import { openAccount } from "@/lib/credits/ledger";

/**
 * One turn of the conversation, streamed as NDJSON.
 *
 * Node runtime rather than edge: a turn can make a dozen outbound fetches and
 * sit on a synthesis call for the better part of a minute.
 *
 * The client sends the transcript and the accumulated context back every turn.
 * That is not redundancy — it is what makes this survive a cold instance, which
 * a Map in module scope does not.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = async (request: Request) => {
  const { userId } = await auth();
  if (!userId) return new Response("Sign in first.", { status: 401 });

  const body = (await request.json()) as {
    message?: string;
    history?: Turn[];
    context?: StudioContext;
  };

  if (!body.message?.trim()) {
    return new Response("Send a message.", { status: 400 });
  }

  /**
   * The balance the turn opens with.
   *
   * One read, here, rather than one per tool. It is a starting point for the
   * meter and for quoting a cut before anything runs — every actual charge goes
   * to the database, which is the only place that can decide whether a balance
   * covers something while another tab is spending it.
   *
   * `openAccount` rather than `getBalance`, so somebody whose signup webhook
   * never landed gets their welcome credits on their first message instead of
   * being told they cannot afford to read a web page.
   */
  const { balance } = await openAccount(userId);

  return new Response(
    streamTurn({
      message: body.message.trim(),
      history: (body.history ?? []).slice(-20),
      context: body.context ?? {},
      // So the run can record what it makes into this person's library.
      userId,
      balance,
      // Pressing stop aborts the fetch, which aborts this. Without it the loop
      // would carry on calling tools with nobody listening.
      signal: request.signal,
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        // Without this a proxy buffers the whole turn and delivers it in one
        // lump at the end, which defeats the point of streaming it.
        "X-Accel-Buffering": "no",
      },
    }
  );
};
