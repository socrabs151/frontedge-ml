import clsx from "clsx";
import { formatDuration, toTime } from "../format";
import { useI18n } from "../i18n/I18nProvider";
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
 * The signature element of Frontedge: the stages of a run as a band over time.
 * Segment length is the duration of the stage, colour is the status of the stage.
 * A failure is shown with hatching, not with colour alone (WCAG 1.4.1).
 */
export function RunRibbon({
  stages,
  events = [],
  height = 6,
  showLabels = false,
  className,
}: RunRibbonProps) {
  const { lang } = useI18n();
  const measured = stages.filter((stage) => stage.endedAt !== null);
  const total = measured.reduce((sum, stage) => sum + (toTime(stage.endedAt!) - toTime(stage.startedAt)), 0);

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
          const duration = toTime(stage.endedAt!) - toTime(stage.startedAt);
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
              title={`${stage.name} · ${formatDuration(duration, lang)}`}
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
                {formatDuration(toTime(stage.endedAt ?? stage.startedAt) - toTime(stage.startedAt), lang)}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
