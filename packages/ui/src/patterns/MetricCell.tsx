import clsx from "clsx";
import { Sparkline } from "../components/Sparkline";
import { formatDelta, formatMetric } from "../format";
import type { MetricDirection } from "../types";

export interface MetricCellProps {
  value: number | undefined;
  baseline?: number;
  direction?: MetricDirection;
  series?: number[];
  color?: string;
  digits?: number;
  /** Показывать спарклайн в строке. */
  withSparkline?: boolean;
  /** Слово «лучше/хуже» в плотной таблице прячем: направление живёт в заголовке колонки. */
  showWord?: boolean;
  label?: string;
  baselineLabel?: string;
}

export function describeDelta(
  delta: number,
  direction: MetricDirection,
): { sign: "↑" | "↓" | "±"; word?: string } {
  if (delta === 0) return { sign: "±" };
  const sign = delta > 0 ? "↑" : "↓";
  if (direction === "none") return { sign };
  const better = direction === "maximize" ? delta > 0 : delta < 0;
  return { sign, word: better ? "лучше" : "хуже" };
}

export function MetricCell({
  value,
  baseline,
  direction = "none",
  series,
  color = "var(--data-series-1)",
  digits = 3,
  withSparkline = true,
  showWord = false,
  label,
  baselineLabel = "Baseline",
}: MetricCellProps) {
  const hasBaseline = baseline !== undefined && Number.isFinite(baseline);
  const delta = hasBaseline && value !== undefined ? value - baseline : undefined;
  const deltaMeta = delta !== undefined ? describeDelta(delta, direction) : undefined;

  return (
    <span className="fe-metric">
      <span className="fe-metric__value num">{formatMetric(value, digits)}</span>
      {delta !== undefined && deltaMeta ? (
        <span
          className="fe-metric__delta num"
          title={`${delta > 0 ? "+" : "−"}${formatMetric(Math.abs(delta), digits)} к ${baselineLabel}`}
        >
          <span aria-hidden>{deltaMeta.sign}</span>
          {formatDelta(delta, digits)}
          {deltaMeta.word && showWord ? (
            <span className="fe-metric__word">{deltaMeta.word}</span>
          ) : null}
        </span>
      ) : null}
      {withSparkline && series && series.length > 1 ? (
        <Sparkline
          values={series}
          color={color}
          width={34}
          height={14}
          label={label ? `${label}: динамика` : "Динамика метрики"}
        />
      ) : null}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  baseline,
  direction = "none",
  series,
  color = "var(--data-series-1)",
  digits = 3,
  baselineLabel = "Baseline",
}: {
  label: string;
  value: number | undefined;
  baseline?: number;
  direction?: MetricDirection;
  series?: number[];
  color?: string;
  digits?: number;
  baselineLabel?: string;
}) {
  const hasBaseline = baseline !== undefined && Number.isFinite(baseline);
  const delta = hasBaseline && value !== undefined ? value - baseline : undefined;
  const deltaMeta = delta !== undefined ? describeDelta(delta, direction) : undefined;

  return (
    <div className="fe-metric-card">
      <div className="fe-metric-card__label">{label}</div>
      <div className="fe-metric-card__row">
        <span className="fe-metric-card__value num">{formatMetric(value, digits)}</span>
        {series && series.length > 1 ? (
          <Sparkline values={series} color={color} width={96} height={22} label={`${label}: динамика`} />
        ) : null}
      </div>
      {delta !== undefined && deltaMeta ? (
        <div className="fe-metric-card__delta num">
          <span aria-hidden>{deltaMeta.sign}</span>
          {formatDelta(delta, digits)}
          {deltaMeta.word ? <span className="fe-metric-card__word">{deltaMeta.word}</span> : null}
          <span className="fe-metric-card__baseline">к {baselineLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

export function metricToneClass(direction: MetricDirection, delta: number): string {
  if (direction === "none" || delta === 0) return "";
  const better = direction === "maximize" ? delta > 0 : delta < 0;
  return better ? "fe-metric--better" : "fe-metric--worse";
}

export const metricCellClass = clsx;
