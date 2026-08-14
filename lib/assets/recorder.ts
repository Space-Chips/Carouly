/**
 * How a run remembers what it made.
 *
 * This is the inversion that makes the library work. The first version had a
 * "Save to library" button on every card, which meant the library was only ever
 * as full as your diligence — and a run that makes a kit, eight brand images, an
 * actor and a cut needed eleven clicks to be remembered. Nobody does that
 * eleven times, so the library stayed empty, so reuse never happened.
 *
 * So the run records its own output, here, on the server, at the moment it is
 * produced — where the bytes already are and the user is already authenticated.
 * The human verb is no longer *filing* (name it, save it, choose a folder) but
 * *curation*: rename what deserves a better name, tag what you will look for,
 * delete what you do not want. Those are the things people are actually good at.
 *
 * Two rules keep this from being noise:
 *
 * 1. **Only what has substance.** A dry-run placeholder is not a file and never
 *    becomes a row. Decorative page images are not brand assets.
 * 2. **Never at the cost of the run.** Every function here is best-effort: the
 *    database being unmigrated, offline or slow must not take down a video the
 *    user is watching being made. Failures are reported as a step in the
 *    transcript, not thrown.
 */

import type { RunEvent } from "@/lib/agent/events";
import type { ActorIdentity, CapturedAsset } from "@/lib/agent/events";
import { rehost, slugToken } from "@/lib/assets/rehost";
import { enqueue } from "@/lib/render/jobs";
import { nudgeWorker } from "@/lib/render/nudge";
import { findByFingerprint, listAssetsOwnedBy, recordAsset } from "@/lib/assets/store";
import { fingerprintOf, type AssetKind, type NewAsset } from "@/lib/assets/types";
import type { BrandKit } from "@/lib/stages/brand";
import { createSupabaseAdminClient } from "@/lib/supabase";

export type Recorder = {
  kit: (kit: BrandKit) => Promise<string | undefined>;
  brandAssets: (assets: CapturedAsset[], site?: string) => Promise<void>;
  actor: (actor: ActorIdentity, parents: string[]) => Promise<string | undefined>;
  /**
   * People this account has already filmed with, for the casting shelf.
   *
   * The one read on an object otherwise made of writes, and it earns its place
   * here for the same reason `queueRender` does: this is where the user and a
   * client that can see their rows already are. Best-effort like the writes —
   * a library that cannot be reached means the shelf shows presets only, not
   * that casting fails.
   */
  savedActors: (
    limit?: number
  ) => Promise<{ id: string; name: string; actor: ActorIdentity }[]>;
  video: (video: VideoRecord, parents: string[]) => Promise<string | undefined>;
  /**
   * Hand a render to the queue and return its id.
   *
   * Sits here rather than in its own service because this object already holds
   * the two things queueing needs — the user the job belongs to and a
   * service-role client — and a second module resolving both again would be a
   * second place for them to disagree.
   *
   * Unlike the recording methods, a failure here is *not* absorbed: those keep a
   * receipt of something that already exists, whereas this one is the work. A
   * silent failure would leave the person watching a render that was never
   * started, so it returns undefined and the caller raises.
   */
  queueRender: (job: {
    templateId: string;
    conceptTitle?: string;
    payload: Record<string, unknown>;
  }) => Promise<string | undefined>;
};

type VideoRecord = {
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

const placeholder = (url?: string) =>
  !url || url.startsWith("https://dry-run.local/");

/**
 * A recorder bound to one user and one run.
 *
 * Uses the service-role client rather than the request-scoped one: this is
 * called from inside a streaming route handler, and every write filters by the
 * `userId` captured here, which is exactly what the RLS policy would have
 * checked. `null` when there is no user — the whole thing degrades to no-ops so
 * a signed-out or misconfigured run still produces video.
 */
export const makeRecorder = (
  userId: string | null,
  emit: (event: RunEvent) => void,
  /** The tool call in flight, so a failure is reported inside its block. */
  currentId: () => string
): Recorder => {
  const noop: Recorder = {
    kit: async () => undefined,
    brandAssets: async () => {},
    actor: async () => undefined,
    savedActors: async () => [],
    video: async () => undefined,
    queueRender: async () => undefined,
  };

  if (!userId) return noop;

  let supabase: ReturnType<typeof createSupabaseAdminClient>;
  try {
    supabase = createSupabaseAdminClient();
  } catch {
    // No service credentials configured. Runs still work; nothing is kept.
    return noop;
  }

  /** Write one asset, announce it, and never let a failure escape. */
  const put = async (input: NewAsset): Promise<string | undefined> => {
    try {
      const { asset, reused } = await recordAsset(supabase, userId, input);
      emit({
        t: "asset.saved",
        id: asset.id,
        kind: asset.kind,
        name: asset.name,
        reused,
      });
      return asset.id;
    } catch (error) {
      // Reported against the tool that is running, because a `tool.step` is
      // rendered inside its tool's block — an id belonging to no tool would be
      // dropped by the client, which is the one outcome a failure report must
      // not have.
      emit({
        t: "tool.step",
        id: currentId(),
        label: "library",
        detail: `could not keep the ${input.kind}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        ok: false,
      });
      return undefined;
    }
  };

  /** A lookup that never throws — a failed check just means "do the work". */
  const already = async (kind: AssetKind, fingerprint: string) => {
    try {
      return await findByFingerprint(supabase, kind, fingerprint);
    } catch {
      return null;
    }
  };

  return {
    kit: (kit) =>
      put({
        kind: "kit",
        name: kit.brand_name,
        sourceUrl: kit.sourceUrl,
        previewUrl: kit.assets?.find((asset) => asset.role === "logo")?.sourceUrl,
        fingerprint: fingerprintOf.kit(kit.sourceUrl || kit.slug || kit.brand_name),
        // A kit is text. It references images living elsewhere but holds none
        // itself, so there is nothing to copy and nothing that can expire.
        storage: "durable",
        data: { kit, sourceUrl: kit.sourceUrl },
      }),

    /**
     * The brand's own images.
     *
     * Only the roles with reuse value. A landing page yields a lot of
     * decoration, and a library holding twenty background textures per site is
     * one nobody scrolls — so `image` is dropped and logo/product/icon kept.
     */
    brandAssets: async (assets, site) => {
      const worth = assets.filter((asset) => asset.role !== "image").slice(0, 12);

      for (const asset of worth) {
        const fingerprint = fingerprintOf.brand_asset(asset.sourceUrl);

        // Every run against a site sees the same logo. Without this it would be
        // downloaded and re-uploaded every time, which is a lot of bytes moved
        // to arrive at a copy we already had.
        const known = await already("brand_asset", fingerprint);
        if (known?.storage === "durable") {
          emit({
            t: "asset.saved",
            id: known.id,
            kind: known.kind,
            name: known.name,
            reused: true,
          });
          continue;
        }

        const copy = await rehost(asset.sourceUrl, {
          userId,
          prefix: "brand",
          name: slugToken(),
        });

        await put({
          kind: "brand_asset",
          name: asset.alt?.trim() || `${asset.role} · ${asset.file}`,
          sourceUrl: asset.sourceUrl,
          previewUrl: copy.url ?? asset.sourceUrl,
          fingerprint,
          storage: copy.storage,
          data: { ...asset, storageUrl: copy.url, sourceUrl: asset.sourceUrl, site },
        });
      }
    },

    /**
     * The person on camera.
     *
     * Recorded on every run that had one, because the moment you decide you like
     * her is *after* watching the video — and if she was not kept at the moment
     * she was made, she is gone. Reuse carries the original's id, so re-recording
     * updates that row rather than forking a twin on every use.
     */
    actor: async ({ assetId, ...actor }, parents) => {
      if (placeholder(actor.masterFrameUrl)) return undefined;

      /**
       * Someone already in the library is touched, not re-copied.
       *
       * Their frame is the durable copy made when they were first cast, so
       * copying it again would waste an upload — and, because each copy gets a
       * fresh name, would change the very URL their fingerprint is derived
       * from. That fingerprint is how the run finds the row again, so re-copying
       * would fork a new near-identical actor on every single reuse: exactly the
       * duplication this whole layer exists to prevent.
       */
      if (assetId) {
        return put({
          kind: "actor",
          name: actor.persona ?? "Actor",
          sourceUrl: actor.sourceUrl,
          previewUrl: actor.masterFrameUrl,
          fingerprint: fingerprintOf.actor(actor.masterFrameUrl),
          parents,
          data: actor,
        });
      }

      const copy = await rehost(actor.masterFrameUrl, {
        userId,
        prefix: "actor",
        name: slugToken(),
      });

      const frame = copy.url ?? actor.masterFrameUrl;

      return put({
        kind: "actor",
        name: actor.persona ?? "Actor",
        sourceUrl: actor.sourceUrl,
        previewUrl: frame,
        fingerprint: fingerprintOf.actor(frame),
        storage: copy.storage,
        parents,
        data: { ...actor, masterFrameUrl: frame },
      });
    },

    savedActors: async (limit = 6) => {
      try {
        const rows = await listAssetsOwnedBy(supabase, userId, "actor", limit);

        return rows
          .map((row) => ({
            id: row.id,
            name: row.name,
            actor: { ...(row.data as ActorIdentity), assetId: row.id },
          }))
          // A row whose frame never made it to storage cannot be cast: pinning a
          // URL that does not resolve fails the graph several minutes in.
          .filter((row) => !placeholder(row.actor.masterFrameUrl));
      } catch {
        return [];
      }
    },

    queueRender: async ({ templateId, conceptTitle, payload }) => {
      try {
        const id = await enqueue(supabase, {
          userId,
          templateId,
          conceptTitle,
          payload,
        });

        // Started straight away rather than waiting for a poll or the cron, so
        // asking for a video and the render beginning are the same moment.
        void nudgeWorker();

        return id;
      } catch (error) {
        emit({
          t: "tool.step",
          id: currentId(),
          label: "queue",
          detail: error instanceof Error ? error.message : String(error),
          ok: false,
        });
        return undefined;
      }
    },

    video: async (video, parents) => {
      if (placeholder(video.url)) return undefined;

      const token = slugToken();
      const [file, poster] = await Promise.all([
        rehost(video.url, { userId, prefix: "video", name: token }),
        rehost(video.poster, { userId, prefix: "poster", name: token }),
      ]);

      return put({
        kind: "video",
        name: video.concept || video.template,
        previewUrl: poster.url,
        fingerprint: fingerprintOf.video(video.url!),
        storage: file.storage,
        parents,
        data: { ...video, url: file.url ?? video.url, poster: poster.url ?? video.poster },
      });
    },
  };
};
