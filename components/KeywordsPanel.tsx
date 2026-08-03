"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import ResearchProgress, { type Stage } from "@/components/ResearchProgress";
import { Button } from "@/components/ui/button";
import { generateCarouselNow } from "@/lib/actions/carousel.actions";
import {
  harvestKeywords,
  researchSeeds,
  setKeywordsStatus,
} from "@/lib/actions/keyword.actions";
import { competitionBand } from "@/lib/keywords";
import { Keyword } from "@/types";

const STAGES: Stage[] = [
  { key: "seeds", label: "Mapping topics in your domain" },
  { key: "harvest", label: "Pulling and ranking real search suggestions" },
];

const bandClass = {
  easy: "bg-emerald-500/15 text-emerald-300",
  medium: "bg-amber-500/15 text-amber-300",
  hard: "bg-red-500/15 text-red-300",
};

type Tab = "new" | "approved" | "used" | "archived";

const TABS: { key: Tab; label: string }[] = [
  { key: "new", label: "To review" },
  { key: "approved", label: "Queue" },
  { key: "used", label: "Written" },
  { key: "archived", label: "Archived" },
];

/**
 * The keyword bank is a review queue, not a black box.
 *
 * Ranking is arithmetic (see lib/keywords.ts) so the same phrase always scores
 * the same, and the decision that actually matters — is this worth posting
 * about — belongs to the user, who reviews and approves in bulk.
 */
export default function KeywordsPanel({ keywords }: { keywords: Keyword[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("new");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>(STAGES);
  const [stageIndex, setStageIndex] = useState(0);
  const [doneStages, setDoneStages] = useState<Set<string>>(new Set());

  const researching = busy === "research";
  const counts = useMemo(
    () =>
      keywords.reduce<Record<string, number>>((acc, keyword) => {
        acc[keyword.status] = (acc[keyword.status] ?? 0) + 1;
        return acc;
      }, {}),
    [keywords]
  );

  const visible = useMemo(
    () => keywords.filter((keyword) => keyword.status === tab),
    [keywords, tab]
  );

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allShownSelected =
    visible.length > 0 && visible.every((k) => selected.has(k.id));

  const run = (name: string, fn: () => Promise<void>) => {
    setError(null);
    setMessage(null);
    setBusy(name);

    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setBusy(null);
      }
    });
  };

  const research = () => {
    setError(null);
    setMessage(null);
    setBusy("research");
    setStages(STAGES);
    setStageIndex(0);
    setDoneStages(new Set());

    const complete = (key: string, detail?: string, next?: number) => {
      setDoneStages((current) => new Set(current).add(key));
      setStages((current) =>
        current.map((s) => (s.key === key ? { ...s, detail } : s))
      );
      if (next !== undefined) setStageIndex(next);
    };

    startTransition(async () => {
      try {
        const { seeds } = await researchSeeds();
        complete("seeds", `${seeds.length} topics`, 1);

        const { added, found, usedFallback } = await harvestKeywords(seeds);
        complete("harvest", `${added} new`);

        setMessage(
          usedFallback
            ? `Search suggestions were unavailable, so these ${added} keywords are model estimates rather than real queries.`
            : added
              ? `Found ${found} phrases, ${added} of them new. Review and approve the ones worth posting about.`
              : `Found ${found} phrases — all of them already in your bank.`
        );
        setTab("new");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Research failed.");
      } finally {
        setBusy(null);
      }
    });
  };

  const bulk = (status: Keyword["status"], label: string) => {
    const ids = [...selected];

    run(status, async () => {
      const { updated } = await setKeywordsStatus(ids, status);
      setSelected(new Set());
      setMessage(`${updated} keyword${updated === 1 ? "" : "s"} ${label}.`);
    });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <Button disabled={pending} onClick={research}>
          {researching ? "Researching…" : "Research keywords"}
        </Button>
        {!researching ? (
          <span className="text-xs text-muted-foreground max-w-lg">
            Phrases come from live search autocomplete and are ranked
            arithmetically — no model opinion. You decide which are worth
            posting about.
          </span>
        ) : null}
      </div>

      {researching ? (
        <div className="rise rounded-xl border border-white/10 p-5">
          <ResearchProgress
            stages={stages}
            current={stageIndex}
            done={doneStages}
          />
        </div>
      ) : null}

      {message ? <p className="rise text-sm text-emerald-400">{message}</p> : null}
      {error ? <p className="rise text-sm text-red-400">{error}</p> : null}

      {/* Queue health — autopilot's behaviour depends on this, so say it plainly. */}
      <p className="text-xs text-muted-foreground">
        {counts.approved
          ? `${counts.approved} keyword${counts.approved === 1 ? "" : "s"} queued for autopilot.`
          : "Nothing queued — autopilot will fall back to the highest-ranked unreviewed keyword."}
      </p>

      <div className="flex flex-wrap gap-1 border-b border-white/10">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => {
              setTab(item.key);
              setSelected(new Set());
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === item.key
                ? "border-orange-500 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
            <span className="ml-2 text-xs tabular-nums opacity-60">
              {counts[item.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {selected.size ? (
        <div className="rise flex flex-wrap items-center gap-2 rounded-lg border border-white/10 p-3">
          <span className="text-sm">{selected.size} selected</span>
          <div className="flex flex-wrap gap-2">
            {tab !== "approved" ? (
              <Button
                size="sm"
                disabled={pending}
                onClick={() => bulk("approved", "queued")}
              >
                {busy === "approved" ? "Queueing…" : "Add to queue"}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => bulk("new", "returned to review")}
              >
                Remove from queue
              </Button>
            )}
            {tab !== "archived" ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => bulk("archived", "archived")}
              >
                Archive
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => bulk("new", "restored")}
              >
                Restore
              </Button>
            )}
          </div>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-muted-foreground underline"
          >
            Clear
          </button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="rise rounded-xl border border-dashed border-white/15 p-12 text-center">
          <p className="text-sm font-medium">
            {tab === "new"
              ? "Nothing to review"
              : tab === "approved"
                ? "The queue is empty"
                : `No ${tab} keywords`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {tab === "new"
              ? "Research a batch to find new phrases."
              : tab === "approved"
                ? "Approve keywords from the review tab to control what autopilot writes next."
                : "They will show up here as you go."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-muted-foreground">
              <tr>
                <th className="p-3 w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    className="size-4 accent-orange-500"
                    checked={allShownSelected}
                    onChange={() =>
                      setSelected(
                        allShownSelected
                          ? new Set()
                          : new Set(visible.map((k) => k.id))
                      )
                    }
                  />
                </th>
                <th className="text-left font-medium p-3">Keyword</th>
                <th className="text-right font-medium p-3">
                  <span title="0-100 signal from live search autocomplete: Google's own relevance score for the phrase plus how many topics surfaced it. Not search volume.">
                    Demand
                  </span>
                </th>
                <th className="text-left font-medium p-3">
                  <span title="Estimated from phrase length, Google's relevance score, breadth and commercial wording. An estimate — true difficulty needs paid SERP data.">
                    Competition
                  </span>
                </th>
                <th className="text-right font-medium p-3">Score</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((keyword) => {
                const band = competitionBand(keyword.difficulty);
                const isSelected = selected.has(keyword.id);

                return (
                  <tr
                    key={keyword.id}
                    onClick={() => toggle(keyword.id)}
                    className={`cursor-pointer border-t border-white/10 surface ${
                      isSelected ? "bg-orange-500/5" : ""
                    }`}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        className="size-4 accent-orange-500"
                        checked={isSelected}
                        onChange={() => toggle(keyword.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Select ${keyword.keyword}`}
                      />
                    </td>
                    <td className="p-3 font-medium">
                      {keyword.keyword}
                      {keyword.source === "llm" ? (
                        <span
                          className="ml-2 text-xs text-muted-foreground italic"
                          title="Model estimate — search autocomplete was unavailable"
                        >
                          estimate
                        </span>
                      ) : null}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {keyword.demand}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${bandClass[band.tone]}`}
                      >
                        {band.label} · {keyword.difficulty}
                      </span>
                    </td>
                    <td className="p-3 text-right tabular-nums font-medium">
                      {Number(keyword.score).toFixed(1)}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {keyword.status !== "used" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={(event) => {
                            event.stopPropagation();
                            run(keyword.id, async () => {
                              const { carouselId } = await generateCarouselNow(
                                keyword.id
                              );
                              router.push(`/carousels/${carouselId}`);
                            });
                          }}
                        >
                          {busy === keyword.id ? "Writing…" : "Write it"}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">
                          written
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
