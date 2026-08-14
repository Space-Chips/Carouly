/**
 * Asking a worker to look at the queue.
 *
 * A queued job needs something to invoke the worker. Rather than take on a
 * scheduler, three cheap things do it between them, and each one covers the
 * others' gap:
 *
 *  - the tool nudges once, straight after enqueuing, so a render normally starts
 *    within a second of being asked for;
 *  - the studio's poll nudges whenever it finds a job still `queued`, so the
 *    person watching is what drives it forward;
 *  - the daily cron sweeps whatever is left, so nothing can be stranded for ever
 *    by a dropped request.
 *
 * Deliberately fire-and-forget. The caller is either finishing a turn or
 * answering a poll, and neither should wait on a render starting — the job row is
 * already durable, so a nudge that never lands costs latency and not work.
 */

const origin = () => {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  // Set by Vercel on every deployment, and the only reliable self-reference
  // there — a preview URL is not knowable at build time.
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://127.0.0.1:3000";
};

export const nudgeWorker = async () => {
  const secret = process.env.CRON_SECRET;
  // Without it the worker would answer 401, so there is nothing to gain by
  // knocking. The queue still drains whenever the cron runs.
  if (!secret) return;

  try {
    await fetch(`${origin()}/api/render/worker`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      // The point is to start another invocation, not to wait for it. A render
      // takes minutes; this request is abandoned after a moment either way.
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Includes the timeout, which is the expected outcome rather than a fault:
    // the worker has been invoked and is busy, which is what was wanted.
  }
};
