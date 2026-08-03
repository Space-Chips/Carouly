import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import BrandForm from "@/components/BrandForm";
import ConnectionsPanel, {
  type AdapterInfo,
} from "@/components/ConnectionsPanel";
import PresetPicker from "@/components/PresetPicker";
import ScheduleForm from "@/components/ScheduleForm";
import PlanPanel from "@/components/upgrade/PlanPanel";
import { getBrand } from "@/lib/actions/brand.actions";
import { getConnections } from "@/lib/actions/connection.actions";
import { getEntitlement, getQuota } from "@/lib/billing";
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
  const { tier } = await getEntitlement();
  const quota = tier.id === "free" ? await getQuota(userId!) : null;

  // Instagram is the only customer-facing connection while the other
  // publishing integrations are being rebuilt.
  const adapters: AdapterInfo[] = listAdapters()
    .filter((adapter) => adapter.platform === "instagram")
    .map((adapter) => {
      const ready = isOAuthReady(adapter.platform);

      return {
        platform: adapter.platform,
        label: adapter.label,
        docsUrl: adapter.docsUrl,
        // An account ID or token is never a customer setup task. If Instagram
        // Login is unavailable, that is a deployment issue for us to resolve.
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
      {/* Plan first. It is the one section whose state changes what every
          other section on this page is allowed to do. */}
      <section id="plan">
        <h1 className="text-3xl font-bold tracking-tight">Plan</h1>
        <div className="mt-8 max-w-2xl">
          <PlanPanel
            tier={tier}
            quota={quota ? { used: quota.used, limit: quota.limit } : null}
          />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Schedule</h2>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          The cron runs hourly and fires each brand when its own local clock
          reaches the posting hour. A day can only ever generate once.
        </p>
        <div className="mt-8">
          <ScheduleForm brand={brand} limits={tier.limits} />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">Accounts</h2>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Connect Instagram once and Carouly handles the rest. Access is
          encrypted, renewed automatically, and never shown in your browser.
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
