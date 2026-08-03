"use client";

export type Stage = {
  key: string;
  label: string;
  /** Filled in once the stage completes, e.g. "38 phrases". */
  detail?: string;
};

/**
 * Progress for keyword research.
 *
 * Every stage here is a real unit of work that has genuinely finished — the
 * client awaits each server action in turn, so a tick means the data is back,
 * not that a timer elapsed. The count next to a finished stage is the real
 * count returned by it.
 */
export default function ResearchProgress({
  stages,
  current,
  done,
}: {
  stages: Stage[];
  current: number;
  done: Set<string>;
}) {
  return (
    <ol className="grid gap-3">
      {stages.map((stage, index) => {
        const complete = done.has(stage.key);
        const active = index === current && !complete;

        return (
          <li key={stage.key} className="flex items-center gap-3 text-sm">
            <span
              className={`grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-300 ${
                complete
                  ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300"
                  : active
                    ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                    : "border-white/15 text-muted-foreground"
              }`}
            >
              {complete ? (
                <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
                  <path
                    d="M2.5 6.5l2.2 2.2L9.5 3.9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <span
                  className={`size-1.5 rounded-full bg-current ${active ? "breathe" : "opacity-40"}`}
                />
              )}
            </span>

            <span
              className={
                complete || active ? "text-foreground" : "text-muted-foreground"
              }
            >
              {stage.label}
            </span>

            {stage.detail ? (
              <span className="text-xs text-muted-foreground tabular-nums">
                {stage.detail}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
