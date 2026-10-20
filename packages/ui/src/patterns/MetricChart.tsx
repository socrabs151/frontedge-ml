import { useEffect, useMemo, useRef, useState } from "react";
import { formatMetric } from "../format";
import type { MetricPoint } from "../types";

export interface MetricChartProps {
  series: MetricPoint[];
  baselineSeries?: MetricPoint[];
  /** Дополнительные тонкие ряды (другие сиды/фолды). */
  extraSeries?: MetricPoint[][];
  height?: number;
  color?: string;
  baselineColor?: string;
  label: string;
  /** Формат значения в подсказке. */
  digits?: number;
}

const NO_EXTRA: MetricPoint[][] = [];

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

/**
 * График метрики по шагам. Свой SVG вместо библиотеки:
 * - нет chartjunk: только оси, сетка и линии;
 * - общая ось для сравнения (правило Кливленда–Макгилла: позиция читается точнее цвета);
 * - baseline — пунктиром и другим весом, а не цветом;
 * - подсказка по наведению: значение текущего прогона и baseline на том же шаге.
 */
export function MetricChart({
  series,
  baselineSeries,
  extraSeries = NO_EXTRA,
  height = 220,
  color = "var(--data-series-1)",
  baselineColor = "var(--text-secondary)",
  label,
  digits = 3,
}: MetricChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

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

  const model = useMemo(() => {
    const all = [
      ...series.map((point) => point.value),
      ...(baselineSeries ?? []).map((point) => point.value),
      ...extraSeries.flatMap((extra) => extra.map((point) => point.value)),
    ];
    if (all.length === 0) return null;

    let min = Math.min(...all);
    let max = Math.max(...all);
    if (min === max) {
      min -= 0.5;
      max += 0.5;
    }
    const pad = (max - min) * 0.12;
    min -= pad;
    max += pad;

    const steps = series.map((point) => point.step);
    const xMin = Math.min(...steps);
    const xMax = Math.max(...steps);
    const xSpan = xMax - xMin || 1;

    const x = (step: number) => M.left + ((step - xMin) / xSpan) * plotWidth;
    const y = (value: number) => M.top + (1 - (value - min) / (max - min)) * plotHeight;

    return {
      min,
      max,
      xMin,
      xMax,
      x,
      y,
      yTicks: niceTicks(min, max, 4),
      xTicks: niceTicks(xMin, xMax, 5),
    };
  }, [series, baselineSeries, extraSeries, plotWidth, plotHeight]);

  if (!model || width === 0) {
    return (
      <div className="fe-chart">
        <div className="fe-chart__legend">
          <span className="fe-chart__key">
            <span className="fe-chart__swatch" style={{ background: color }} aria-hidden />
            {label}
          </span>
        </div>
        <div ref={hostRef} className="fe-chart__host" style={{ height }} />
      </div>
    );
  }

  const line = (points: MetricPoint[]) =>
    points.map((point) => `${model.x(point.step).toFixed(1)},${model.y(point.value).toFixed(1)}`).join(" ");

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = event.clientX - rect.left;
    const steps = series.map((point) => point.step);
    const stepAt = model.xMin + ((offset - M.left) / plotWidth) * (model.xMax - model.xMin);
    let closest = 0;
    let distance = Infinity;
    steps.forEach((step, index) => {
      const delta = Math.abs(step - stepAt);
      if (delta < distance) {
        distance = delta;
        closest = index;
      }
    });
    setHoverIndex(closest);
  };

  const hovered = hoverIndex !== null ? series[hoverIndex] : undefined;
  const hoveredBaseline =
    hoverIndex !== null && baselineSeries
      ? baselineSeries.find((point) => point.step === hovered?.step)
      : undefined;

  return (
    <div className="fe-chart">
      <div className="fe-chart__legend">
        <span className="fe-chart__key">
          <span className="fe-chart__swatch" style={{ background: color }} aria-hidden />
          {label}
        </span>
        {extraSeries.length > 0 ? (
          <span className="fe-chart__key">
            <span className="fe-chart__swatch fe-chart__swatch--muted" aria-hidden />
            другие сиды
          </span>
        ) : null}
        {baselineSeries && baselineSeries.length > 1 ? (
          <span className="fe-chart__key">
            <span className="fe-chart__swatch fe-chart__swatch--dashed" aria-hidden />
            baseline
          </span>
        ) : null}
      </div>

      <div ref={hostRef} className="fe-chart__host" style={{ height }}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${label}: график по шагам`}
          onMouseMove={onMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {model.yTicks.map((tick) => (
            <g key={`y-${tick}`}>
              <line
                x1={M.left}
                x2={M.left + plotWidth}
                y1={model.y(tick)}
                y2={model.y(tick)}
                stroke="var(--data-ink-soft)"
                strokeWidth={1}
              />
              <text
                x={M.left - 8}
                y={model.y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fe-chart__label"
              >
                {formatMetric(tick, 2)}
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
                stroke="var(--data-ink-soft)"
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

          {extraSeries.map((extra, index) => (
            <polyline
              key={`extra-${index}`}
              points={line(extra)}
              fill="none"
              stroke="var(--data-ink)"
              strokeWidth={1}
              opacity={0.5}
            />
          ))}

          {baselineSeries && baselineSeries.length > 1 ? (
            <polyline
              points={line(baselineSeries)}
              fill="none"
              stroke={baselineColor}
              strokeWidth={1.75}
              strokeDasharray="4 3"
              strokeLinejoin="round"
            />
          ) : null}

          <polyline
            points={line(series)}
            fill="none"
            stroke={color}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {hovered ? (
            <g>
              <line
                x1={model.x(hovered.step)}
                x2={model.x(hovered.step)}
                y1={M.top}
                y2={M.top + plotHeight}
                stroke="var(--text-muted)"
                strokeWidth={1}
              />
              <circle
                cx={model.x(hovered.step)}
                cy={model.y(hovered.value)}
                r={3}
                fill={color}
                stroke="var(--surface)"
                strokeWidth={1.5}
              />
              {hoveredBaseline ? (
                <circle
                  cx={model.x(hoveredBaseline.step)}
                  cy={model.y(hoveredBaseline.value)}
                  r={3}
                  fill="var(--surface)"
                  stroke={baselineColor}
                  strokeWidth={1.5}
                />
              ) : null}
            </g>
          ) : null}
        </svg>

        {hovered ? (
          <div
            className="fe-chart__tip"
            style={{
              left: Math.min(
                Math.max(model.x(hovered.step) + 10, 8),
                Math.max(8, width - 168),
              ),
            }}
          >
            <div className="fe-chart__tip-step">шаг {Math.round(hovered.step)}</div>
            <div className="fe-chart__tip-row">
              <span className="fe-chart__swatch" style={{ background: color }} aria-hidden />
              {formatMetric(hovered.value, digits)}
            </div>
            {hoveredBaseline ? (
              <div className="fe-chart__tip-row">
                <span className="fe-chart__swatch fe-chart__swatch--dashed" aria-hidden />
                {formatMetric(hoveredBaseline.value, digits)}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
