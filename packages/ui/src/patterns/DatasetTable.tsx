import clsx from "clsx";
import { EMPTY, formatMetric } from "../format";
import { useI18n } from "../i18n/I18nProvider";
import type { ExampleResult } from "../types";

export interface DatasetTableProps {
  examples: ExampleResult[];
  scoreLabel?: string;
  /** The selected example id, for the drill-down panel. */
  selectedId?: string;
  onSelect?: (example: ExampleResult) => void;
}

/** Dataset examples: input, answer and score. Adjacent rows compare at a glance, like any table. */
export function DatasetTable({
  examples,
  scoreLabel,
  selectedId,
  onSelect,
}: DatasetTableProps) {
  const { t, lang } = useI18n();
  return (
    <div className="fe-table fe-table--dataset">
      <div
        className="fe-table__scroll"
        role="region"
        aria-label={t("table.datasets")}
        tabIndex={0}
      >
        <table className="fe-table__table">
          <caption className="sr-only">{t("table.datasets")}</caption>
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
            {examples.map((example) => {
              const selected = selectedId === example.id;
              return (
                <tr
                  key={example.id}
                  className={clsx(
                    "fe-table__row",
                    onSelect && "fe-table__row--selectable",
                  )}
                  aria-selected={onSelect ? selected : undefined}
                  tabIndex={onSelect ? 0 : undefined}
                  onClick={onSelect ? () => onSelect(example) : undefined}
                  onKeyDown={
                    onSelect
                      ? (event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          onSelect(example);
                        }
                      : undefined
                  }
                >
                  <td className="fe-table__td fe-table__td--sticky fe-mono">{example.id}</td>
                  <td className="fe-table__td fe-table__td--clip" title={example.input}>
                    {example.input}
                  </td>
                  <td className="fe-table__td fe-table__td--clip" title={example.output}>
                    {example.output || EMPTY}
                  </td>
                  <td className="fe-table__td fe-table__td--num fe-num">
                    {example.referenceScore === null || example.referenceScore === undefined
                      ? EMPTY
                      : formatMetric(example.referenceScore, 3, lang)}
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
