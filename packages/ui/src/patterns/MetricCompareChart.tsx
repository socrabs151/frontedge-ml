import { useEffect, useMemo, useRef, useState } from "react";
import { formatMetric } from "../format";
import { useI18n } from "../i18n/I18nProvider";
import type { MetricPoint } from "../types";

export interface CompareSeries {
  id: string;
  name: string;
  color: string;
  points: MetricPoint[];
}

export interface MetricCompareChartProps {
  series: CompareSeries[];
  height?: number;
  label: string;
  digits?: number;
}

const M = { top: 10, right: 10, bottom: 22, left: 54 };

function niceTicks(min: number, max: number, count = 4): number[] {
  if (max === min) return [min];
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = (normalized >= 5 ? 10 : normalized >= 2 ? 5 : normalized >= 1 ? 2 : 1) * magnitude;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + step * 0.001; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
}

function nearest(points: MetricPoint[], step: number): MetricPoint | undefined {
  let found: MetricPoint | undefined;
  let distance = Infinity;
  for (const point of points) {
    const delta = Math.abs(point.step - step);
    if (delta < distance) {
      distance = delta;
      found = point;
    }
  }
  return found;
}

/**
 * Several runs on one metric, one shared axis.
 *
 * Position on a common axis is the comparison; the legend and the hover rows carry the run
 * names, so colour is never the only link between a line and its run.
 */
export function MetricCompareChart({
  series,
  height = 220,
  label,
  digits = 3,
}: MetricCompareChartProps) {
  const { t, lang } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverStep, setHoverStep] = useState<number | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(() => setWidth(host.clientWidth));
    observer.observe(host);
    setWidth(host.clientWidth);
    return () => observer.disconnect();
  }, []);

  const plotWidth = Math.max(0, width - M.left - M.right);
  const plotHeight = Math.max(0, height - M.top - M.bottom);
  const steps = useMemo(
    () => Array.from(new Set(series.flatMap((item) => item.points.map((point) => point.step)))).sort(
      (left, right) => left - right,
    ),
    [series],
  );

  const model = useMemo(() => {
    const values = series.flatMap((item) => item.points.map((point) => point.value));
    if (values.length === 0 || steps.length === 0) return null;
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      min -= 0.5;
      max += 0.5;
    }
    const pad = (max - min) * 0.12;
    min -= pad;
    max += pad;
    const xMin = steps[0] ?? 0;
    const xMax = steps[steps.length - 1] ?? 0;
    const span = xMax - xMin || 1;
    return {
      min,
      max,
      xMin,
      xMax,
      x: (step: number) => M.left + ((step - xMin) / span) * plotWidth,
      y: (value: number) => M.top + (1 - (value - min) / (max - min)) * plotHeight,
      yTicks: niceTicks(min, max, 4),
      xTicks: niceTicks(xMin, xMax, 5),
    };
  }, [plotWidth, plotHeight, series, steps]);

  if (!model || width === 0) {
    return (
      <div className="fe-chart">
        <div className="fe-chart__legend">
          <span className="fe-chart__title">{label}</span>
          {series.map((item) => (
            <span key={item.id} className="fe-chart__key">
              <span className="fe-chart__swatch" style={{ background: item.color }} aria-hidden />
              {item.name}
            </span>
          ))}
        </div>
        <div ref={hostRef} className="fe-chart__host" style={{ height }} />
      </div>
    );
  }

  const line = (points: MetricPoint[]) =>
    points
      .map((point) => `${model.x(point.step).toFixed(1)},${model.y(point.value).toFixed(1)}`)
      .join(" ");

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = event.clientX - rect.left;
    const stepAt = model.xMin + ((offset - M.left) / plotWidth) * (model.xMax - model.xMin);
    let closest = steps[0] ?? 0;
    let distance = Infinity;
    for (const step of steps) {
      const delta = Math.abs(step - stepAt);
      if (delta < distance) {
        distance = delta;
        closest = step;
      }
    }
    setHoverStep(closest);
  };

  const hoveredValues =
    hoverStep === null
      ? []
      : series
          .map((item) => ({ item, point: nearest(item.points, hoverStep) }))
          .filter((row): row is { item: CompareSeries; point: MetricPoint } => Boolean(row.point));

  return (
    <div className="fe-chart">
      <div className="fe-chart__legend">
        <span className="fe-chart__title">{label}</span>
        {series.map((item) => {
          const last = item.points[item.points.length - 1];
          return (
            <span key={item.id} className="fe-chart__key">
              <span className="fe-chart__swatch" style={{ background: item.color }} aria-hidden />
              {item.name}
              {last ? (
                <span className="fe-chart__value">{formatMetric(last.value, digits, lang)}</span>
              ) : null}
            </span>
          );
        })}
      </div>

      <div ref={hostRef} className="fe-chart__host" style={{ height }}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={t("compare.chartLabel", {
            label,
            runs: series.map((item) => item.name).join(", "),
          })}
          onMouseMove={onMove}
          onMouseLeave={() => setHoverStep(null)}
        >
          {model.yTicks.map((tick) => (
            <g key={`y-${tick}`}>
              <line
                x1={M.left}
                x2={M.left + plotWidth}
                y1={model.y(tick)}
                y2={model.y(tick)}
                stroke="var(--fe-data-ink-soft)"
                strokeWidth={1}
              />
              <text
                x={M.left - 8}
                y={model.y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fe-chart__label"
              >
                {formatMetric(tick, Math.min(digits, 2), lang)}
              </text>
            </g>
          ))}

          {model.xTicks.map((tick) => (
            <g key={`x-${tick}`}>
              <line
                x1={model.x(tick)}
                x2={model.x(tick)}
                y1={M.top}
                y2={M.top + plotHeight}
                stroke="var(--fe-data-ink-soft)"
                strokeWidth={1}
              />
              <text
                x={model.x(tick)}
                y={M.top + plotHeight + 15}
                textAnchor="middle"
                className="fe-chart__label"
              >
                {Math.round(tick)}
              </text>
            </g>
          ))}

          {series.map((item) => (
            <polyline
              key={item.id}
              points={line(item.points)}
              fill="none"
              stroke={item.color}
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {hoverStep !== null ? (
            <g>
              <line
                x1={model.x(hoverStep)}
                x2={model.x(hoverStep)}
                y1={M.top}
                y2={M.top + plotHeight}
                stroke="var(--fe-text-muted)"
                strokeWidth={1}
              />
              {hoveredValues.map(({ item, point }) => (
                <circle
                  key={item.id}
                  cx={model.x(point.step)}
                  cy={model.y(point.value)}
                  r={3}
                  fill={item.color}
                  stroke="var(--fe-surface)"
                  strokeWidth={1.5}
                />
              ))}
            </g>
          ) : null}
        </svg>

        {hoverStep !== null ? (
          <div
            className="fe-chart__tip"
            style={{
              left: Math.min(Math.max(model.x(hoverStep) + 10, 8), Math.max(8, width - 200)),
            }}
          >
            <div className="fe-chart__tip-step">step {Math.round(hoverStep)}</div>
            {hoveredValues.map(({ item, point }) => (
              <div key={item.id} className="fe-chart__tip-row">
                <span className="fe-chart__swatch" style={{ background: item.color }} aria-hidden />
                <span className="fe-chart__tip-name">{item.name}</span>
                {formatMetric(point.value, digits, lang)}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
