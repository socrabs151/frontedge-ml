/** Форматирование значений. Единые правила: числа — табличные, пустое — тире, время — относительное вторично. */

export const EMPTY = "–";

/** ISO-строка из API → миллисекунды. Даты приходят из Python как ISO 8601. */
export function toTime(value: string | number): number {
  return typeof value === "number" ? value : new Date(value).getTime();
}

export function formatMetric(value: number | undefined | null, digits = 3): string {
  if (value === undefined || value === null || Number.isNaN(value)) return EMPTY;
  const abs = Math.abs(value);
  if (abs >= 100000) {
    return value.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  }
  if (abs !== 0 && abs < 0.001) {
    return value.toExponential(2);
  }
  return value.toFixed(digits);
}

export function formatDelta(value: number, digits = 3): string {
  if (value === 0) return "±0";
  const sign = value > 0 ? "+" : "−";
  return `${sign}${formatMetric(Math.abs(value), digits)}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return EMPTY;
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}ч ${String(minutes).padStart(2, "0")}м`;
  if (minutes > 0) return `${minutes}м ${String(seconds).padStart(2, "0")}с`;
  return `${seconds}с`;
}

export function formatRelativeTime(timestamp: number, now: number): string {
  const diff = now - timestamp;
  if (diff < 45_000) return "только что";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} дн назад`;
  return new Date(timestamp).toLocaleDateString("ru-RU");
}

export function formatAbsoluteTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ["КБ", "МБ", "ГБ", "ТБ"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}
