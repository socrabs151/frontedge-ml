/** Value formatting. One rule set: numbers are tabular, empty is an en dash, time is relative first. */

import type { Lang } from "./i18n/I18nProvider";

export const EMPTY = "–";

function localeOf(lang: Lang): string {
  return lang === "ru" ? "ru-RU" : "en-US";
}

/** An ISO string from the API → milliseconds. Dates arrive from Python as ISO 8601. */
export function toTime(value: string | number): number {
  return typeof value === "number" ? value : new Date(value).getTime();
}

export function formatMetric(
  value: number | undefined | null,
  digits = 3,
  lang: Lang = "en",
): string {
  if (value === undefined || value === null || Number.isNaN(value)) return EMPTY;
  const abs = Math.abs(value);
  if (abs >= 100000) {
    return value.toLocaleString(localeOf(lang), { maximumFractionDigits: 0 });
  }
  if (abs !== 0 && abs < 0.001) {
    return value.toExponential(2);
  }
  return value.toFixed(digits);
}

export function formatDelta(value: number, digits = 3, lang: Lang = "en"): string {
  if (value === 0) return "±0";
  const sign = value > 0 ? "+" : "−";
  return `${sign}${formatMetric(Math.abs(value), digits, lang)}`;
}

export function formatDuration(ms: number, lang: Lang = "en"): string {
  if (!Number.isFinite(ms) || ms < 0) return EMPTY;
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const [h, m, s] = lang === "ru" ? ["ч", "м", "с"] : ["h", "m", "s"];
  if (hours > 0) return `${hours}${h} ${String(minutes).padStart(2, "0")}${m}`;
  if (minutes > 0) return `${minutes}${m} ${String(seconds).padStart(2, "0")}${s}`;
  return `${seconds}${s}`;
}

export function formatRelativeTime(timestamp: number, now: number, lang: Lang = "en"): string {
  const diff = now - timestamp;
  if (diff < 45_000) return lang === "ru" ? "только что" : "just now";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return lang === "ru" ? `${minutes} мин назад` : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return lang === "ru" ? `${hours} ч назад` : `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return lang === "ru" ? `${days} дн назад` : `${days} d ago`;
  return new Date(timestamp).toLocaleDateString(localeOf(lang));
}

export function formatAbsoluteTime(timestamp: number, lang: Lang = "en"): string {
  return new Date(timestamp).toLocaleString(localeOf(lang), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBytes(bytes: number, lang: Lang = "en"): string {
  const units = lang === "ru" ? ["Б", "КБ", "МБ", "ГБ", "ТБ"] : ["B", "KB", "MB", "GB", "TB"];
  if (bytes < 1024) return `${bytes} ${units[0]}`;
  let value = bytes / 1024;
  let unitIndex = 1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}
