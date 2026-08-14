/**
 * The unified asset model.
 *
 * Before this, the things a run produced lived in four unrelated places: brand
 * assets inside `capture`, the kit inside `context.kit`, videos as transcript
 * blocks, and actors nowhere at all — cast fresh into every run and thrown away
 * when the tab closed. None of it survived a reload, and none of it could be
 * reused. A "brand kit" you rebuild from the URL every time is not a kit; it is
 * a cache with amnesia.
 *
 * So there is now one shape. An {@link Asset} is an *envelope* — id, owner,
 * name, tags, timestamps, a preview to draw it by — wrapped around a `data`
 * payload whose shape is chosen by `kind`. The envelope is what the library
 * lists, searches and sorts; the payload is the thing itself. The payloads are
 * deliberately the *existing* run types ({@link BrandKit}, {@link CapturedAsset},
 * the video artifact), not new ones, so saving is a wrap and reusing is an
 * unwrap — no lossy translation in either direction.
 *
 * The one genuinely new kind is `actor`. An actor is the identity a run pins to
 * its master frame so a face survives image-to-video (see the studio-rebuild
 * note); promoting it to a saved asset is what lets the same person appear in
 * next week's video without being re-invented from a text prompt.
 */

import type { ActorIdentity, CapturedAsset } from "@/lib/agent/events";
import type { BrandKit } from "@/lib/stages/brand";

export type AssetKind = "actor" | "kit" | "brand_asset" | "video";

/**
 * A reusable on-camera identity — the same shape a run seeds and emits (see
 * {@link ActorIdentity}), aliased here so the library and the run speak the same
 * language. `masterFrameUrl` is the load-bearing field: the single image every
 * beat of a video is an *edit* of, which is the whole trick that keeps one face
 * recognisable across shots.
 */
export type ActorData = ActorIdentity;

/** A whole brand kit, saved verbatim so a run can start from it. */
export type KitData = {
  kit: BrandKit;
  sourceUrl?: string;
};

/** One captured brand image (logo, product shot, icon). */
export type BrandAssetData = CapturedAsset & {
  /**
   * A copy rehosted into our own bucket. Captured assets live on the customer's
   * hosts, which is fine for a run happening now but not for a library entry
   * meant to outlive the page it came from; `storageUrl` is the durable copy.
   */
  storageUrl?: string;
  sourceUrl: string;
  /** The site it was harvested from, for grouping in the library. */
  site?: string;
};

/**
 * A finished cut. Mirrors the `video` artifact the run already emits, plus the
 * ids of the kit and actor it was made from, so the library can show lineage and
 * a "make another with this actor" path.
 */
export type VideoData = {
  url?: string;
  poster?: string;
  seconds: number;
  captions: string[];
  shots: { line: string; seconds: number; frame?: string }[];
  template: string;
  concept: string;
  draft?: boolean;
  stubbed?: boolean;
  kitId?: string;
  actorId?: string;
};

type AssetData = {
  actor: ActorData;
  kit: KitData;
  brand_asset: BrandAssetData;
  video: VideoData;
};

/**
 * The envelope. `K` defaults to the union so `Asset` on its own is every kind;
 * `Asset<"actor">` narrows to one. `data` is discriminated by `kind`, so a
 * `switch (asset.kind)` gives you a correctly-typed `asset.data` in each arm.
 */
/**
 * Whether this asset's media will still be there next month.
 *
 * `durable` — copied into our own bucket. `remote` — still on the provider, and
 * living on borrowed time. `placeholder` — a dry-run stand-in that was never a
 * file. Recorded because a library that silently rots into 404s is worse than
 * one that admits which entries are at risk.
 */
export type StorageState = "durable" | "remote" | "placeholder";

export type Asset<K extends AssetKind = AssetKind> = {
  [Kind in K]: {
    id: string;
    userId: string;
    kind: Kind;
    name: string;
    tags: string[];
    /** The image to draw this asset by in a grid, when there is one. */
    previewUrl?: string;
    /** Where it came from, for provenance and de-duplication. */
    sourceUrl?: string;
    /** What makes this asset *this* asset; the dedup key. */
    fingerprint: string;
    storage: StorageState;
    /** Asset ids this was made from. */
    parents: string[];
    data: AssetData[Kind];
    createdAt: number;
    updatedAt: number;
  };
}[K];

/** What the caller supplies to record; the store fills in id/userId/timestamps. */
export type NewAsset<K extends AssetKind = AssetKind> = {
  [Kind in K]: {
    kind: Kind;
    name: string;
    tags?: string[];
    previewUrl?: string;
    sourceUrl?: string;
    fingerprint: string;
    storage?: StorageState;
    parents?: string[];
    data: AssetData[Kind];
  };
}[K];

/**
 * How each kind decides whether two sightings are the same thing.
 *
 * Stated in one place because it is the rule that keeps the library usable, and
 * because each answer is a judgement rather than a mechanism: a brand image *is*
 * its source URL; a kit is one per site, so a rebuild updates rather than piles
 * up; a person is the frame they were born with; a cut is unique per file.
 */
export const fingerprintOf = {
  brand_asset: (sourceUrl: string) => `img:${sourceUrl}`,
  kit: (site: string) => `kit:${site.replace(/^https?:\/\//, "").replace(/\/$/, "")}`,
  actor: (masterFrameUrl: string) => `actor:${masterFrameUrl}`,
  video: (url: string) => `video:${url}`,
};

export const ASSET_KINDS: AssetKind[] = ["actor", "kit", "brand_asset", "video"];

/** Human labels, singular and plural, for the library tabs and toasts. */
export const KIND_LABELS: Record<AssetKind, { one: string; many: string }> = {
  actor: { one: "Actor", many: "Actors" },
  kit: { one: "Brand kit", many: "Brand kits" },
  brand_asset: { one: "Brand asset", many: "Brand assets" },
  video: { one: "Video", many: "Videos" },
};

export const isAssetKind = (value: unknown): value is AssetKind =>
  typeof value === "string" && (ASSET_KINDS as string[]).includes(value);
