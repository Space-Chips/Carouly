import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@clerk/nextjs/server";

import GenerationPanel from "@/components/GenerationPanel";
import StatusPill from "@/components/StatusPill";
import BuyLink from "@/components/credits/BuyLink";
import { Button } from "@/components/ui/button";
import { getBrand } from "@/lib/actions/brand.actions";
import { getCarousels } from "@/lib/actions/carousel.actions";
import { getConnections } from "@/lib/actions/connection.actions";
import { getKeywords } from "@/lib/actions/keyword.actions";
import { openAccount } from "@/lib/credits/ledger";
import { CAROUSEL_COST, credits, formatCredits } from "@/lib/credits/prices";
import { localHour } from "@/lib/pipeline";

export default async function DashboardPage({
  searchParams,
}: {
  // Checkout sends the user back here with ?welcome=1.
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { userId } = await auth();
  const { welcome } = await searchParams;
  const brand = await getBrand();

  if (!brand) redirect("/onboarding");

  const [keywords, carousels, connections, account] = await Promise.all([
    getKeywords(),
    getCarousels(),
    getConnections(),
    openAccount(userId!),
  ]);

  // How many days of the current schedule the balance covers. The number
  // somebody on autopilot actually wants: not "how many credits", but "how long
  // until this stops".
  const perDay = brand.posts_per_day * CAROUSEL_COST;
  const daysCovered = Math.floor(account.balance / Math.max(1, perDay));
  const empty = account.balance < CAROUSEL_COST;

  // Mirrors nextKeyword() in lib/pipeline.ts: the approved queue first, then
  // the highest-ranked unreviewed keyword as a fallback.
  const queued = keywords.filter((k) => k.status === "approved").length;
  const approvedNext = keywords.find((k) => k.status === "approved");
  const nextUp = approvedNext ?? keywords.find((k) => k.status === "new");
  const unreviewed = keywords.filter((k) => k.status === "new").length;
  const activeConnections = connections.filter((c) => c.enabled).length;
  const publishedCount = carousels.filter((c) => c.status === "published").length;
  const hour = localHour(brand.timezone);
  const nextRun =
    hour < brand.post_hour
      ? `today ${String(brand.post_hour).padStart(2, "0")}:00`
      : `tomorrow ${String(brand.post_hour).padStart(2, "0")}:00`;

  return (
    <main className="pb-24">
      {/* Straight after a top-up. It names the one fact somebody is least sure
          about — that the credits arrived — and points at the switch that
          starts spending them. */}
      {welcome ? (
        <div className="rise mb-8 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <p className="text-sm font-medium">
            {formatCredits(account.balance)} credits on the account.
          </p>
          <p className="pretty mt-1 max-w-2xl text-sm text-muted-foreground">
            Turn on autopilot in Settings and the first post is written at your
            posting hour tonight. Nothing renews — the balance only moves when
            something is made.
          </p>
          <Link
            href="/settings#credits"
            className="mt-3 inline-block text-sm underline underline-offset-4 transition-colors hover:text-foreground"
          >
            Open settings
          </Link>
        </div>
      ) : null}

      <div className="rise">
        <h1 className="text-3xl font-bold tracking-tight">{brand.name}</h1>
        <p className="mt-2 text-muted-foreground">{brand.domain}</p>
      </div>

      <div className="mt-8">
        <GenerationPanel
          postsPerDay={brand.posts_per_day}
          autopilot={brand.autopilot}
          nextRun={nextRun}
          timezone={brand.timezone}
          balance={account.balance}
        />
      </div>

      {/* The persistent touchpoint. It states the balance as a fact and only
          turns into an ask once it will not cover tomorrow — a banner that
          sells on day one is a banner people learn to skip. */}
      <div
        className={`rise stagger-1 mt-3 flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5 ${
          empty ? "border-ember/40 bg-ember/[0.06]" : "border-white/10"
        }`}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {empty
              ? "Out of credits"
              : `${formatCredits(account.balance)} credits · about ${daysCovered} day${
                  daysCovered === 1 ? "" : "s"
                } at this schedule`}
          </p>
          <p className="pretty mt-1 max-w-2xl text-sm text-muted-foreground">
            {empty
              ? "Autopilot has nothing to spend, so it is skipping rather than generating. The schedule is still set and starts again after a top-up."
              : `Each post costs ${credits(CAROUSEL_COST)} as it is written. Publishing is free.`}
          </p>
        </div>
        <BuyLink gate={empty ? "autopilot" : "general"}>
          {empty ? "Top up" : "Buy credits"}
        </BuyLink>
      </div>

      {/* What autopilot will write next — makes the ranking model visible. */}
      {nextUp ? (
        <Link
          href="/keywords"
          className="rise stagger-1 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4 surface"
        >
          <span className="text-sm">
            <span className="text-muted-foreground">
              {approvedNext ? "Next topic · " : "Next topic (unreviewed) · "}
            </span>
            <span className="font-medium">{nextUp.keyword}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            score {Number(nextUp.score).toFixed(1)} · demand {nextUp.demand} ·
            difficulty {nextUp.difficulty}
          </span>
        </Link>
      ) : null}

      <section className="rise stagger-2 mt-8 grid gap-px sm:grid-cols-2 lg:grid-cols-4 bg-white/10 border border-white/10 rounded-xl overflow-hidden">
        <Stat
          label="Autopilot"
          value={brand.autopilot ? "On" : "Off"}
          hint={brand.autopilot ? `Next ${nextRun}` : "Turn it on in Settings"}
          tone={brand.autopilot ? "good" : "warn"}
        />
        <Stat
          label="Keywords queued"
          value={String(queued)}
          hint={
            queued
              ? "Approved and ready"
              : unreviewed
                ? `${unreviewed} waiting for review`
                : "Research a batch to refill"
          }
          tone={queued > 3 ? "good" : "warn"}
        />
        <Stat
          label="Posts"
          value={String(carousels.length)}
          hint={`${publishedCount} published`}
        />
        <Stat
          label="Connected accounts"
          value={String(activeConnections)}
          hint={
            brand.auto_publish
              ? "Auto-publish is on"
              : "Publishing needs your approval"
          }
          tone={activeConnections ? "good" : "warn"}
        />
      </section>

      {!queued ? (
        <Callout
          title={
            unreviewed
              ? `${unreviewed} keywords waiting for your review`
              : "Your keyword queue is empty"
          }
          body={
            unreviewed
              ? "Approve the ones worth posting about to control what autopilot writes. Until then it falls back to the highest-ranked unreviewed keyword."
              : "Research a batch to see what your audience actually searches for, then approve the ones worth posting about."
          }
          href="/keywords"
          cta={unreviewed ? "Review keywords" : "Research keywords"}
        />
      ) : null}

      {!activeConnections ? (
        <Callout
          title="No accounts connected"
          body="Posts are still written and rendered — connect an account when you want them to post themselves, or download the slides and post by hand."
          href="/settings"
          cta="Connect an account"
        />
      ) : null}

      <section className="rise stagger-3 mt-12">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent posts</h2>
          {carousels.length ? (
            <Link
              href="/carousels"
              className="text-sm underline text-muted-foreground hover:text-foreground transition-colors"
            >
              View all
            </Link>
          ) : null}
        </div>

        {carousels.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-white/15 p-10 text-center">
            <p className="text-sm font-medium">Nothing written yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use <span className="text-foreground">Write one now</span> above
              to see your first post end to end.
            </p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-2">
            {carousels.slice(0, 6).map((carousel) => (
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
                      {new Date(carousel.created_at).toLocaleDateString()}
                    </span>
                  </span>
                  <StatusPill status={carousel.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

const Stat = ({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn" | "neutral";
}) => (
  <div className="bg-background p-6">
    <p className="text-xs uppercase tracking-widest text-muted-foreground">
      {label}
    </p>
    <p
      className={`mt-2 text-3xl font-semibold ${
        tone === "good"
          ? "text-emerald-400"
          : tone === "warn"
            ? "text-amber-400"
            : ""
      }`}
    >
      {value}
    </p>
    {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
  </div>
);

const Callout = ({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) => (
  <div className="rise mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
    <div>
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{body}</p>
    </div>
    <Button variant="secondary" asChild>
      <Link href={href}>{cta}</Link>
    </Button>
  </div>
);
