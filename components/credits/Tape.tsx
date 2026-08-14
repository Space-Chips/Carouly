import type { Entry } from "@/lib/credits/ledger";
import { formatCredits, OPERATION_LABEL, type Operation } from "@/lib/credits/prices";

/**
 * Where the credits went, as a till roll.
 *
 * The form is the argument. A metered product lives or dies on whether people
 * believe the meter, and the thing that makes a meter believable is not a chart
 * — it is a printed line per event with a running total down the right-hand
 * edge, which is how every till receipt and bank statement anybody has ever
 * checked is laid out. Reaching for a donut of spend-by-category here would be
 * decorating the one screen whose whole job is to be checkable.
 *
 * So: mono, tabular, right-aligned figures, hairline rules, no fills. The only
 * colour is on the sign of the number, and even that is carried by the sign
 * itself as well, because a person who cannot distinguish the ember from the
 * green still has to be able to read their own statement.
 */
export default function Tape({ entries }: { entries: Entry[] }) {
  if (!entries.length) {
    return (
      <p className="rounded-xl border border-dashed border-rule px-5 py-8 text-center text-sm text-mute">
        Nothing spent yet. Every charge will be listed here, with what it was
        for and what was left afterwards.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left">
        <caption className="sr-only">
          Every credit added to or taken from this account, newest first.
        </caption>
        <thead>
          <tr className="border-b border-rule font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
            <th scope="col" className="py-2 pr-4 font-normal">
              What
            </th>
            <th scope="col" className="py-2 pr-4 font-normal">
              When
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-normal">
              Change
            </th>
            <th scope="col" className="py-2 text-right font-normal">
              Left
            </th>
          </tr>
        </thead>

        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className="border-b border-rule/70 align-top last:border-b-0"
            >
              <td className="py-3 pr-4">
                <span className="text-sm text-graphite">{label(entry)}</span>
                {entry.detail ? (
                  <span className="block truncate text-xs text-mute">
                    {entry.detail}
                  </span>
                ) : null}
              </td>

              <td className="py-3 pr-4 align-middle font-mono text-xs tabular-nums text-mute">
                {when(entry.createdAt)}
              </td>

              <td
                className={`py-3 pr-4 text-right align-middle font-mono text-sm tabular-nums ${
                  entry.delta < 0 ? "text-graphite" : "text-ok"
                }`}
              >
                {entry.delta < 0 ? "−" : "+"}
                {formatCredits(Math.abs(entry.delta))}
              </td>

              <td className="py-3 text-right align-middle font-mono text-sm tabular-nums text-mute">
                {formatCredits(entry.balanceAfter)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * What to call a line.
 *
 * The operation when there is one, because "Rendering a cut" is what happened.
 * The kind otherwise — a purchase and a welcome grant have no operation, and
 * neither needs one.
 */
const label = (entry: Entry) => {
  if (entry.operation && entry.operation in OPERATION_LABEL) {
    return OPERATION_LABEL[entry.operation as Operation];
  }

  switch (entry.kind) {
    case "purchase":
      return "Credits bought";
    case "grant":
      return "Credits added";
    case "refund":
      return "Refunded";
    case "adjustment":
      return "Adjustment";
    default:
      return "Work";
  }
};

/**
 * Dates on a statement are read as "was that the one from this morning", so
 * today's entries get a clock and older ones get a date. A full timestamp on
 * every row is four columns of noise to answer a question nobody asked.
 */
const when = (iso: string) => {
  const at = new Date(iso);
  const today = new Date().toDateString() === at.toDateString();

  return today
    ? at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : at.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};
