import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { WriteOneButton } from "@/components/CarouselActions";
import StatusPill from "@/components/StatusPill";
import { getBrand } from "@/lib/actions/brand.actions";
import { getCarousels } from "@/lib/actions/carousel.actions";
import { getQuota } from "@/lib/billing";

export default async function CarouselsPage() {
  const { userId } = await auth();
  const brand = await getBrand();

  if (!brand) redirect("/onboarding");

  const [carousels, quota] = await Promise.all([
    getCarousels(),
    getQuota(userId!),
  ]);

  return (
    <main className="pb-24">
      <div className="rise flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Carousels</h1>
          <p className="mt-3 text-muted-foreground">
            Everything written for {brand.name}, newest first.
          </p>
        </div>
        <WriteOneButton exhausted={quota.exhausted} />
      </div>

      {carousels.length === 0 ? (
        <div className="rise stagger-1 mt-10 rounded-xl border border-dashed border-white/15 p-12 text-center">
          <p className="text-sm font-medium">No carousels yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Write one now, or turn on autopilot in Settings and they will
            appear here daily.
          </p>
        </div>
      ) : (
        <ul className="mt-10 grid gap-2">
          {carousels.map((carousel) => (
            <li key={carousel.id}>
              <Link
                href={`/carousels/${carousel.id}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-white/10 p-4 surface hover:border-white/20"
              >
                <span className="min-w-0">
                  <span className="block font-medium truncate">
                    {carousel.title}
                  </span>
                  <span className="block text-xs text-muted-foreground mt-1 truncate">
                    {carousel.keyword_text} ·{" "}
                    {new Date(carousel.created_at).toLocaleString()}
                    {carousel.error ? ` · ${carousel.error}` : ""}
                  </span>
                </span>
                <StatusPill status={carousel.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
