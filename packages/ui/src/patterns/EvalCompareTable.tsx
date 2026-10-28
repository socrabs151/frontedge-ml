import clsx from "clsx";
import { useMemo, useState } from "react";
import { EMPTY, formatMetric } from "../format";
import { useI18n, type Lang } from "../i18n/I18nProvider";
import { describeDelta } from "./MetricCell";
import type { EvalComparison, ExampleResult, MetricDirection } from "../types";

export type DeltaFormat = "value" | "percent" | "relative";
export type EvalFilter = "all" | "changed" | "improved" | "worsened";

export function formatScore(
  value: number | null | undefined,
  format: DeltaFormat,
  reference?: number | null,
  lang: Lang = "en",
): string {
  if (value === null || value === undefined) return EMPTY;
  if (format === "percent") {
    const percent = value * (Math.abs(value) <= 1.5 ? 100 : 1);
    return `${formatMetric(percent, 1, lang)}%`;
  }
  if (format === "relative") {
    if (reference === null || reference === undefined || reference === 0) return EMPTY;
    return `×${formatMetric(value / reference, 3, lang)}`;
  }
  return formatMetric(value, 3, lang);
}

function deltaOf(example: ExampleResult): number | null {
  const before = example.referenceScore;
  const after = example.comparisonScore;
  if (before === null || before === undefined || after === null || after === undefined) {
    return null;
  }
  return after - before;
}

function isImproved(delta: number | null, direction: MetricDirection): boolean {
  if (delta === null || delta === 0 || direction === "none") return false;
  return direction === "maximize" ? delta > 0 : delta < 0;
}

function isWorsened(delta: number | null, direction: MetricDirection): boolean {
  if (delta === null || delta === 0 || direction === "none") return false;
  return direction === "maximize" ? delta < 0 : delta > 0;
}

export interface EvalCompareTableProps {
  comparison: EvalComparison;
  filter?: EvalFilter;
  /** Kept for callers that only need the changed rows; ``filter`` is the full form. */
  onlyDiff?: boolean;
  format?: DeltaFormat;
  /** A bounded scroll area; the footer stays visible for a long comparison. */
  height?: number | string;
}

/**
 * Two runs compared over one evaluation.
 *
 * Evidence is a column, not a tooltip: input, expected answer, both run outputs, both scores and
 * the delta. A missing value is an en dash, an empty string is a word, and a long answer is a
 * native disclosure. The delta column sorts by the number, never by the formatted text.
 */
export function EvalCompareTable({
  comparison,
  filter,
  onlyDiff = false,
  format = "value",
  height,
}: EvalCompareTableProps) {
  const { t, lang } = useI18n();
  const direction: MetricDirection = comparison.direction;
  const activeFilter: EvalFilter = filter ?? (onlyDiff ? "changed" : "all");
  const [deltaOrder, setDeltaOrder] = useState<"asc" | "desc" | null>(null);

  const rows = useMemo(() => {
    const filtered = comparison.examples.filter((example) => {
      const delta = deltaOf(example);
      if (activeFilter === "changed") return example.changed;
      if (activeFilter === "improved") return isImproved(delta, direction);
      if (activeFilter === "worsened") return isWorsened(delta, direction);
      return true;
    });
    if (deltaOrder === null) return filtered;
    return filtered
      .map((example, index) => ({ example, index, delta: deltaOf(example) }))
      .sort((left, right) => {
        if (left.delta === null && right.delta === null) return left.index - right.index;
        if (left.delta === null) return 1;
        if (right.delta === null) return -1;
        if (left.delta === right.delta) return left.index - right.index;
        return deltaOrder === "asc" ? left.delta - right.delta : right.delta - left.delta;
      })
      .map((item) => item.example);
  }, [activeFilter, comparison.examples, deltaOrder, direction]);

  const aggregateDelta = comparison.comparisonAggregate - comparison.referenceAggregate;
  const aggregateMeta = describeDelta(aggregateDelta, direction);

  const evidence = (value: string | null | undefined) => {
    if (value === null || value === undefined) {
      return <span className="fe-eval__missing">{EMPTY}</span>;
    }
    if (value === "") {
      return <span className="fe-eval__missing">{t("eval.emptyValue")}</span>;
    }
    if (value.length > 160) {
      return (
        <details className="fe-eval__evidence">
          <summary>{value.slice(0, 160)}…</summary>
          <span>{value}</span>
        </details>
      );
    }
    return <span>{value}</span>;
  };

  return (
    <div className={clsx("fe-table fe-table--eval", height !== undefined && "fe-table--bounded")}>
      <div
        className="fe-table__scroll"
        role="region"
        aria-label={t("eval.tableLabel")}
        tabIndex={0}
        style={height === undefined ? undefined : { height }}
      >
        <table className="fe-table__table">
          <caption className="sr-only">{t("eval.tableLabel")}</caption>
          <colgroup>
            <col style={{ width: "88px" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "12%" }} />
          </colgroup>
          <thead>
            <tr className="fe-table__group-row">
              <th
                scope="col"
                rowSpan={2}
                className="fe-table__th fe-table__th--sticky fe-table__th--group"
              >
                {t("column.example")}
              </th>
              <th scope="colgroup" colSpan={2} className="fe-table__th fe-table__th--group">
                {t("column.inputs")}
              </th>
              <th scope="colgroup" colSpan={2} className="fe-table__th fe-table__th--group">
                {t("column.outputs")}
              </th>
              <th
                scope="colgroup"
                colSpan={3}
                className="fe-table__th fe-table__th--group fe-table__th--scores"
              >
                {t("column.scores")}
              </th>
            </tr>
            <tr>
              <th scope="col" className="fe-table__th">
                {t("column.input")}
              </th>
              <th scope="col" className="fe-table__th">
                {t("column.expected")}
              </th>
              <th scope="col" className="fe-table__th">
                {t("column.reference")}
              </th>
              <th scope="col" className="fe-table__th">
                {t("column.run")}
              </th>
              <th scope="col" className="fe-table__th fe-table__th--num">
                {t("column.reference")}
              </th>
              <th scope="col" className="fe-table__th fe-table__th--num">
                {t("column.run")}
              </th>
              <th
                scope="col"
                className="fe-table__th fe-table__th--num"
                aria-sort={
                  deltaOrder === "asc"
                    ? "ascending"
                    : deltaOrder === "desc"
                      ? "descending"
                      : "none"
                }
              >
                <button
                  type="button"
                  className="fe-eval__sort"
                  onClick={() =>
                    setDeltaOrder((current) => (current === "asc" ? "desc" : "asc"))
                  }
                >
                  Δ{" "}
                  <span aria-hidden>
                    {deltaOrder === "asc" ? "↑" : deltaOrder === "desc" ? "↓" : "↕"}
                  </span>
                  <span className="sr-only">{t("eval.sortByDelta")}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="fe-table__td fe-table__td--empty">
                  {activeFilter === "all" ? t("empty.noRows") : t("empty.noDifferences")}
                </td>
              </tr>
            ) : null}
            {rows.map((example) => {
              const reference = example.referenceScore;
              const comparisonScore = example.comparisonScore;
              const delta = deltaOf(example);
              const meta = delta === null ? null : describeDelta(delta, direction);
              return (
                <tr key={example.id} className="fe-table__row">
                  <td className="fe-table__td fe-table__td--sticky">
                    <span className="fe-eval__id fe-mono">{example.id}</span>
                    {delta !== null && delta !== 0 ? (
                      <span
                        className="fe-eval__changed"
                        title={t("eval.scoredDifferently")}
                        aria-label={t("eval.scoredDifferently")}
                      >
                        {delta > 0 ? "↑" : "↓"}
                      </span>
                    ) : null}
                  </td>
                  <td className="fe-table__td fe-table__td--evidence">
                    {evidence(example.input)}
                  </td>
                  <td className="fe-table__td fe-table__td--evidence">
                    {evidence(example.expected)}
                  </td>
                  <td className="fe-table__td fe-table__td--evidence">
                    {evidence(example.referenceOutput)}
                  </td>
                  <td className="fe-table__td fe-table__td--evidence">
                    {evidence(example.comparisonOutput ?? example.output)}
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
                      ? EMPTY
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
              <td className="fe-table__td" colSpan={4}>
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
