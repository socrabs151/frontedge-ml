import { useId } from "react";
import { useT } from "../i18n/I18nProvider";

export interface SparklineProps {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  /** The value that counts as good - drawn as a dashed line. */
  reference?: number;
  label?: string;
}

export function Sparkline({
  values,
  color = "currentColor",
  width = 56,
  height = 14,
  reference,
  label,
}: SparklineProps) {
  const t = useT();
  const gradientId = useId();
  if (values.length < 2) {
    return <span style={{ display: "inline-block", width, height }} aria-hidden />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 1.5;
  const usable = height - pad * 2;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * (width - pad * 2) + pad;
    const y = pad + usable - ((value - min) / span) * usable;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const referenceY =
    reference === undefined
      ? undefined
      : pad + usable - ((reference - min) / span) * usable;

  return (
    <svg
      className="fe-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? t("sparkline.default")}
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {referenceY !== undefined ? (
        <line
          x1={0}
          x2={width}
          y1={referenceY}
          y2={referenceY}
          stroke="var(--fe-data-ink)"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      ) : null}
      <polygon
        points={`${pad},${height} ${points.join(" ")} ${width - pad},${height}`}
        fill={`url(#${gradientId})`}
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={width - pad}
        cy={Number(points[points.length - 1]?.split(",")[1] ?? height / 2)}
        r={1.6}
        fill={color}
      />
    </svg>
  );
}
