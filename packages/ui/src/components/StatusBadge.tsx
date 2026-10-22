import clsx from "clsx";
import { Ban, CheckCircle2, CircleDashed, Loader, TriangleAlert, XCircle } from "lucide-react";
import type { RunStatus } from "../types";
import { useT } from "../i18n/I18nProvider";

type Tone = "success" | "warning" | "danger" | "neutral" | "running";

const STATUS: Record<RunStatus, { key: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "lost"; tone: Tone; Icon: typeof CheckCircle2 }> = {
  queued: { key: "queued", tone: "neutral", Icon: CircleDashed },
  running: { key: "running", tone: "running", Icon: Loader },
  succeeded: { key: "succeeded", tone: "success", Icon: CheckCircle2 },
  failed: { key: "failed", tone: "danger", Icon: XCircle },
  cancelled: { key: "cancelled", tone: "neutral", Icon: Ban },
  lost: { key: "lost", tone: "warning", Icon: TriangleAlert },
};

export function statusMeta(status: RunStatus) {
  return STATUS[status];
}

export function StatusBadge({
  status,
  className,
}: {
  status: RunStatus;
  className?: string;
}) {
  const t = useT();
  const { key, tone, Icon } = STATUS[status];
  return (
    <span className={clsx("fe-status", `fe-status--${tone}`, className)}>
      <Icon className="fe-status__icon" size={13} strokeWidth={2.25} aria-hidden />
      {t(`status.${key}`)}
    </span>
  );
}
