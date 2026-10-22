import clsx from "clsx";
import { useT } from "../i18n/I18nProvider";
import type { Example } from "../types";

export interface ExamplesTableProps {
  examples: Example[];
  direction?: "maximize" | "minimize" | "none";
  onlyDiff?: boolean;
}

/** Examples of a run evaluation: input, output, score and the delta to the baseline. */
export function ExamplesTable({
  examples,
  direction = "maximize",
  onlyDiff = false,
}: ExamplesTableProps) {
  const t = useT();
  const rows = onlyDiff
    ? examples.filter((example) => example.score !== example.baselineScore)
    : examples;

  if (rows.length === 0) {
    return <p className="fe-note">{t("empty.noDifferences")}</p>;
  }

  return (
    <div className="fe-table fe-table--examples">
      <div
        className="fe-table__scroll"
        role="region"
        aria-label={t("column.scores")}
        tabIndex={0}
      >
        <table className="fe-table__table">
          <thead>
            <tr>
              <th scope="col" className="fe-table__th fe-table__th--sticky">
                Example
              </th>
              <th scope="col" className="fe-table__th">
                {t("column.input")}
              </th>
              <th scope="col" className="fe-table__th">
                {t("column.output")}
              </th>
              <th scope="col" className="fe-table__th fe-table__th--num">
                {t("column.score")}
              </th>
              <th scope="col" className="fe-table__th fe-table__th--num">
                {t("column.deltaToBaseline")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((example) => {
              const baseline = example.baselineScore;
              const delta =
                baseline === null || baseline === undefined ? null : example.score - baseline;
              const better = direction === "maximize" ? (delta ?? 0) > 0 : (delta ?? 0) < 0;
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
                    {example.score.toFixed(2)}
                  </td>
                  <td
                    className={clsx(
                      "fe-table__td fe-table__td--num num",
                      delta !== null && delta !== 0 && (better ? "fe-delta--better" : "fe-delta--worse"),
                    )}
                  >
                    {delta === null ? "–" : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(2)}`}
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
