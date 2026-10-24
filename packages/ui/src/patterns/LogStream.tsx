import { ArrowDownToLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/I18nProvider";
import type { LogLine } from "../types";

const LEVEL_LABEL: Record<string, string> = {
  info: "INFO",
  progress: "RUN",
  warning: "WARNING",
  error: "ERROR",
};

/** A project may log its own levels: keep the class name safe and show the raw level. */
const levelClass = (level: string) => level.replace(/[^a-z0-9-]/gi, "").toLowerCase();
const levelLabel = (level: string) => LEVEL_LABEL[level] ?? level.toUpperCase();

/** Live log stream: severity as a text prefix, tail follow, and a way back to the bottom. */
export function LogStream({
  lines,
  live = false,
  height = 320,
}: {
  lines: LogLine[];
  live?: boolean;
  height?: number;
}) {
  const t = useT();
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
            {t("log.live")}
          </span>
        ) : (
          <span className="fe-freshness">
            <span className="fe-freshness__dot" aria-hidden />
            {t("log.streamClosed")}
          </span>
        )}
        <span className="fe-logs__count fe-num">
          {lines.length} {t("log.lines")}
        </span>
        {!pinned ? (
          <button type="button" className="fe-logs__jump" onClick={jumpToBottom}>
            <ArrowDownToLine size={13} aria-hidden />
            {t("log.scrollToBottom")}
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
        aria-label={t("log.runLogs")}
        tabIndex={0}
      >
        {lines.length === 0 ? (
          <p className="fe-note fe-note--inline">{t("log.streamClosed")}</p>
        ) : null}
        {lines.map((line) => (
          <div key={line.id} className={`fe-logs__line fe-logs__line--${levelClass(line.level)}`}>
            <span className="fe-logs__level">{levelLabel(line.level)}</span>
            <span className="fe-logs__time fe-num">
              {new Date(line.at).toLocaleTimeString("en-GB", { hour12: false })}
            </span>
            <span className="fe-logs__text">{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
