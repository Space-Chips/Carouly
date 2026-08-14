"use client";

import { ArrowUp } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import type { Block } from "@/components/studio/thread";

/**
 * The agent stopped because it needs you.
 *
 * The alternative to this card is the thing every generator does: not finding a
 * price, and writing "affordable pricing" instead. That is worse than an
 * interruption, because it puts a sentence into someone's advertising that they
 * never said and might not be able to stand behind.
 *
 * So the question gets its own field rather than pointing at the composer. It
 * takes focus, it answers in place, and it says what was already looked at — a
 * question that arrives without showing its working reads as the machine not
 * having tried.
 */
export default function AskCard({
  block,
  onAnswer,
  disabled,
}: {
  block: Extract<Block, { kind: "ask" }>;
  onAnswer: (answer: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const answered = block.answer !== undefined;

  useEffect(() => {
    if (!answered) inputRef.current?.focus();
  }, [answered]);

  return (
    <div className="stream rounded-2xl border border-ember/30 bg-ember/[0.035] p-4">
      <p className="text-[15px] font-medium text-graphite">{block.question}</p>

      {block.why ? (
        <p className="pretty mt-1.5 text-sm leading-relaxed text-mute">{block.why}</p>
      ) : null}

      {answered ? (
        <p className="mt-3 rounded-xl bg-paper-lift px-3 py-2 text-sm text-graphite">
          {block.answer}
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!value.trim()) return;
            onAnswer(value.trim());
          }}
          className="mt-3 flex items-center gap-2 rounded-xl border border-rule bg-paper-lift p-1.5 transition-colors duration-200 focus-within:border-graphite/30"
        >
          <label htmlFor={`answer-${block.id}`} className="sr-only">
            {block.question}
          </label>
          <input
            id={`answer-${block.id}`}
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={block.placeholder ?? "Type your answer"}
            className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-sm text-graphite outline-none placeholder:text-mute"
          />
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            aria-label="Send answer"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-graphite text-white transition-all duration-200 ease-[var(--ease-out)] hover:bg-graphite/85 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite disabled:opacity-30"
          >
            <ArrowUp weight="bold" aria-hidden className="size-3.5" />
          </button>
        </form>
      )}
    </div>
  );
}
