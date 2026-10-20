import { formatDuration, formatRelativeTime } from "../format";
import type { LogLine } from "../types";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowDownToLine } from "lucide-react";

const LEVEL_LABEL: Record<LogLine["level"], string> = {
  info: "INFO",
  progress: "RUN",
  warning: "WARNING",
  error: "ERROR",
};

export function LogStream({
  lines,
  live = false,
  height = 320,
}: {
  lines: LogLine[];
  live?: boolean;
  height?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !pinned) return;
    node.scrollTop = node.scrollHeight;
  }, [lines, pinned]);

  const onScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 24;
    setPinned(atBottom);
  };

  const jumpToBottom = () => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
    setPinned(true);
  };

  return (
    <div className="fe-logs">
      <div className="fe-logs__bar">
        {live ? (
          <span className="fe-freshness fe-freshness--live">
            <span className="fe-freshness__dot" aria-hidden />
            live
          </span>
        ) : (
          <span className="fe-freshness">
            <span className="fe-freshness__dot" aria-hidden />
            поток закрыт
          </span>
        )}
        <span className="fe-logs__count num">{lines.length} строк</span>
        {!pinned ? (
          <button type="button" className="fe-logs__jump" onClick={jumpToBottom}>
            <ArrowDownToLine size={13} aria-hidden />
            Прокрутить вниз
          </button>
        ) : null}
      </div>
      <div
        className="fe-logs__scroll"
        ref={scrollRef}
        onScroll={onScroll}
        style={{ height }}
        role="log"
        aria-live="polite"
        aria-label="Логи прогона"
        tabIndex={0}
      >
        {lines.map((line) => (
          <div key={line.id} className={clsx("fe-logs__line", `fe-logs__line--${line.level}`)}>
            <span className="fe-logs__level">{LEVEL_LABEL[line.level]}</span>
            <span className="fe-logs__time num">
              {new Date(line.at).toLocaleTimeString("ru-RU", { hour12: false })}
            </span>
            <span className="fe-logs__text">{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function logTimestampLabel(at: number, now: number): string {
  return `${formatRelativeTime(at, now)} · ${formatDuration(Math.max(0, now - at))}`;
}
