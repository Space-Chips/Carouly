import {
  CAROUSEL_COST,
  COSTS,
  formatCredits,
  OPERATION_LABEL,
  PER_SECOND,
  RENDER_BASE,
  type Operation,
} from "@/lib/credits/prices";

/**
 * The price list, printed.
 *
 * On the buy page rather than buried in a help centre, and above the packs
 * rather than below them, because the question anybody has before choosing an
 * amount is what an amount is worth. A pricing page that will not say what its
 * unit buys is asking to be trusted about the one thing it is being paid for.
 *
 * Video is the last row and reads as a formula rather than a figure, because it
 * is one. Quoting "200 credits" for a cut and then charging 280 for a longer
 * format is the fastest way to make everything above it look like a guess.
 */
export default function CostList() {
  const rows: { operation: Operation; cost: string; note?: string }[] = [
    { operation: "chat_turn", cost: formatCredits(COSTS.chat_turn), note: "Per message, however many steps it takes." },
    { operation: "read_site", cost: formatCredits(COSTS.read_site) },
    { operation: "research_site", cost: formatCredits(COSTS.research_site) },
    { operation: "build_brand_kit", cost: formatCredits(COSTS.build_brand_kit) },
    { operation: "suggest_templates", cost: formatCredits(COSTS.suggest_templates) },
    { operation: "compose_template", cost: formatCredits(COSTS.compose_template) },
    { operation: "carousel", cost: formatCredits(CAROUSEL_COST) },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-rule bg-paper-lift">
      <ul className="divide-y divide-rule">
        {rows.map((row) => (
          <li
            key={row.operation}
            className="flex items-baseline justify-between gap-6 px-5 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm text-graphite">
                {OPERATION_LABEL[row.operation]}
              </p>
              {row.note ? (
                <p className="pretty mt-0.5 text-xs text-mute">{row.note}</p>
              ) : null}
            </div>
            <p className="shrink-0 font-mono text-sm tabular-nums text-mute">
              {row.cost}
            </p>
          </li>
        ))}

        {/* The expensive one, set apart. Everything above is single or double
            digits and this is hundreds, so putting it in the same rhythm would
            hide the only number that changes anyone's behaviour. */}
        <li className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 bg-paper-sunk/60 px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-graphite">
              {OPERATION_LABEL.make_video}
            </p>
            <p className="pretty mt-0.5 text-xs text-mute">
              Casting and assembly, plus the length you asked for. A sixteen
              second cut is {formatCredits(RENDER_BASE + 16 * PER_SECOND)}; a
              twenty-four second one is{" "}
              {formatCredits(RENDER_BASE + 24 * PER_SECOND)}.
            </p>
          </div>
          <p className="shrink-0 font-mono text-sm tabular-nums text-graphite">
            {formatCredits(RENDER_BASE)} + {formatCredits(PER_SECOND)}/sec
          </p>
        </li>
      </ul>
    </div>
  );
}
