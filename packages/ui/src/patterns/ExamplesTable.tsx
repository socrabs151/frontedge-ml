import clsx from "clsx";
import { formatMetric } from "../format";
import type { Example } from "../types";

export interface ExamplesTableProps {
  examples: Example[];
  direction?: "maximize" | "minimize" | "none";
  onlyDiff?: boolean;
}

export function ExamplesTable({ examples, direction = "maximize", onlyDiff = false }: ExamplesTableProps) {
  const rows = onlyDiff
    ? examples.filter((example) => example.score !== example.baselineScore)
    : examples;

  if (rows.length === 0) {
    return (
      <p className="fe-note">
        Различий нет — все примеры оценены так же, как в baseline.
      </p>
    );
  }

  return (
    <div className="fe-table fe-table--examples">
      <div
        className="fe-table__scroll"
        role="region"
        aria-label="Примеры оценки"
        tabIndex={0}
      >
      <table className="fe-table__table">
        <thead>
          <tr>
            <th scope="col" className="fe-table__th fe-table__th--sticky">
              Example
            </th>
            <th scope="col" className="fe-table__th">
              Вход
            </th>
            <th scope="col" className="fe-table__th">
              Выход
            </th>
            <th scope="col" className="fe-table__th fe-table__th--num">
              Score
            </th>
            <th scope="col" className="fe-table__th fe-table__th--num">
              Δ к baseline
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((example) => {
            const delta =
              example.baselineScore === undefined || example.baselineScore === null
                ? 0
                : example.score - example.baselineScore;
            const better = direction === "maximize" ? delta > 0 : delta < 0;
            return (
              <tr key={example.id} className="fe-table__row">
                <td className="fe-table__td fe-table__td--sticky mono">{example.id}</td>
                <td className="fe-table__td fe-table__td--clip" title={example.input}>
                  {example.input}
                </td>
                <td className="fe-table__td fe-table__td--clip" title={example.output}>
                  {example.output}
                </td>
                <td className="fe-table__td fe-table__td--num num">
                  {formatMetric(example.score, 2)}
                </td>
                <td
                  className={clsx(
                    "fe-table__td fe-table__td--num num",
                    delta !== 0 && (better ? "fe-delta--better" : "fe-delta--worse"),
                  )}
                >
                  {delta === 0 ? "±0" : `${delta > 0 ? "+" : "−"}${formatMetric(Math.abs(delta), 2)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
