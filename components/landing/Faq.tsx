"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { CaretDown } from "@phosphor-icons/react";

export type FaqEntry = { question: string; answer: string };

/**
 * Objection handling, in plain question and answer form so an answer engine
 * can lift it verbatim. Single column and capped narrow: an FAQ read in two
 * columns makes people scan for the question they already had instead of
 * absorbing the ones they had not thought of yet.
 */
export default function Faq({
  entries,
  tone = "ink",
}: {
  entries: FaqEntry[];
  /** Which ground it sits on. The marketing page is on paper, the app is not. */
  tone?: "ink" | "paper";
}) {
  const paper = tone === "paper";
  const rule = paper ? "border-rule" : "border-hair";
  const question = paper ? "text-graphite" : "text-bone";
  const answer = paper ? "text-mute" : "text-dim";
  const ring = paper ? "focus-visible:ring-graphite" : "focus-visible:ring-ember";

  return (
    <Accordion.Root type="single" collapsible className="w-full">
      {entries.map((entry, index) => (
        <Accordion.Item
          key={entry.question}
          value={`item-${index}`}
          className={`border-b last:border-b-0 ${rule}`}
        >
          <Accordion.Header>
            <Accordion.Trigger
              className={`group flex w-full items-start justify-between gap-6 py-6 text-left outline-none focus-visible:ring-2 ${ring}`}
            >
              <span className={`pretty text-lg font-semibold ${question}`}>
                {entry.question}
              </span>
              <CaretDown
                weight="bold"
                aria-hidden
                className={`mt-1 size-4 shrink-0 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-[state=open]:rotate-180 ${answer} group-hover:text-ember`}
              />
            </Accordion.Trigger>
          </Accordion.Header>

          <Accordion.Content className="accordion-panel overflow-hidden">
            <p className={`pretty max-w-2xl pb-6 text-base leading-relaxed ${answer}`}>
              {entry.answer}
            </p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
