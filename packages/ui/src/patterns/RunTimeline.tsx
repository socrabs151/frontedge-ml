import clsx from "clsx";
import { formatDuration, toTime } from "../format";
import { statusMeta } from "../components/StatusBadge";
import { useT } from "../i18n/I18nProvider";
import type { RunStatus, Stage } from "../types";

const STATUS_COLOR: Record<RunStatus, string> = {
  queued: "var(--status-neutral)",
  running: "var(--status-running)",
  succeeded: "var(--status-success)",
  failed: "var(--status-danger)",
  cancelled: "var(--status-neutral)",
  lost: "var(--status-warning)",
};

export interface RunTimelineProps {
  stages: Stage[];
  /** Maximum width of the band: the timeline should not stretch across the screen. */
  maxWidth?: number;
  className?: string;
}

/**
 * The run timeline: stages as segments, labels aligned to the start of their own
 * segment. A failed stage is visible through hatching and a status label.
 */
export function RunTimeline({ stages, maxWidth = 960, className }: RunTimelineProps) {
  const t = useT();
  const measured = stages.filter((stage) => stage.endedAt !== null);
  const total = measured.reduce((sum, stage) => sum + (toTime(stage.endedAt!) - toTime(stage.startedAt)), 0);

  if (total <= 0) {
    return <p className="fe-note">The run has not started yet.</p>;
  }

  return (
    <div className={clsx("fe-timeline", className)} style={{ maxWidth }}>
      <div className="fe-timeline__bar">
        {measured.map((stage) => {
          const duration = toTime(stage.endedAt!) - toTime(stage.startedAt);
          const share = (duration / total) * 100;
          const failed = stage.status === "failed" || stage.status === "lost";
          const cancelled = stage.status === "cancelled";
          return (
            <div
              key={stage.name}
              className={clsx(
                "fe-timeline__seg",
                failed && "fe-timeline__seg--failed",
                cancelled && "fe-timeline__seg--cancelled",
              )}
              style={{
                width: `${share}%`,
                background: failed || cancelled ? "transparent" : STATUS_COLOR[stage.status],
                color: STATUS_COLOR[stage.status],
              }}
              title={`${stage.name} · ${formatDuration(duration)}`}
            />
          );
        })}
      </div>
      <div className="fe-timeline__labels">
        {measured.map((stage) => {
          const duration = toTime(stage.endedAt ?? stage.startedAt) - toTime(stage.startedAt);
          const share = (duration / total) * 100;
          const { key } = statusMeta(stage.status);
          return (
            <div key={stage.name} className="fe-timeline__label" style={{ width: `${share}%` }}>
              <span className="fe-timeline__name">{stage.name}</span>
              <span className="fe-timeline__time num">{formatDuration(duration)}</span>
              {stage.status !== "succeeded" ? (
                <span className="fe-timeline__status">{t(`status.${key}`)}</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
