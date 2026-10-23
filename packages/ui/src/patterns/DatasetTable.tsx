import { useT } from "../i18n/I18nProvider";
import type { ExampleResult } from "../types";

export interface DatasetTableProps {
  examples: ExampleResult[];
  scoreLabel?: string;
}

/** Dataset examples: input, answer and score. Adjacent rows compare at a glance, like any table. */
export function DatasetTable({ examples, scoreLabel }: DatasetTableProps) {
  const t = useT();
  return (
    <div className="fe-table fe-table--dataset">
      <div
        className="fe-table__scroll"
        role="region"
        aria-label={t("column.input")}
        tabIndex={0}
      >
        <table className="fe-table__table">
          <thead>
            <tr>
              <th scope="col" className="fe-table__th fe-table__th--sticky">
                {t("column.example")}
              </th>
              <th scope="col" className="fe-table__th">
                {t("column.input")}
              </th>
              <th scope="col" className="fe-table__th">
                {t("column.answer")}
              </th>
              <th scope="col" className="fe-table__th fe-table__th--num">
                {scoreLabel ?? t("column.score")}
              </th>
            </tr>
          </thead>
          <tbody>
            {examples.map((example) => (
              <tr key={example.id} className="fe-table__row">
                <td className="fe-table__td fe-table__td--sticky mono">{example.id}</td>
                <td className="fe-table__td fe-table__td--clip" title={example.input}>
                  {example.input}
                </td>
                <td className="fe-table__td fe-table__td--clip" title={example.output}>
                  {example.output}
                </td>
                <td className="fe-table__td fe-table__td--num num">
                  {example.referenceScore === null || example.referenceScore === undefined
                    ? "–"
                    : example.referenceScore.toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
