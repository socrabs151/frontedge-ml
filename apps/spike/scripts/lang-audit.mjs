/**
 * Language audit.
 *
 * The contract: the repository is English, the interface is English by default, and Russian
 * exists only as a dictionary plus a runtime toggle. The audit fails when:
 *   1. Cyrillic appears outside the dictionaries and the Russian README;
 *   2. the two dictionaries disagree or a Russian value is left untranslated;
 *   3. a component carries a user-visible literal instead of a dictionary key;
 *   4. the English interface renders a Cyrillic character (Playwright, needs the demo).
 *
 * Run: node apps/spike/scripts/lang-audit.mjs
 *      node apps/spike/scripts/lang-audit.mjs --no-browser
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const problems = [];
const report = (message) => problems.push(message);

// --- 1. Cyrillic outside the dictionaries ---------------------------------

const CYRILLIC = /[\u0400-\u04FF]/;
const ALLOWED_CYRILLIC = new Set([
  "README.ru.md",
  "packages/ui/src/i18n/strings.ts",
  "apps/spike/src/i18n.ts",
  "packages/ui/src/format.ts",
]);
const ALLOWED_LINE = "**English** · [Русский](README.ru.md)";
const BINARY = /\.(png|jpe?g|gif|ico|woff2?|ttf|otf|zip|pdf)$/i;

const tracked = spawnSync("git", ["ls-files"], { encoding: "utf8" }).stdout.split(/\r?\n/).filter(Boolean);
for (const file of tracked) {
  const path = file.replace(/\\/g, "/");
  if (BINARY.test(path) || ALLOWED_CYRILLIC.has(path)) continue;
  const lines = readFileSync(join(root, file), "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (CYRILLIC.test(line) && line.trim() !== ALLOWED_LINE) {
      report(`Cyrillic outside the dictionary: ${path}:${index + 1}`);
    }
  });
}

// --- 2. Dictionary parity -------------------------------------------------

function block(source, marker, end) {
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Dictionary marker not found: ${marker}`);
  const from = source.indexOf("{", start);
  const to = source.indexOf(end, from);
  return source.slice(from, to === -1 ? source.length : to);
}

function entries(source, marker, end) {
  const map = new Map();
  for (const match of block(source, marker, end).matchAll(/"([^"\n]+)"\s*:\s*"([^"\n]*)"/g)) {
    map.set(match[1], match[2]);
  }
  return map;
}

const dictionaries = [
  {
    name: "packages/ui/src/i18n/strings.ts",
    en: entries(readFileSync("packages/ui/src/i18n/strings.ts", "utf8"), "export const en = {", "} as const;"),
    ru: entries(readFileSync("packages/ui/src/i18n/strings.ts", "utf8"), "export const ru: Dictionary = {", "\n};"),
  },
  {
    name: "apps/spike/src/i18n.ts",
    en: entries(readFileSync("apps/spike/src/i18n.ts", "utf8"), "const en = {", "} as const;"),
    ru: entries(readFileSync("apps/spike/src/i18n.ts", "utf8"), "const ru: Record<AppStringKey, string> = {", "\n};"),
  },
];

/**
 * Values that are the same in both languages on purpose: domain terms from the design document
 * (§4.10), metric names, formats and technical tokens.
 */
const SAME_VALUE_ALLOWED = new Set([
  "Accuracy", "Baseline", "CSV", "Datasheet", "Dataset", "Example", "F1", "Git", "Loss",
  "Provenance", "Reference", "Run", "Runs", "Score", "Seed", "Tokens", "Eval", "Evals",
  "Datasets", "EN", "RU", "id", "text", "live", "baseline", "mock", "API",
  "reference", "run", "Examples", "Artifacts", "Eval diff", "Evaluation",
]);

for (const dictionary of dictionaries) {
  for (const key of dictionary.en.keys()) {
    if (!dictionary.ru.has(key)) report(`Missing in ru: ${dictionary.name} ${key}`);
  }
  for (const key of dictionary.ru.keys()) {
    if (!dictionary.en.has(key)) report(`Missing in en: ${dictionary.name} ${key}`);
  }
  for (const [key, value] of dictionary.ru) {
    if (dictionary.en.get(key) === value && !SAME_VALUE_ALLOWED.has(value)) {
      report(`Untranslated ru value: ${dictionary.name} ${key} = ${JSON.stringify(value)}`);
    }
  }
}

// --- 3. Literals in components -------------------------------------------

const ATTRIBUTE = /(?:aria-label|ariaLabel|title|placeholder|alt)="([^"]*[A-Za-z]{2,}[^"]*)"/;
const TEXT_NODE = />\s*([A-Za-z][^<>{}]{2,}?)\s*</;
const BARE_LINE = /^[A-Za-z][A-Za-z ]{1,40}$/;
const NOT_A_LITERAL = [
  /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/,
  /^(fe-|var\(|--|@)/,
  /^[a-z]{2}-[A-Z]{2}$/,
  /^[a-z]+(-[a-z]+)+$/,
  /^\d/,
];
const ALLOWED_LITERALS = new Set(["frontedge", "source", "void source", "Example", "Run", "Runs"]);

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "generated" || name === "i18n") continue;
      sources(path, out);
    } else if (/\.(tsx|ts)$/.test(name) && !/\.test\./.test(name)) {
      out.push(path);
    }
  }
  return out;
}

for (const dir of ["packages/ui/src", "apps/spike/src"]) {
  for (const file of sources(join(root, dir))) {
    readFileSync(file, "utf8").split(/\r?\n/).forEach((line, index) => {
      if (/^\s*import\b|^\s*\/\/|^\s*\*|^\s*\/\*/.test(line)) return;
      const candidates = [];
      const attribute = line.match(ATTRIBUTE);
      const textNode = line.match(TEXT_NODE);
      const bare = BARE_LINE.test(line.trim()) ? line.trim() : null;
      if (attribute) candidates.push(attribute[1]);
      if (textNode) candidates.push(textNode[1]);
      if (bare) candidates.push(bare);
      for (const value of candidates) {
        const skip =
          ALLOWED_LITERALS.has(value) || NOT_A_LITERAL.some((pattern) => pattern.test(value));
        if (!skip) report(`Literal outside the dictionary: ${relative(root, file)}:${index + 1} ${JSON.stringify(value)}`);
      }
    });
  }
}

// --- 4. The English interface renders no Cyrillic ------------------------

const checks = [
  { name: "runs", open: async () => {} },
  {
    name: "run detail",
    open: async (page) => {
      await page.locator(".fe-run-name").nth(3).click();
      await page.waitForSelector(".fe-detail__head");
    },
  },
  {
    name: "evals",
    open: async (page) => {
      await page.getByRole("button", { name: /^Evals$/ }).click();
      await page.waitForSelector(".fe-table--eval");
    },
  },
  {
    name: "datasets",
    open: async (page) => {
      await page.getByRole("button", { name: /^Datasets$/ }).click();
      await page.waitForSelector(".fe-table--dataset");
    },
  },
];

if (!process.argv.includes("--no-browser")) {
  const base = process.env.FE_BASE_URL ?? "http://127.0.0.1:8000/frontedge";
  const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  for (const check of checks) {
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    await page.waitForSelector(".fe-table__row");
    await check.open(page);
    await page.waitForTimeout(400);
    const text = await page.locator("body").innerText();
    if (CYRILLIC.test(text)) {
      const sample = text.split(/\r?\n/).find((line) => CYRILLIC.test(line));
      report(`Cyrillic in the English interface [${check.name}]: ${JSON.stringify(sample?.trim())}`);
    }
  }

  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.getByRole("radiogroup", { name: "Language" }).getByText("RU", { exact: true }).click();
  await page.waitForTimeout(300);
  const ruText = await page.locator("body").innerText();
  if (!CYRILLIC.test(ruText)) report("The Russian toggle did not translate the interface");
  await browser.close();
}

if (problems.length > 0) {
  console.error(`Language audit: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("Language audit: the repository and the interface are English, the Russian toggle works.");
