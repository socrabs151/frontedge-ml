import clsx from "clsx";
import { Ban, CheckCircle2, CircleDashed, Loader, TriangleAlert, XCircle } from "lucide-react";
import type { RunStatus } from "../types";

type Tone = "success" | "warning" | "danger" | "neutral" | "running";

const STATUS: Record<RunStatus, { label: string; tone: Tone; Icon: typeof CheckCircle2 }> = {
  queued: { label: "В очереди", tone: "neutral", Icon: CircleDashed },
  running: { label: "Идёт", tone: "running", Icon: Loader },
  succeeded: { label: "Завершён", tone: "success", Icon: CheckCircle2 },
  failed: { label: "Упал", tone: "danger", Icon: XCircle },
  cancelled: { label: "Отменён", tone: "neutral", Icon: Ban },
  lost: { label: "Потерян", tone: "warning", Icon: TriangleAlert },
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
  const { label, tone, Icon } = STATUS[status];
  return (
    <span className={clsx("fe-status", `fe-status--${tone}`, className)}>
      <Icon className="fe-status__icon" size={13} strokeWidth={2.25} aria-hidden />
      {label}
    </span>
  );
}
