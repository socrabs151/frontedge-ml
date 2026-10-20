/**
 * Контраст-тест токенов (гейт качества §8.1 п.1).
 * Читает packages/ui/src/styles/tokens.css и проверяет пары токенов по WCAG 2.2.
 *   1.4.3  текст ≥ 4.5:1
 *   1.4.11 нетекстовые элементы (границы полей, точки статуса, линии) ≥ 3:1
 *   1.4.1  цвет не единственный носитель смысла — проверяется ревью, не здесь
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const tokensPath = join(here, "..", "src", "styles", "tokens.css");
const css = readFileSync(tokensPath, "utf8");

function block(selector) {
  const index = css.indexOf(selector);
  if (index === -1) throw new Error(`Не найден блок ${selector}`);
  const start = css.indexOf("{", index);
  let depth = 0;
  for (let i = start; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start + 1, i);
    }
  }
  throw new Error(`Не закрыт блок ${selector}`);
}

function parseTokens(source) {
  const tokens = new Map();
  for (const match of source.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

function hexToRgb(value) {
  const hex = value.replace("#", "").trim();
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : hex;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function relativeLuminance(value) {
  const [r, g, b] = hexToRgb(value).map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

const themes = {
  light: parseTokens(block(":root")),
  dark: parseTokens(block('[data-theme="dark"]')),
};

/** [foreground, background, минимум, подпись] */
const checks = [
  ["text-primary", "surface", 4.5, "основной текст на карточке"],
  ["text-primary", "canvas", 4.5, "основной текст на фоне"],
  ["text-secondary", "surface", 4.5, "вторичный текст на карточке"],
  ["text-secondary", "canvas", 4.5, "вторичный текст на фоне"],
  ["text-tertiary", "surface", 4.5, "метаданные и заголовки колонок"],
  ["text-tertiary", "canvas", 4.5, "метаданные на фоне"],
  ["text-muted", "surface", 4.5, "плейсхолдеры и подписи"],
  ["accent", "surface", 4.5, "акцент как текст"],
  ["accent", "canvas", 4.5, "акцент на фоне"],
  ["accent-text", "accent", 4.5, "текст на акцентной кнопке"],
  ["status-success", "status-success-wash", 4.5, "статус «завершён»"],
  ["status-warning", "status-warning-wash", 4.5, "статус «внимание»"],
  ["status-danger", "status-danger-wash", 4.5, "статус «упал»"],
  ["status-neutral", "status-neutral-wash", 4.5, "статус «ожидает»"],
  ["status-running", "status-running-wash", 4.5, "статус «идёт»"],
  ["border-input", "surface", 3, "граница поля ввода (1.4.11)"],
  ["border-input", "surface-sunken", 3, "граница поля ввода на sunken"],
  ["data-ink", "surface", 3, "оси и сетка графика (1.4.11)"],
  ["accent", "surface", 3, "кольцо фокуса (2.4.13)"],
];

let failures = 0;
const rows = [];

for (const [theme, tokens] of Object.entries(themes)) {
  for (const [fgName, bgName, min, label] of checks) {
    const fg = tokens.get(fgName);
    const bg = tokens.get(bgName);
    if (!fg || !bg || !fg.startsWith("#") || !bg.startsWith("#")) {
      rows.push({ theme, label, fgName, bgName, ratio: null, min, status: "SKIP" });
      continue;
    }
    const ratio = contrast(fg, bg);
    const status = ratio >= min ? "OK" : "FAIL";
    if (status === "FAIL") failures += 1;
    rows.push({ theme, label, fgName, bgName, ratio, min, status });
  }
}

const width = Math.max(...rows.map((row) => row.label.length));
for (const row of rows) {
  const ratio = row.ratio === null ? "—" : `${row.ratio.toFixed(2)}:1`;
  const mark = row.status === "OK" ? "✓" : row.status === "FAIL" ? "✗" : "·";
  console.log(
    `${mark} [${row.theme.padEnd(5)}] ${row.label.padEnd(width)} ${ratio.padStart(8)} (нужно ${row.min}:1) ${row.fgName} / ${row.bgName}`,
  );
}

console.log(
  failures === 0
    ? `\nКонтраст: все ${rows.length} проверок пройдены.`
    : `\nКонтраст: провалено ${failures} проверок из ${rows.length}.`,
);

process.exit(failures === 0 ? 0 : 1);
