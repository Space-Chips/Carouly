"use client";

/**
 * The asset library.
 *
 * Everything the runs made, kept without anyone being asked to keep it. The
 * thread shows a run in time; this shows what the runs left behind, addressable
 * long after the transcript scrolled away.
 *
 * The verbs here are curation, not filing — rename, tag, delete — because the
 * saving already happened on the server. The one creative verb is reuse: a kit
 * or an actor goes back into a new run as a link, which is why "Use in a run" is
 * an `<a href>` and not a handler.
 *
 * A card is shaped like the thing it holds, the same rule the transcript cards
 * follow: an actor is the face, a kit is its palette and voice, a cut is the
 * poster you can play.
 */

import {
  ArrowSquareOut,
  CloudWarning,
  FilmSlate,
  ImageSquare,
  PaintBrushBroad,
  Play,
  TrashSimple,
  UserFocus,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Player } from "@/components/studio/artifacts";
import {
  deleteAssetAction,
  renameAssetAction,
  setTagsAction,
} from "@/lib/actions/asset.actions";
import type { Asset, AssetKind } from "@/lib/assets/types";
import { KIND_LABELS } from "@/lib/assets/types";

const KIND_ICON: Record<AssetKind, typeof UserFocus> = {
  actor: UserFocus,
  kit: PaintBrushBroad,
  brand_asset: ImageSquare,
  video: FilmSlate,
};

const TABS: (AssetKind | "all")[] = ["all", "actor", "kit", "brand_asset", "video"];

export default function Library({
  assets: initial,
  error,
}: {
  assets: Asset[];
  error: string | null;
}) {
  const [assets, setAssets] = useState(initial);
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");

  const shown = useMemo(
    () => assets.filter((asset) => tab === "all" || asset.kind === tab),
    [assets, tab]
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const asset of assets) map[asset.kind] = (map[asset.kind] ?? 0) + 1;
    return map;
  }, [assets]);

  /** Names of the assets each id was made from, for the lineage line. */
  const nameById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset.name])),
    [assets]
  );

  /**
   * How many cuts each kit and actor is in — lineage read the other way round.
   *
   * Counted here rather than queried, because every asset is already loaded and
   * a round trip per card to count rows we are holding would be absurd. The
   * `parents` GIN index is what this becomes when the library is big enough to
   * paginate and this shortcut stops being available.
   */
  const usedIn = useMemo(() => {
    const map = new Map<string, number>();
    for (const asset of assets) {
      if (asset.kind !== "video") continue;
      for (const parent of asset.parents) {
        map.set(parent, (map.get(parent) ?? 0) + 1);
      }
    }
    return map;
  }, [assets]);

  const replace = (updated: Asset) =>
    setAssets((current) =>
      current.map((asset) => (asset.id === updated.id ? updated : asset))
    );

  const remove = (id: string) =>
    setAssets((current) => current.filter((asset) => asset.id !== id));

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-graphite">Library</h1>
          <p className="pretty mt-1 text-sm text-mute">
            Everything your runs have made. Kept automatically — rename what you
            will look for later, throw away what you will not.
          </p>
        </div>
        <Link
          href="/studio"
          className="inline-flex items-center gap-1.5 rounded-full border border-rule px-3.5 py-1.5 text-sm text-graphite transition-colors duration-150 hover:bg-paper-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite"
        >
          Back to the studio
        </Link>
      </header>

      <nav className="mt-6 flex flex-wrap gap-1.5" aria-label="Asset kinds">
        {TABS.map((value) => {
          const label = value === "all" ? "All" : KIND_LABELS[value].many;
          const count = value === "all" ? assets.length : counts[value] ?? 0;
          const active = tab === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-current={active ? "true" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite ${
                active
                  ? "bg-graphite text-paper"
                  : "border border-rule text-mute hover:bg-paper-lift hover:text-graphite"
              }`}
            >
              {label}
              <span
                className={`ml-1.5 font-mono text-xs ${active ? "text-paper/70" : "text-mute/70"}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-6 flex-1">
        {error ? (
          <Empty>
            The library could not load. If this is the first run since the asset
            library was added, the database is missing its table — run{" "}
            <code className="text-graphite">supabase_schema.sql</code> in the
            Supabase SQL editor.
            <span className="mt-3 block break-words font-mono text-xs text-mute/70">
              {error}
            </span>
          </Empty>
        ) : shown.length === 0 ? (
          <Empty>
            Nothing here yet. Make a video in the studio and everything it
            produces — the kit, the brand images, the actor, the cut — lands here
            on its own.
          </Empty>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                nameById={nameById}
                usedIn={usedIn.get(asset.id) ?? 0}
                onChanged={replace}
                onDeleted={remove}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="grid place-items-center rounded-2xl border border-dashed border-rule py-20 text-center">
    <p className="pretty max-w-sm px-6 text-sm leading-relaxed text-mute">{children}</p>
  </div>
);

/* ------------------------------------------------------------------ card --- */

function AssetCard({
  asset,
  nameById,
  usedIn,
  onChanged,
  onDeleted,
}: {
  asset: Asset;
  nameById: Map<string, string>;
  /** How many cuts were made from this one. */
  usedIn: number;
  onChanged: (asset: Asset) => void;
  onDeleted: (id: string) => void;
}) {
  const Icon = KIND_ICON[asset.kind];
  const [name, setName] = useState(asset.name);
  const [editingTags, setEditingTags] = useState(false);
  const [tagText, setTagText] = useState(asset.tags.join(", "));
  const [busy, setBusy] = useState(false);
  const reusable = asset.kind === "kit" || asset.kind === "actor";

  const madeFrom = asset.parents
    .map((id) => nameById.get(id))
    .filter((label): label is string => Boolean(label));

  const commitName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === asset.name) {
      setName(asset.name);
      return;
    }
    try {
      onChanged(await renameAssetAction(asset.id, trimmed));
    } catch {
      setName(asset.name);
    }
  };

  const commitTags = async () => {
    setEditingTags(false);
    const next = tagText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (next.join("|") === asset.tags.join("|")) return;
    try {
      onChanged(await setTagsAction(asset.id, next));
    } catch {
      setTagText(asset.tags.join(", "));
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete “${asset.name}”? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteAssetAction(asset.id);
      onDeleted(asset.id);
    } catch {
      setBusy(false);
    }
  };

  return (
    <li className="group flex flex-col overflow-hidden rounded-2xl border border-rule bg-paper-lift">
      <Preview asset={asset} />

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-center gap-1.5">
          <Icon weight="regular" aria-hidden className="size-3.5 shrink-0 text-mute" />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">
            {KIND_LABELS[asset.kind].one}
          </span>

          {/* An entry whose file lives on a provider is on borrowed time. Said
              plainly here rather than discovered as a broken thumbnail later. */}
          {asset.storage === "remote" ? (
            <span
              title="Still hosted by the provider — this link may expire."
              className="ml-auto"
            >
              <CloudWarning weight="regular" aria-hidden className="size-3.5 text-ember" />
            </span>
          ) : null}
        </div>

        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          aria-label="Asset name"
          className="mt-1.5 w-full truncate rounded bg-transparent text-sm font-medium text-graphite outline-none focus:bg-paper-sunk focus:px-1.5 focus:py-0.5"
        />

        {/* Lineage, in whichever direction this asset has any. A cut says what
            it was made from; an actor says how much work she has done. */}
        {madeFrom.length ? (
          <p className="mt-1 truncate text-[11px] text-mute" title={madeFrom.join(", ")}>
            from {madeFrom.join(", ")}
          </p>
        ) : usedIn ? (
          <p className="mt-1 truncate text-[11px] text-mute">
            in {usedIn} {usedIn === 1 ? "cut" : "cuts"}
          </p>
        ) : null}

        {editingTags ? (
          <input
            autoFocus
            value={tagText}
            onChange={(event) => setTagText(event.target.value)}
            onBlur={commitTags}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            placeholder="tag, tag"
            aria-label="Tags, comma separated"
            className="mt-2 w-full rounded border border-rule bg-paper px-2 py-1 text-xs text-graphite outline-none placeholder:text-mute focus:border-graphite/30"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingTags(true)}
            className="mt-2 flex flex-wrap gap-1 text-left"
          >
            {asset.tags.length ? (
              asset.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-paper-sunk px-2 py-0.5 text-[11px] text-graphite"
                >
                  {tag}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-mute/70">Add tags</span>
            )}
          </button>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 pt-1">
          {reusable ? (
            // A link, not a handler: reuse is a URL, so it can be bookmarked,
            // opened in a new tab, or sent to someone.
            <Link
              href={`/studio?use=${asset.id}`}
              className="inline-flex items-center gap-1 rounded-full bg-graphite px-3 py-1 text-xs text-paper transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite"
            >
              <Play weight="fill" aria-hidden className="size-3" />
              Use in a run
            </Link>
          ) : (
            <OpenLink asset={asset} />
          )}

          <button
            type="button"
            onClick={remove}
            disabled={busy}
            aria-label={`Delete ${asset.name}`}
            className="grid size-7 shrink-0 place-items-center rounded-md text-mute opacity-0 transition-all duration-150 hover:bg-paper-sunk hover:text-fail focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-graphite group-hover:opacity-100 disabled:opacity-40"
          >
            <TrashSimple weight="regular" aria-hidden className="size-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

const OpenLink = ({ asset }: { asset: Asset }) => {
  const href =
    asset.kind === "video"
      ? asset.data.url
      : asset.kind === "brand_asset"
        ? asset.data.storageUrl ?? asset.data.sourceUrl
        : undefined;

  if (!href) return <span />;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-graphite underline underline-offset-4 transition-colors duration-150 hover:text-ember"
    >
      Open the file
      <ArrowSquareOut weight="bold" aria-hidden className="size-3" />
    </a>
  );
};

/* --------------------------------------------------------------- preview --- */

function Preview({ asset }: { asset: Asset }) {
  if (asset.kind === "video") {
    return (
      <div className="relative aspect-[4/5] overflow-hidden bg-graphite">
        {asset.data.url ? (
          <Player url={asset.data.url} poster={asset.data.poster} />
        ) : (
          <Glyph label={`${Math.round(asset.data.seconds)}s`} />
        )}
      </div>
    );
  }

  if (asset.kind === "actor") {
    return (
      <div className="relative aspect-[4/5] overflow-hidden bg-paper-sunk">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.data.masterFrameUrl}
          alt={asset.data.look}
          className="size-full object-cover"
        />
      </div>
    );
  }

  if (asset.kind === "brand_asset") {
    return (
      <div className="relative aspect-[4/5] overflow-hidden bg-paper-sunk">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.data.storageUrl ?? asset.data.sourceUrl}
          alt={asset.data.alt || asset.name}
          className="size-full object-contain p-4"
        />
      </div>
    );
  }

  // A kit has no single image, so it is drawn as what it actually is: the
  // palette it found and the voice it wrote in.
  const palette = asset.data.kit.facts?.palette ?? [];

  return (
    <div className="flex aspect-[4/5] flex-col overflow-hidden bg-paper-sunk">
      <div className="flex h-16 w-full">
        {(palette.length ? palette : ["#e7e5e4", "#d6d3d1", "#a8a29e"])
          .slice(0, 6)
          .map((hex, index) => (
            <span key={`${hex}-${index}`} className="flex-1" style={{ backgroundColor: hex }} />
          ))}
      </div>
      <p className="pretty line-clamp-4 flex-1 px-3 py-2.5 text-xs leading-relaxed text-mute">
        {asset.data.kit.brand_summary}
      </p>
      <p className="truncate px-3 pb-2.5 text-[11px] italic text-graphite">
        {asset.data.kit.voice_tone}
      </p>
    </div>
  );
}

const Glyph = ({ label }: { label: string }) => (
  <div className="grid size-full place-items-center">
    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-bone/50">
      {label}
    </span>
  </div>
);
