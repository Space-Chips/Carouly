"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteConnection,
  saveConnection,
  setConnectionEnabled,
} from "@/lib/actions/connection.actions";
import { Platform } from "@/types";

export type AdapterInfo = {
  platform: Platform;
  label: string;
  docsUrl?: string;
  /** Paste-a-token fields. Empty when one-click connect is available. */
  fields: { key: string; label: string; hint?: string; secret?: boolean }[];
  oauth?: {
    /** App credentials are present, so the button actually works. */
    ready: boolean;
    summary: string;
    /** What the user needs on their side, in their words. */
    requirement?: string;
    setupUrl: string;
    envVars: string[];
  };
};

export type ConnectionInfo = {
  id: string;
  platform: Platform;
  account_label: string | null;
  account_handle: string | null;
  avatar_url: string | null;
  scopes: string[];
  expires_at: string | null;
  enabled: boolean;
  configured: boolean;
  expired: boolean;
};

/**
 * Account connections.
 *
 * Instagram is one click: the button hands the user to Instagram's own login,
 * and the callback stores a long-lived token that this app keeps refreshing.
 */
export default function ConnectionsPanel({
  adapters,
  connections,
  connected,
  error,
}: {
  adapters: AdapterInfo[];
  connections: ConnectionInfo[];
  /** Handle just connected, echoed back by the OAuth callback. */
  connected?: string;
  error?: string;
}) {
  return (
    <div className="grid gap-4">
      {connected ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {connected} is connected. Carousels will publish there automatically.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {adapters.map((adapter) => (
        <ConnectionCard
          key={adapter.platform}
          adapter={adapter}
          connection={connections.find((c) => c.platform === adapter.platform)}
        />
      ))}
    </div>
  );
}

function ConnectionCard({
  adapter,
  connection,
}: {
  adapter: AdapterInfo;
  connection?: ConnectionInfo;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oneClick = Boolean(adapter.oauth?.ready);
  const needsSetup = Boolean(adapter.oauth && !adapter.oauth.ready);
  // The manual channel: no API at all, just a switch that says "I'll post it".
  const isManual = !adapter.oauth && adapter.fields.length === 0;

  const run = (fn: () => Promise<void>) => {
    setError(null);

    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const credentials = Object.fromEntries(
      adapter.fields.map((field) => [field.key, String(form.get(field.key) ?? "")])
    );

    run(async () => {
      await saveConnection(adapter.platform, credentials, adapter.label);
      setOpen(false);
    });
  };

  const live = connection && (connection.configured || isManual);

  return (
    <div className="rounded-lg border border-white/10 p-4 grid gap-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {connection?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={connection.avatar_url}
              alt=""
              width={40}
              height={40}
              className="size-10 rounded-full border border-white/10 object-cover shrink-0"
            />
          ) : null}

          <div className="min-w-0">
            <p className="font-medium">
              {adapter.label}
              {connection?.account_handle ? (
                <span className="ml-2 text-sm text-muted-foreground">
                  @{connection.account_handle}
                </span>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground">
              <CardStatus
                adapter={adapter}
                connection={connection}
                live={Boolean(live)}
                isManual={isManual}
                needsSetup={needsSetup}
              />
            </p>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          {live ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    setConnectionEnabled(connection!.id, !connection!.enabled)
                  )
                }
              >
                {connection!.enabled ? "Pause" : "Resume"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => deleteConnection(connection!.id))}
              >
                Disconnect
              </Button>
            </>
          ) : null}

          {oneClick ? (
            <Button size="sm" variant={live ? "secondary" : "default"} asChild>
              <a href={`/api/connect/${adapter.platform}`}>
                {connection?.expired
                  ? "Reconnect"
                  : live
                    ? "Switch account"
                    : `Connect ${adapter.label}`}
              </a>
            </Button>
          ) : isManual ? (
            connection ? null : (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => saveConnection(adapter.platform, {}))}
              >
                Enable
              </Button>
            )
          ) : adapter.fields.length ? (
            <Button size="sm" variant="secondary" onClick={() => setOpen(!open)}>
              {connection?.configured ? "Replace credentials" : "Connect"}
            </Button>
          ) : null}
        </div>
      </div>

      {/* What the user has to have on their side, said before the trip to the
          platform rather than by an error screen after it. */}
      {oneClick && !live && adapter.oauth?.requirement ? (
        <p className="text-xs text-muted-foreground border-t border-white/10 pt-3">
          {adapter.oauth.requirement}
        </p>
      ) : null}

      {needsSetup && adapter.oauth ? (
        <p className="text-xs text-muted-foreground border-t border-white/10 pt-3">
          Instagram connection is temporarily unavailable. Please contact us
          and we’ll get it fixed.
        </p>
      ) : null}

      {open && adapter.fields.length ? (
        <form onSubmit={onSubmit} className="grid gap-3 border-t border-white/10 pt-4">
          {adapter.fields.map((field) => (
            <div key={field.key} className="grid gap-1.5">
              <Label htmlFor={`${adapter.platform}-${field.key}`}>
                {field.label}
              </Label>
              <Input
                id={`${adapter.platform}-${field.key}`}
                name={field.key}
                type={field.secret ? "password" : "text"}
                autoComplete="off"
                required
              />
              {field.hint ? (
                <p className="text-xs text-muted-foreground">{field.hint}</p>
              ) : null}
            </div>
          ))}

          {adapter.docsUrl ? (
            <a
              href={adapter.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs underline text-muted-foreground"
            >
              How to get these credentials
            </a>
          ) : null}

          <div>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save connection"}
            </Button>
          </div>
        </form>
      ) : null}

      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

/**
 * One line of truth per card. TikTok in particular has to be honest about
 * draft mode: an app awaiting TikTok's content-posting audit is only granted
 * `video.upload`, and posts land in the user's inbox rather than the profile.
 */
function CardStatus({
  adapter,
  connection,
  live,
  isManual,
  needsSetup,
}: {
  adapter: AdapterInfo;
  connection?: ConnectionInfo;
  live: boolean;
  isManual: boolean;
  needsSetup: boolean;
}) {
  if (live && connection) {
    if (connection.expired) {
      return <>Access expired — reconnect to keep posting.</>;
    }

    if (!connection.enabled) return <>Connected · paused</>;

    if (
      adapter.platform === "tiktok" &&
      connection.scopes.length &&
      !connection.scopes.includes("video.publish")
    ) {
      return <>Connected · posts land in your TikTok inbox as drafts</>;
    }

    return (
      <>
        Connected · posting enabled
        {connection.expires_at ? (
          <> · renews automatically</>
        ) : null}
      </>
    );
  }

  if (isManual) return <>Always available — download the slides and post manually.</>;
  if (needsSetup) return <>Not connected · needs app credentials</>;
  if (adapter.oauth) return <>{adapter.oauth.summary}</>;

  return <>Not connected</>;
}
