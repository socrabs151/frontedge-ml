import { Sparkline } from "../components/Sparkline";
import { formatDelta, formatMetric } from "../format";
import { useI18n } from "../i18n/I18nProvider";
import type { MetricDirection } from "../types";

export interface MetricCellProps {
  value: number | undefined;
  baseline?: number;
  direction?: MetricDirection;
  series?: number[];
  color?: string;
  digits?: number;
  /** Show the sparkline inside the cell. */
  withSparkline?: boolean;
  /** Show the word "better"/"worse". Hidden in dense tables, where the column header carries the direction. */
  showWord?: boolean;
  label?: string;
  baselineLabel?: string;
}

export function describeDelta(
  delta: number,
  direction: MetricDirection,
): { sign: "↑" | "↓" | "±"; word?: "better" | "worse" } {
  if (delta === 0) return { sign: "±" };
  const sign = delta > 0 ? "↑" : "↓";
  if (direction === "none") return { sign };
  const better = direction === "maximize" ? delta > 0 : delta < 0;
  return { sign, word: better ? "better" : "worse" };
}

export function MetricCell({
  value,
  baseline,
  direction = "none",
  series,
  color = "var(--fe-data-series-1)",
  digits = 3,
  withSparkline = true,
  showWord = false,
  label,
  baselineLabel,
}: MetricCellProps) {
  const { t, lang } = useI18n();
  const baselineText = baselineLabel ?? t("tag.baseline");
  const hasBaseline = baseline !== undefined && Number.isFinite(baseline);
  const delta = hasBaseline && value !== undefined ? value - baseline : undefined;
  const deltaMeta = delta !== undefined ? describeDelta(delta, direction) : undefined;
  const deltaText = delta !== undefined ? formatDelta(delta, digits, lang) : "";
  // A change below the shown precision has no direction: "↑ ±0" contradicts itself.
  const negligible = deltaText === "±0" || deltaText.startsWith("<");
  const hasSpark = Boolean(withSparkline && series && series.length > 1);

  return (
    <span className={`fe-metric${hasSpark ? "" : " fe-metric--no-spark"}`}>
      <span className="fe-metric__value fe-num">{formatMetric(value, digits, lang)}</span>
      {delta !== undefined && deltaMeta ? (
        <span
          className="fe-metric__delta fe-num"
          title={`${delta > 0 ? "+" : "−"}${formatMetric(Math.abs(delta), digits, lang)} ${t("delta.toBaseline", { baseline: baselineText })}`}
        >
          {negligible ? null : <span aria-hidden>{deltaMeta.sign}</span>}
          {deltaText}
          {!negligible && deltaMeta.word && showWord ? (
            <span className="fe-metric__word">{t(`delta.${deltaMeta.word}`)}</span>
          ) : null}
        </span>
      ) : null}
      {hasSpark ? (
        // Pinned to the right edge: the sparklines of a column must share one baseline, and the
        // delta before them has a fixed width, so the values line up too.
        <span className="fe-metric__spark" aria-hidden>
          <Sparkline
            values={series ?? []}
            color={color}
            width={24}
            height={14}
            label={t("metric.dynamics", { label: label ?? "" })}
          />
        </span>
      ) : null}
    </span>
  );
}

export interface MetricCardProps {
  label: string;
  value: number | undefined;
  baseline?: number;
  direction?: MetricDirection;
  series?: number[];
  color?: string;
  digits?: number;
  baselineLabel?: string;
}

export function MetricCard({
  label,
  value,
  baseline,
  direction = "none",
  series,
  color = "var(--fe-data-series-1)",
  digits = 3,
  baselineLabel,
}: MetricCardProps) {
  const { t, lang } = useI18n();
  const baselineText = baselineLabel ?? t("tag.baseline");
  const hasBaseline = baseline !== undefined && Number.isFinite(baseline);
  const delta = hasBaseline && value !== undefined ? value - baseline : undefined;
  const deltaMeta = delta !== undefined ? describeDelta(delta, direction) : undefined;
  const deltaText = delta !== undefined ? formatDelta(delta, digits, lang) : "";
  const negligible = deltaText === "±0" || deltaText.startsWith("<");

  return (
    <div className="fe-metric-card">
      <div className="fe-metric-card__label">{label}</div>
      <div className="fe-metric-card__row">
        <span className="fe-metric-card__value fe-num">{formatMetric(value, digits, lang)}</span>
        {series && series.length > 1 ? (
          <Sparkline
            values={series}
            color={color}
            width={96}
            height={22}
            label={t("metric.dynamics", { label })}
          />
        ) : null}
      </div>
      {delta !== undefined && deltaMeta ? (
        <div className="fe-metric-card__delta fe-num">
          {negligible ? null : <span aria-hidden>{deltaMeta.sign}</span>}
          {deltaText}
          {!negligible && deltaMeta.word ? (
            <span className="fe-metric-card__word">{t(`delta.${deltaMeta.word}`)}</span>
          ) : null}
          <span className="fe-metric-card__baseline">{t("delta.toBaseline", { baseline: baselineText })}</span>
        </div>
      ) : null}
    </div>
  );
}
