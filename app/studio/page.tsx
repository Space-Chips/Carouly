import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import Studio from "@/components/studio/Studio";
import { openAccount } from "@/lib/credits/ledger";
import type { StudioSeed } from "@/components/studio/thread";
import { resolveAssetsAction } from "@/lib/actions/asset.actions";
import type { Asset } from "@/lib/assets/types";

export const metadata: Metadata = {
  title: "Studio",
  description:
    "Paste a web address and watch it become a vertical cut: the site read, the brand kit built, the format chosen, the graph executed.",
};

/**
 * The product, in one route.
 *
 * `?site=` is how the marketing page hands over: someone types their address
 * into the hero box, Clerk lifts them through sign-up, and they land here with
 * the host still attached and the run already starting. There is no onboarding
 * form in between, because the whole argument of the site is that there does not
 * need to be one.
 *
 * `?use=` is the same idea pointed at the library: one or more asset ids,
 * resolved here and handed to the run as a starting point. Being in the URL is
 * the point — reuse is then a link, which means it can be bookmarked, opened in
 * a second tab, and sent to someone. The previous version left a note in
 * localStorage, which could do none of those things.
 */
export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; use?: string | string[] }>;
}) {
  const { site, use } = await searchParams;
  const { userId } = await auth();

  const [seed, account] = await Promise.all([
    resolveSeed(use),
    // Opening the account here as well as in the chat route means a first-time
    // visitor sees their welcome credits in the meter before they type anything,
    // rather than watching the number appear after their first message.
    userId ? openAccount(userId) : Promise.resolve({ balance: 0 }),
  ]);

  return (
    <main
      data-surface="paper"
      className="max-w-none bg-paper px-0 pt-0 text-graphite"
    >
      <Studio
        initialSite={site}
        seed={seed}
        openingBalance={account.balance}
      />
    </main>
  );
}

/**
 * Turn `?use=` ids into the run's starting state.
 *
 * Silently yields nothing when the ids do not resolve — RLS means someone
 * else's id simply returns no rows, so a tampered link degrades into an ordinary
 * empty studio rather than an error page about something the person never did.
 */
const resolveSeed = async (
  use?: string | string[]
): Promise<StudioSeed | undefined> => {
  const ids = (Array.isArray(use) ? use : use ? [use] : []).filter(Boolean);
  if (!ids.length) return undefined;

  let assets: Asset[] = [];
  try {
    assets = await resolveAssetsAction(ids);
  } catch {
    return undefined;
  }

  const kit = assets.find((asset): asset is Asset<"kit"> => asset.kind === "kit");
  const actor = assets.find(
    (asset): asset is Asset<"actor"> => asset.kind === "actor"
  );

  if (!kit && !actor) return undefined;

  return {
    kit: kit?.data.kit,
    kitId: kit?.id,
    // The library row travels with the person, so a cut made from them records
    // the lineage and re-recording them updates that row rather than forking.
    actor: actor ? { ...actor.data, assetId: actor.id } : undefined,
    label: actor?.name ?? kit?.name,
  };
};
