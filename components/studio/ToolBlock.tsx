"use client";

import { CaretRight, Warning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { formatMs, type Block } from "@/components/studio/thread";

/**
 * One thing the agent did.
 *
 * There is no rail running down the transcript. An earlier version drew one
 * through everything, which made a conversation look like a pipeline diagram
 * and put a line beside messages that were not steps in anything. The rail now
 * appears only inside an unfolded call list, where it is doing an actual job:
 * tying a set of indented rows to the thing that produced them.
 *
 * Nested calls fold the moment the tool finishes. While it is running they are
 * the only evidence anything is happening, so they stay; afterwards they are
 * detail, and detail that will not fold is a wall.
 */
export default function ToolBlock({
  block,
}: {
  block: Extract<Block, { kind: "tool" }>;
}) {
  const running = block.status === "running";
  const [open, setOpen] = useState(true);

  // Fold on completion, but never fight a reader who opened it back up: this
  // only fires on the transition out of `running`.
  useEffect(() => {
    if (!running) setOpen(false);
  }, [running]);

  return (
    <div className="stream">
      <div className="flex items-baseline gap-2.5">
        <Marker status={block.status} />

        <h3
          className={`text-[15px] font-medium ${
            block.status === "failed"
              ? "text-fail"
              : block.status === "stopped"
                ? "text-mute"
                : "text-graphite"
          } ${running ? "pending" : ""}`}
        >
          {block.label}
        </h3>

        {block.status === "stopped" ? (
          <span className="font-mono text-xs text-mute">stopped</span>
        ) : null}

        {block.ms !== undefined ? (
          <span className="font-mono text-xs tabular-nums text-mute">
            {formatMs(block.ms)}
          </span>
        ) : null}

        {block.summary ? (
          <span className="min-w-0 flex-1 truncate text-sm text-mute">
            {block.summary}
          </span>
        ) : null}
      </div>

      {block.error ? (
        <p className="pretty ml-[26px] mt-2 flex gap-2 text-sm text-fail">
          <Warning weight="fill" aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{block.error}</span>
        </p>
      ) : null}

      {block.steps.length ? (
        <div className="ml-[26px] mt-2">
          {!running ? (
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              aria-expanded={open}
              className="-ml-1 flex items-center gap-1.5 rounded px-1 py-0.5 font-mono text-xs text-mute transition-colors duration-150 hover:text-graphite focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite"
            >
              <CaretRight
                weight="bold"
                aria-hidden
                className={`size-3 transition-transform duration-200 ease-[var(--ease-out)] ${
                  open ? "rotate-90" : ""
                }`}
              />
              {block.steps.length} call{block.steps.length === 1 ? "" : "s"}
            </button>
          ) : null}

          {open ? (
            <ul className="mt-1.5 space-y-1 border-l border-rule pl-3">
              {block.steps.map((step, index) => (
                <li
                  key={`${step.label}-${index}`}
                  className="stream flex items-baseline gap-2 font-mono text-xs"
                >
                  {/* The label carries the state, not the duration.
                      `ok: false` used to be expressed only by colouring the
                      timing figure, which meant a step that went wrong without
                      one — a retry, a page that never answered — was drawn
                      exactly like a step that succeeded. The one case where the
                      signal matters most is the case that had no signal. */}
                  <span
                    className={`shrink-0 ${
                      step.ok === false ? "text-fail" : "text-graphite"
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-mute">{step.detail}</span>
                  {step.ms !== undefined ? (
                    <span
                      className={`shrink-0 tabular-nums ${
                        step.ok === false ? "text-fail" : "text-mute"
                      }`}
                    >
                      {formatMs(step.ms)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Running is the ember dot the whole site already uses for "live"; done is a
 * tick that draws itself once; failed is a filled square rather than a red dot,
 * so the shape carries the state as well as the colour.
 */
const Marker = ({
  status,
}: {
  status: "running" | "done" | "failed" | "stopped";
}) => {
  // Stopped is not failed. Nothing went wrong — it was interrupted — so it gets
  // a hollow ring rather than the failure square, and stays in the muted ink.
  if (status === "stopped") {
    return (
      <span
        aria-hidden
        className="mt-[1px] size-2 shrink-0 translate-y-[-1px] rounded-full border-[1.5px] border-mute"
      />
    );
  }

  if (status === "running") {
    return (
      <span
        aria-hidden
        className="ping relative mt-[1px] size-2 shrink-0 translate-y-[-1px] rounded-full bg-ember text-ember"
      />
    );
  }

  if (status === "failed") {
    return (
      <span
        aria-hidden
        className="mt-[1px] size-2 shrink-0 translate-y-[-1px] rounded-[2px] bg-fail"
      />
    );
  }

  return (
    <svg
      aria-hidden
      viewBox="0 0 14 14"
      className="size-3.5 shrink-0 translate-y-[2px] text-graphite"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path className="draw" d="M2 7.5 5.5 11 12 3.5" />
    </svg>
  );
};
