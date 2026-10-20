import clsx from "clsx";
import { formatDuration } from "../format";
import type { MetricEvent, RunStatus, Stage } from "../types";

const STATUS_COLOR: Record<RunStatus, string> = {
  queued: "var(--status-neutral)",
  running: "var(--status-running)",
  succeeded: "var(--status-success)",
  failed: "var(--status-danger)",
  cancelled: "var(--status-neutral)",
  lost: "var(--status-warning)",
};

export interface RunRibbonProps {
  stages: Stage[];
  events?: MetricEvent[];
  height?: number;
  showLabels?: boolean;
  className?: string;
}

/**
 * Signature-элемент Frontedge: полоса стадий прогона по времени.
 * Длина сегмента = длительность стадии, цвет = статус стадии.
 * Провал показан штриховкой, а не только цветом (WCAG 1.4.1).
 */
export function RunRibbon({
  stages,
  events = [],
  height = 6,
  showLabels = false,
  className,
}: RunRibbonProps) {
  const measured = stages.filter((stage) => stage.endedAt !== null);
  const total = measured.reduce((sum, stage) => sum + (stage.endedAt! - stage.startedAt), 0);

  if (total <= 0) {
    return (
      <div className={clsx("fe-ribbon", "fe-ribbon--empty", className)} aria-hidden>
        <div className="fe-ribbon__bar" style={{ height }} />
      </div>
    );
  }

  return (
    <div className={clsx("fe-ribbon", className)}>
      <div className="fe-ribbon__bar" style={{ height }}>
        {measured.map((stage) => {
          const duration = stage.endedAt! - stage.startedAt;
          const share = (duration / total) * 100;
          const stageEvents = events.filter((event) => event.stage === stage.name);
          const failed = stage.status === "failed" || stage.status === "lost";
          const cancelled = stage.status === "cancelled";

          return (
            <div
              key={stage.name}
              className={clsx(
                "fe-ribbon__seg",
                failed && "fe-ribbon__seg--failed",
                cancelled && "fe-ribbon__seg--cancelled",
              )}
              style={{
                width: `${share}%`,
                background: failed || cancelled ? "transparent" : STATUS_COLOR[stage.status],
                color: STATUS_COLOR[stage.status],
              }}
              title={`${stage.name} · ${formatDuration(duration)}`}
            >
              {stageEvents.map((event) => (
                <span
                  key={`${stage.name}-${event.step}-${event.label}`}
                  className={clsx(
                    "fe-ribbon__event",
                    event.kind === "regression" && "fe-ribbon__event--regression",
                    event.kind === "checkpoint" && "fe-ribbon__event--checkpoint",
                  )}
                  title={event.label}
                />
              ))}
            </div>
          );
        })}
      </div>
      {showLabels ? (
        <div className="fe-ribbon__labels">
          {measured.map((stage) => (
            <span key={stage.name} className="fe-ribbon__label">
              {stage.name}
              <span className="fe-ribbon__label-time num">
                {formatDuration((stage.endedAt ?? stage.startedAt) - stage.startedAt)}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
