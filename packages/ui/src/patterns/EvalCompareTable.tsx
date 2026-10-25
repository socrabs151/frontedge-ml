import clsx from "clsx";
import { useI18n, type Lang } from "../i18n/I18nProvider";
import { formatMetric } from "../format";
import { describeDelta } from "./MetricCell";
import type { EvalComparison, MetricDirection } from "../types";

export type DeltaFormat = "value" | "percent" | "relative";

export function formatScore(
  value: number | null | undefined,
  format: DeltaFormat,
  reference?: number | null,
  lang: Lang = "en",
): string {
  if (value === null || value === undefined) return "–";
  if (format === "percent") {
    const percent = value * (Math.abs(value) <= 1.5 ? 100 : 1);
    return `${formatMetric(percent, 1, lang)}%`;
  }
  if (format === "relative") {
    if (reference === null || reference === undefined || reference === 0) return "–";
    return `×${formatMetric(value / reference, 3, lang)}`;
  }
  return formatMetric(value, 3, lang);
}

export interface EvalCompareTableProps {
  comparison: EvalComparison;
  onlyDiff?: boolean;
  format?: DeltaFormat;
}

/**
 * Two runs compared over one evaluation.
 *
 * Examples are rows, columns are grouped by role (input / output / scores), the
 * reference run is pinned left, and the delta is computed against it. The
 * direction of the metric belongs to its owner, so the word "better" follows the
 * configured direction rather than a colour.
 */
export function EvalCompareTable({
  comparison,
  onlyDiff = false,
  format = "value",
}: EvalCompareTableProps) {
  const { t, lang } = useI18n();
  const direction: MetricDirection = comparison.direction;
  const rows = onlyDiff
    ? comparison.examples.filter((example) => example.changed)
    : comparison.examples;

  const aggregateDelta = comparison.comparisonAggregate - comparison.referenceAggregate;
  const aggregateMeta = describeDelta(aggregateDelta, direction);

  return (
    <div className="fe-table fe-table--eval">
      <div
        className="fe-table__scroll"
        role="region"
        aria-label={t("column.scores")}
        tabIndex={0}
      >
        <table className="fe-table__table">
          <thead>
            <tr className="fe-table__group-row">
              <th scope="col" className="fe-table__th fe-table__th--sticky fe-table__th--group">
                {t("column.example")}
              </th>
              <th scope="col" className="fe-table__th fe-table__th--group">
                {t("column.input")}
              </th>
              <th scope="col" className="fe-table__th fe-table__th--group">
                {t("column.output")}
              </th>
              <th scope="colgroup" colSpan={3} className="fe-table__th fe-table__th--group fe-table__th--scores">
                {t("column.scores")}
              </th>
            </tr>
            <tr>
              <th scope="col" className="fe-table__th fe-table__th--sticky">
                {t("column.id")}
              </th>
              <th scope="col" className="fe-table__th">
                {t("column.text")}
              </th>
              <th scope="col" className="fe-table__th">
                {t("column.answer")}
              </th>
              <th scope="col" className="fe-table__th fe-table__th--num">
                {t("column.reference")}
              </th>
              <th scope="col" className="fe-table__th fe-table__th--num">
                {t("column.run")}
              </th>
              <th scope="col" className="fe-table__th fe-table__th--num">
                Δ
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="fe-table__td fe-table__td--empty">
                  {t("empty.noDifferences")}
                </td>
              </tr>
            ) : null}
            {rows.map((example) => {
              const reference = example.referenceScore;
              const comparisonScore = example.comparisonScore;
              const delta =
                reference === null ||
                reference === undefined ||
                comparisonScore === null ||
                comparisonScore === undefined
                  ? null
                  : comparisonScore - reference;
              const meta = delta === null ? null : describeDelta(delta, direction);

              return (
                <tr key={example.id} className="fe-table__row">
                  <td className="fe-table__td fe-table__td--sticky">
                    <span className="fe-eval__id fe-mono">{example.id}</span>
                    {example.changed ? (
                      <span
                        className="fe-eval__changed"
                        title={t("eval.scoredDifferently")}
                        aria-label={t("eval.scoredDifferently")}
                      >
                        {delta !== null && delta > 0 ? "↑" : "↓"}
                      </span>
                    ) : null}
                  </td>
                  <td className="fe-table__td fe-table__td--clip" title={example.input}>
                    {example.input}
                  </td>
                  <td className="fe-table__td fe-table__td--clip" title={example.output}>
                    {example.output}
                  </td>
                  <td className="fe-table__td fe-table__td--num fe-num">
                    {formatScore(reference, format, reference, lang)}
                  </td>
                  <td className="fe-table__td fe-table__td--num fe-num">
                    {formatScore(comparisonScore, format, reference, lang)}
                  </td>
                  <td
                    className={clsx(
                      "fe-table__td fe-table__td--num fe-num",
                      delta !== null && delta !== 0 && "fe-eval__delta",
                    )}
                  >
                    {delta === null
                      ? "–"
                      : `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${formatMetric(Math.abs(delta), 3, lang)}`}
                    {meta?.word ? (
                      <span className="fe-eval__word">{t(`delta.${meta.word}`)}</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="fe-table__foot-row">
              <td className="fe-table__td fe-table__td--sticky">
                {comparison.aggregate === "fraction"
                  ? t("aggregate.accuracy")
                  : t("aggregate.mean")}
              </td>
              <td className="fe-table__td" colSpan={2}>
                {t("aggregate.examplesChanged", {
                  count: comparison.examples.length,
                  changed: comparison.changed,
                })}
              </td>
              <td className="fe-table__td fe-table__td--num fe-num">
                {formatMetric(comparison.referenceAggregate, 3, lang)}
              </td>
              <td className="fe-table__td fe-table__td--num fe-num">
                {formatMetric(comparison.comparisonAggregate, 3, lang)}
              </td>
              <td className="fe-table__td fe-table__td--num fe-num fe-eval__delta">
                {aggregateDelta > 0 ? "+" : aggregateDelta < 0 ? "−" : "±"}
                {formatMetric(Math.abs(aggregateDelta), 3, lang)}
                {aggregateMeta.word ? (
                  <span className="fe-eval__word">{t(`delta.${aggregateMeta.word}`)}</span>
                ) : null}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
