import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import BrandForm from "@/components/BrandForm";
import ConnectionsPanel, {
  type AdapterInfo,
} from "@/components/ConnectionsPanel";
import PresetPicker from "@/components/PresetPicker";
import ScheduleForm from "@/components/ScheduleForm";
import CreditPanel from "@/components/credits/CreditPanel";
import { getBrand } from "@/lib/actions/brand.actions";
import { getConnections } from "@/lib/actions/connection.actions";
import { openAccount } from "@/lib/credits/ledger";
import { getPreset, listPresets } from "@/lib/presets";
import { isOAuthReady, listAdapters } from "@/lib/social";

export default async function SettingsPage({
  searchParams,
}: {
  // The OAuth callback redirects back here with its result.
  searchParams: Promise<{ connected?: string; connect_error?: string }>;
}) {
  const brand = await getBrand();

  if (!brand) redirect("/onboarding");

  const { userId } = await auth();
  const connections = await getConnections();
  const preset = getPreset(brand.preset);
  const { connected, connect_error: connectError } = await searchParams;
  const account = await openAccount(userId!);

  // These are the accounts used by the agentic video publishing flow.
  const adapters: AdapterInfo[] = listAdapters()
    .filter((adapter) => ["instagram", "tiktok"].includes(adapter.platform))
    .map((adapter) => {
      const ready = isOAuthReady(adapter.platform);

      return {
        platform: adapter.platform,
        label: adapter.label,
        docsUrl: adapter.docsUrl,
        // An account ID or token is never a customer setup task. If OAuth is
        // unavailable, that is a deployment issue for us to resolve.
        fields: [],
        oauth: adapter.oauth
          ? {
              ready,
              summary: adapter.oauth.summary,
              requirement: adapter.oauth.requirement,
              setupUrl: adapter.oauth.setupUrl,
              envVars: [adapter.oauth.env.clientId, adapter.oauth.env.clientSecret],
            }
          : undefined,
      };
    });

  return (
    <main className="pb-24 grid gap-16">
      {/* Credits first. Nothing on this page is gated any more, but this is
          still the section that decides whether the rest of it will do
          anything tonight. */}
      <section id="credits">
        <h1 className="text-3xl font-bold tracking-tight">Credits</h1>
        <div className="mt-8 max-w-2xl">
          <CreditPanel account={account} />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Schedule</h2>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          The cron runs hourly and fires each brand when its own local clock
          reaches the posting hour. A day can only ever generate once.
        </p>
        <div className="mt-8">
          <ScheduleForm brand={brand} />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Accounts</h2>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Connect Instagram or TikTok once and Carouly handles the rest. Access
          is encrypted, renewed automatically, and never shown in your browser.
        </p>
        <div className="mt-8">
          <ConnectionsPanel
            adapters={adapters}
            connections={connections}
            connected={connected}
            error={connectError}
          />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Style preset</h2>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          One choice covers the whole look: palette, type, copy tone and how the
          AI background on slide one is shot. Each card shows real slides
          rendered by the same code that exports the posted PNGs.
        </p>
        <div className="mt-8">
          {/* getPreset, not the raw column: a row written before a preset was
              renamed or removed resolves to the default rather than crashing. */}
          <PresetPicker
            presets={listPresets()}
            active={preset.id}
            brandName={brand.name}
            handle={brand.handle ?? brand.name}
          />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Brand</h2>
        <div className="mt-8">
          <BrandForm brand={brand} />
        </div>
      </section>
    </main>
  );
}
