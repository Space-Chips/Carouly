import type { Metadata } from "next";

import Library from "@/components/studio/Library";
import { listAssetsAction } from "@/lib/actions/asset.actions";
import type { Asset } from "@/lib/assets/types";

export const metadata: Metadata = {
  title: "Library",
  description:
    "The actors, brand kits, brand images and finished cuts your runs have made — kept automatically, and reusable.",
};

/**
 * The library, at its own route.
 *
 * Deliberately not a panel inside the studio: it is the thing that outlives any
 * one run, so it gets an address you can bookmark rather than a drawer that only
 * exists while a chat is open.
 *
 * Fetched here rather than in an effect, so the grid arrives with the page
 * instead of after it — the client half only ever mutates.
 */
export default async function LibraryPage() {
  let assets: Asset[] = [];
  let error: string | null = null;

  try {
    assets = await listAssetsAction();
  } catch (cause) {
    // Almost always the one thing: the schema has not been run yet. Reported to
    // the person rather than thrown, because a stack trace does not tell them
    // which SQL file to run.
    error = cause instanceof Error ? cause.message : String(cause);
  }

  return (
    <main data-surface="paper" className="max-w-none bg-paper px-0 pt-0 text-graphite">
      <Library assets={assets} error={error} />
    </main>
  );
}
