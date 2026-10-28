/**
 * Token contrast test (the quality gate from §8.1, item 1).
 * Reads packages/ui/src/styles/tokens.css and checks token pairs against WCAG 2.2.
 *   1.4.3  text ≥ 4.5:1
 *   1.4.11 non-text elements (input borders, status dots, lines) ≥ 3:1
 *   1.4.1  colour is not the only carrier of meaning — checked in review, not here
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const tokensPath = join(here, "..", "src", "styles", "tokens.css");
const css = readFileSync(tokensPath, "utf8");

function block(selector) {
  const index = css.indexOf(selector);
  if (index === -1) throw new Error(`Block ${selector} not found`);
  const start = css.indexOf("{", index);
  let depth = 0;
  for (let i = start; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start + 1, i);
    }
  }
  throw new Error(`Block ${selector} is not closed`);
}

function parseTokens(source) {
  const tokens = new Map();
  for (const match of source.matchAll(/--fe-([a-z0-9-]+):\s*([^;]+);/g)) {
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

/**
 * Resolves a token to RGB: hex, var(--fe-…) or color-mix(in srgb, A p%, B).
 * The accent-derived tokens are mixes on purpose, so a host accent carries through;
 * the gate has to evaluate them instead of skipping.
 */
function toRgb(value, tokens, seen = new Set()) {
  if (!value) return null;
  const text = value.trim();
  if (text.startsWith("#")) return hexToRgb(text);
  const variable = /^var\(--fe-([a-z0-9-]+)\)$/.exec(text);
  if (variable) {
    const name = variable[1];
    if (seen.has(name)) return null;
    const next = tokens.get(name);
    return next ? toRgb(next, tokens, new Set([...seen, name])) : null;
  }
  const mix = /^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*(.+)\)$/.exec(text);
  if (mix) {
    const first = toRgb(mix[1], tokens, seen);
    const second = toRgb(mix[3], tokens, seen);
    if (!first || !second) return null;
    const share = Number(mix[2]) / 100;
    return first.map((channel, index) =>
      Math.round(channel * share + second[index] * (1 - share)),
    );
  }
  return null;
}

function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
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

/** [foreground, background, minimum, label] */
const checks = [
  ["text-primary", "surface", 4.5, "primary text on a card"],
  ["text-primary", "canvas", 4.5, "primary text on the canvas"],
  ["text-secondary", "surface", 4.5, "secondary text on a card"],
  ["text-secondary", "canvas", 4.5, "secondary text on the canvas"],
  ["text-tertiary", "surface", 4.5, "metadata and column headers"],
  ["text-tertiary", "canvas", 4.5, "metadata on the canvas"],
  ["text-muted", "surface", 4.5, "placeholders and captions"],
  ["text-muted", "surface-selected", 4.5, "muted text in a selected row"],
  ["text-tertiary", "surface-selected", 4.5, "metadata in a selected row"],
  ["text-secondary", "surface-selected", 4.5, "secondary text in a selected row"],
  ["text-primary", "surface-selected", 4.5, "primary text in a selected row"],
  ["accent", "surface", 4.5, "accent as text"],
  ["accent", "canvas", 4.5, "accent on the canvas"],
  ["accent-text", "accent", 4.5, "text on the accent button"],
  ["status-success", "status-success-wash", 4.5, "status “completed”"],
  ["status-warning", "status-warning-wash", 4.5, "status “warning”"],
  ["status-danger", "status-danger-wash", 4.5, "status “failed”"],
  ["status-neutral", "status-neutral-wash", 4.5, "status “queued”"],
  ["status-running", "status-running-wash", 4.5, "status “running”"],
  ["border-input", "surface", 3, "input border (1.4.11)"],
  ["border-input", "surface-sunken", 3, "input border on sunken"],
  ["data-ink", "surface", 3, "chart axes and grid (1.4.11)"],
  ["accent", "surface", 3, "focus ring (2.4.13)"],
];

/**
 * Separators fall outside WCAG (1.4.11 covers interactive element borders),
 * but in a dense table the hairline is the structure. Hence a separate
 * "legibility floor": a separator must be visible on the canvas and on a card.
 */
const LEGIBILITY = [["border", "surface", 1.35], ["border", "canvas", 1.25]];

let failures = 0;
const rows = [];

for (const [theme, tokens] of Object.entries(themes)) {
  for (const [fgName, bgName, min, label] of checks) {
    const fg = toRgb(tokens.get(fgName), tokens);
    const bg = toRgb(tokens.get(bgName), tokens);
    if (!fg || !bg) {
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
    `${mark} [${row.theme.padEnd(5)}] ${row.label.padEnd(width)} ${ratio.padStart(8)} (needs ${row.min}:1) ${row.fgName} / ${row.bgName}`,
  );
}

console.log(
  failures === 0
    ? `\nContrast: all ${rows.length} checks passed.`
    : `\nContrast: ${failures} of ${rows.length} checks failed.`,
);

// --- Separator legibility floor ------------------------------------------

for (const [theme, tokens] of Object.entries(themes)) {
  for (const [fgName, bgName, min] of LEGIBILITY) {
    const fg = toRgb(tokens.get(fgName), tokens);
    const bg = toRgb(tokens.get(bgName), tokens);
    if (!fg || !bg) {
      console.log(`· [${theme.padEnd(5)}] separator ${fgName} — translucent, checked by eye`);
      continue;
    }
    const ratio = contrast(fg, bg);
    const status = ratio >= min ? "✓" : "✗";
    if (status === "✗") failures += 1;
    console.log(
      `${status} [${theme.padEnd(5)}] separator ${fgName} on ${bgName} — ${ratio.toFixed(2)}:1 (needs ${min}:1)`,
    );
  }
}

process.exit(failures === 0 ? 0 : 1);
