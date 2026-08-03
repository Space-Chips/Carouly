"use client";

import { Bell, CreditCard, LockOpen } from "@phosphor-icons/react";

/**
 * The trial, drawn as three dated moments rather than described in a sentence.
 *
 * The objection this answers is the only one that matters on a card required
 * trial: "am I going to get charged without noticing". Showing the reminder as
 * a step of its own — before the charge, with a date on it — is what turns the
 * trial from a trap into a schedule. Teams that have shipped this report both
 * more trial starts and fewer support complaints, which is the tell that it is
 * removing fear rather than manufacturing urgency.
 *
 * Every date is computed from `days`, so changing the trial length in the Clerk
 * dashboard changes this diagram and nothing has to be kept in sync by hand.
 */
export default function TrialTimeline({
  days,
  price,
  period,
}: {
  days: number;
  /** Formatted, e.g. "$290". */
  price: string;
  period: "annual" | "month";
}) {
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

  // The reminder lands three days out, unless the trial is shorter than that,
  // in which case it goes out immediately and there is no middle step to draw.
  const reminderOffset = days - 3;
  const hasReminder = reminderOffset > 0;

  const steps = [
    {
      icon: LockOpen,
      label: "Today",
      date: day(0),
      title: "Full access, nothing charged",
      body: "Autopilot starts writing tonight. Your card is held, not billed.",
    },
    hasReminder
      ? {
          icon: Bell,
          label: `Day ${reminderOffset}`,
          date: day(reminderOffset),
          title: "We email you a reminder",
          body: "Three days before it ends, so cancelling is never a surprise.",
        }
      : null,
    {
      icon: CreditCard,
      label: `Day ${days}`,
      date: day(days),
      title: `${price} ${period === "annual" ? "for the year" : "for the month"}`,
      body: "Only if you have not cancelled. Cancel any time before this and you pay nothing.",
    },
  ].filter((step) => step !== null);

  return (
    <ol className="relative grid gap-6">
      {/* The rail sits behind the icons and stops at the last one rather than
          running off the end of the list. */}
      <span
        aria-hidden
        className="absolute left-[15px] top-4 bottom-4 w-px bg-hair"
      />

      {steps.map((step, index) => {
        const Icon = step.icon;
        const isCharge = index === steps.length - 1;

        return (
          <li key={step.label} className="relative flex gap-4">
            <span
              className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full border ${
                isCharge
                  ? "border-hair bg-raise text-dim"
                  : "border-ember/40 bg-ember/10 text-ember-lit"
              }`}
            >
              <Icon weight="bold" aria-hidden className="size-4" />
            </span>

            <div className="min-w-0 pt-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
                {step.title}
                <span className="text-xs font-normal text-dim">
                  {step.label} · {step.date}
                </span>
              </p>
              <p className="pretty mt-1 text-sm text-muted-foreground">
                {step.body}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
