"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Setup problems (missing schema, missing keys) surface here rather than as a
 * blank crash. In production Next replaces the message with a digest, so the
 * checklist below is what the user actually gets to act on.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="pb-24">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight">Something broke</h1>

        <pre className="mt-6 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm whitespace-pre-wrap text-red-300">
          {error.message || "Unknown error"}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>

        <div className="mt-8 rounded-lg border border-white/10 p-5">
          <p className="font-medium">Setup checklist</p>
          <ol className="mt-3 grid gap-2 text-sm text-muted-foreground list-decimal pl-5">
            <li>
              Run <code className="text-foreground">supabase_schema.sql</code> in
              the Supabase SQL editor.
            </li>
            <li>
              Connect Clerk in Supabase → Authentication → Sign In / Providers,
              so row-level security accepts your session.
            </li>
            <li>
              Fill <code className="text-foreground">.env.local</code>:{" "}
              <code className="text-foreground">SUPABASE_SERVICE_ROLE_KEY</code>,{" "}
              <code className="text-foreground">OPEN_ROUTER_API</code>,{" "}
              <code className="text-foreground">APP_ENCRYPTION_KEY</code>,{" "}
              <code className="text-foreground">CRON_SECRET</code>.
            </li>
            <li>Restart the dev server after editing env variables.</li>
          </ol>
        </div>

        <div className="mt-8">
          <Button onClick={reset}>Try again</Button>
        </div>
      </div>
    </main>
  );
}
