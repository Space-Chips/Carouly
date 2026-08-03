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
export default function Faq({ entries }: { entries: FaqEntry[] }) {
  return (
    <Accordion.Root type="single" collapsible className="w-full">
      {entries.map((entry, index) => (
        <Accordion.Item
          key={entry.question}
          value={`item-${index}`}
          className="border-b border-hair last:border-b-0"
        >
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-start justify-between gap-6 py-6 text-left outline-none focus-visible:ring-2 focus-visible:ring-ember">
              <span className="pretty text-lg font-semibold text-bone">
                {entry.question}
              </span>
              <CaretDown
                weight="bold"
                aria-hidden
                className="mt-1 size-4 shrink-0 text-dim transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:text-ember group-data-[state=open]:rotate-180"
              />
            </Accordion.Trigger>
          </Accordion.Header>

          <Accordion.Content className="accordion-panel overflow-hidden">
            <p className="pretty max-w-2xl pb-6 text-base leading-relaxed text-dim">
              {entry.answer}
            </p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
