/**
 * The alternatives, priced honestly.
 *
 * A comparison only persuades if the other columns are recognisable to someone
 * who has actually tried them, so the retainer column is not a strawman and the
 * do-it-yourself column names the real cost, which is never money.
 *
 * Two renderings of one dataset: a table where there is width for four columns,
 * and a card per alternative below that. The table is hidden from assistive tech
 * on small screens rather than duplicated into it.
 */

const columns = ["Carouly", "A creator on retainer", "Doing it yourself"];

const rows: { label: string; values: [string, string, string] }[] = [
  {
    label: "First clips out the door",
    values: ["Tonight", "Two to three weeks", "The weekend you keep moving"],
  },
  {
    label: "What it costs",
    values: [
      "Free while in early access",
      "$900 to $2,400 a month",
      "Four evenings a month",
    ],
  },
  {
    label: "Clips per run",
    values: ["Six to twelve", "Two to four", "One, if the week is kind"],
  },
  {
    label: "Where the idea comes from",
    values: [
      "Live search demand in your field",
      "A brief you write first",
      "Whatever came past on your own feed",
    ],
  },
  {
    label: "Captions and covers",
    values: [
      "Written with the cut, same night",
      "Quoted separately",
      "A second evening's work",
    ],
  },
  {
    label: "Getting it published",
    values: [
      "Five networks from one setup",
      "Files land in a shared drive",
      "By hand, five times",
    ],
  },
];

export default function CompareTable() {
  return (
    <>
      <table className="hidden w-full border-collapse text-left lg:table">
        <thead>
          <tr>
            <th scope="col" className="w-56 pb-4" />
            {columns.map((column, index) => (
              <th
                key={column}
                scope="col"
                className={`pb-4 text-base font-semibold ${
                  index === 0 ? "text-graphite" : "text-mute"
                }`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-rule align-top">
              <th
                scope="row"
                className="py-4 pr-6 font-mono text-xs font-normal uppercase tracking-[0.2em] text-mute"
              >
                {row.label}
              </th>
              {row.values.map((value, index) => (
                <td
                  key={value}
                  className={`py-4 pr-6 text-base leading-relaxed ${
                    index === 0 ? "font-semibold text-graphite" : "text-mute"
                  }`}
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="grid gap-4 lg:hidden">
        {columns.map((column, columnIndex) => (
          <li
            key={column}
            className={`rounded-2xl border p-4 ${
              columnIndex === 0
                ? "border-graphite/20 bg-paper-lift"
                : "border-rule bg-paper-sunk"
            }`}
          >
            <h3
              className={`text-base font-semibold ${
                columnIndex === 0 ? "text-graphite" : "text-mute"
              }`}
            >
              {column}
            </h3>
            <dl className="mt-4 space-y-3">
              {rows.map((row) => (
                <div key={row.label}>
                  <dt className="font-mono text-xs uppercase tracking-[0.2em] text-mute">
                    {row.label}
                  </dt>
                  <dd
                    className={`pretty mt-1 text-base leading-relaxed ${
                      columnIndex === 0 ? "text-graphite" : "text-mute"
                    }`}
                  >
                    {row.values[columnIndex]}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
