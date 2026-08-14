"use client";

import { ArrowUp, Square } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

/**
 * The prompt bar.
 *
 * It takes anything: an address, a correction, a question, an instruction. That
 * is not a convenience — it is the whole point of the agent being an agent. The
 * earlier version accepted only a URL, which meant the one thing you most want
 * to do halfway through a run ("our pricing actually starts at £14") had nowhere
 * to go.
 *
 * A textarea rather than an input, because people paste sentences into this. It
 * grows to fit and stops at a height where the transcript is still visible —
 * a composer that can eat the screen is a composer you have to fight.
 */
export default function Composer({
  onSubmit,
  onStop,
  busy,
  variant = "docked",
  placeholder = "Paste a web address, or ask for something",
}: {
  onSubmit: (message: string) => void;
  onStop?: () => void;
  busy: boolean;
  variant?: "hero" | "docked";
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const hero = variant === "hero";

  // Grow to fit. Reset to auto first, or the box can only ever get taller.
  //
  // Deferred a frame rather than measured inline: on the first pass the element
  // has been hydrated but the stylesheet has not necessarily been applied to it
  // yet, and measuring an unstyled textarea returns a scrollHeight that pins the
  // composer open at its maximum for the rest of the session.
  useEffect(() => {
    const field = ref.current;
    if (!field) return;

    const fit = () => {
      field.style.height = "auto";
      field.style.height = `${Math.min(field.scrollHeight, 200)}px`;
    };

    const frame = requestAnimationFrame(fit);
    window.addEventListener("resize", fit);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", fit);
    };
  }, [value]);

  const submit = () => {
    const message = value.trim();
    if (!message || busy) return;
    setValue("");
    onSubmit(message);
  };

  return (
    <div className={hero ? "mx-auto w-full max-w-[560px]" : "w-full"}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className={`flex items-end gap-2 rounded-2xl border border-rule bg-paper-lift p-2 transition-all duration-300 ease-[var(--ease-out)] focus-within:border-graphite/30 ${
          hero
            ? "shadow-[0_1px_2px_rgba(12,10,9,0.04),0_12px_32px_-12px_rgba(12,10,9,0.16)] focus-within:shadow-[0_1px_2px_rgba(12,10,9,0.06),0_20px_44px_-14px_rgba(12,10,9,0.24)]"
            : "shadow-[0_1px_2px_rgba(12,10,9,0.04),0_8px_24px_-16px_rgba(12,10,9,0.3)]"
        }`}
      >
        <label htmlFor="studio-prompt" className="sr-only">
          Message
        </label>

        <textarea
          id="studio-prompt"
          ref={ref}
          rows={1}
          value={value}
          autoFocus={hero}
          spellCheck={false}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter breaks the line. The other way round is
            // correct for a document and wrong for a conversation.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className={`min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-graphite outline-none placeholder:text-mute ${
            hero ? "text-[17px]" : "text-[15px]"
          }`}
        />

        {busy && onStop ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-graphite text-white transition-all duration-200 ease-[var(--ease-out)] hover:bg-graphite/85 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite"
          >
            <Square weight="fill" aria-hidden className="size-3" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={busy || !value.trim()}
            aria-label="Send"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-graphite text-white transition-all duration-200 ease-[var(--ease-out)] hover:bg-graphite/85 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite disabled:opacity-30"
          >
            <ArrowUp weight="bold" aria-hidden className="size-4" />
          </button>
        )}
      </form>
    </div>
  );
}
