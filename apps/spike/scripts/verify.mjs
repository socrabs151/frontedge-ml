/**
 * Phase 1 quality gate: screenshots (light/dark, 1440 and 1280) + an axe audit.
 * Run: node apps/spike/scripts/verify.mjs
 * Needs a dev server at http://localhost:5173
 */

import { chromium, firefox, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = process.env.FE_SHOTS_DIR ?? join(tmpdir(), "frontedge-shots");
mkdirSync(OUT, { recursive: true });

/** FE_BROWSER=firefox|webkit runs the same gate on another engine; Edge is the local default. */
const engine = process.env.FE_BROWSER ?? "chromium";
const browser =
  engine === "firefox"
    ? await firefox.launch()
    : engine === "webkit"
      ? await webkit.launch()
      : await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
console.log(`browser: ${engine}`);
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const BASE = process.env.FE_BASE_URL ?? "http://localhost:5173";

async function shoot(name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}\\${name}.png` });
  console.log(`screenshot: ${name}.png`);
}

async function audit(label, target = page) {
  const results = await new AxeBuilder({ page: target }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  console.log(`axe [${label}]: ${results.violations.length} violations, ${serious.length} critical/serious`);
  for (const violation of results.violations) {
    console.log(
      `  - (${violation.impact}) ${violation.id}: ${violation.help} [${violation.nodes.length} nodes]`,
    );
    for (const node of violation.nodes.slice(0, 3)) {
      console.log(`      ${node.target.join(" ")}`);
    }
  }
  return serious.length;
}

/** Sparklines in one column share a baseline, and no metric cell overflows its column. */
async function checkMetricCells() {
  const result = await page.evaluate(() => {
    const groups = new Map();
    let clipped = 0;
    let wideDelta = null;
    for (const row of document.querySelectorAll(".fe-table__row")) {
      [...row.querySelectorAll("td")].forEach((cell, index) => {
        const spark = cell.querySelector(".fe-metric__spark");
        if (spark) {
          if (!groups.has(index)) groups.set(index, []);
          groups.get(index).push(spark.getBoundingClientRect().right);
        }
        const delta = cell.querySelector(".fe-metric__delta");
        if (delta && delta.getBoundingClientRect().width > 56) {
          wideDelta = `${delta.textContent?.trim()} (${Math.round(delta.getBoundingClientRect().width)}px)`;
        }
        if (cell.querySelector(".fe-metric") && cell.scrollWidth > cell.clientWidth + 1) {
          clipped += 1;
        }
      });
    }
    const misaligned = [...groups.entries()]
      .filter(([, rights]) => rights.length > 1)
      .map(([index, rights]) => ({
        column: index,
        spread: Math.round((Math.max(...rights) - Math.min(...rights)) * 10) / 10,
      }))
      .filter((entry) => entry.spread > 1);
    return { misaligned, clipped, wideDelta };
  });
  const problems = result.misaligned.length + result.clipped + (result.wideDelta ? 1 : 0);
  console.log(
    problems === 0
      ? "metric cells: sparklines aligned, no clipping, deltas fit"
      : `metric cells: ${result.misaligned.length} misaligned column(s), ${result.clipped} clipped cell(s), ${result.wideDelta ? "a wide delta" : "no wide delta"}`,
  );
  for (const entry of result.misaligned) {
    console.log(`  - column ${entry.column}: sparklines differ by ${entry.spread}px`);
  }
  if (result.wideDelta) console.log(`  - delta wider than its track: ${result.wideDelta}`);
  return problems;
}

/** Resize a column from the keyboard and put it back through the Columns menu. */
async function checkColumnReset() {
  const header = page.locator(".fe-table__th", { hasText: /^Run$/ }).first();
  const width = () => header.evaluate((node) => Math.round(node.getBoundingClientRect().width));
  const before = await width();
  await header.locator(".fe-table__resizer").focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);
  const resized = await width();

  await page.getByRole("button", { name: /Columns/ }).click();
  const reset = page.getByRole("menuitem", { name: "Reset column widths" });
  const offered = (await reset.count()) > 0;
  if (offered) await reset.click();
  await page.waitForTimeout(200);
  const after = await width();

  const ok = resized > before && offered && after === before;
  console.log(
    ok
      ? "column widths: resize and reset"
      : `column widths: before=${before} resized=${resized} after=${after} offered=${offered}`,
  );
  return ok ? 0 : 1;
}

let seriousTotal = 0;
/** A run is linkable: the hash changes on open and the same link survives a reload. */
async function checkDeepLink() {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".fe-table__row");
  await page.locator(".fe-run-name").first().click();
  await page.waitForSelector(".fe-detail__head", { timeout: 15000 });
  const opened = await page.evaluate(() => location.hash);

  await page.reload({ waitUntil: "networkidle" });
  const survived = (await page.locator(".fe-detail__head").count()) === 1;
  const afterReload = await page.evaluate(() => location.hash);

  const ok = opened.startsWith("#/runs/") && survived && afterReload === opened;
  console.log(
    ok
      ? "routing: a run is linkable and survives a reload"
      : `routing: opened=${opened} afterReload=${afterReload} survived=${survived}`,
  );
  return ok ? 0 : 1;
}

/** The run pickers search through the compact endpoint; axe visits the open panel too. */
async function checkPicker() {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".fe-table__row");
  const trigger = page.locator(".fe-runpicker__trigger").first();
  await trigger.click();
  await page.waitForSelector(".fe-runpicker", { timeout: 5000 });
  const search = page.getByRole("combobox").first();
  await search.fill("exp-18");
  await page.waitForTimeout(500);
  const options = await page.getByRole("option").count();
  const problems = await audit("run picker", page);
  await search.press("Enter");
  await page.waitForTimeout(300);
  const chosen = (await trigger.textContent())?.trim() ?? "";
  const ok = options > 0 && chosen.includes("exp-18");
  console.log(
    ok
      ? `picker: searched ${options} option(s), selected ${chosen}`
      : `picker: options=${options} chosen=${chosen}`,
  );
  return problems + (ok ? 0 : 1);
}

/** Loading, empty and error are states too: every one must pass axe. */
async function auditStates() {
  const statePage = await context.newPage();
  const pattern = "**/api/runs*";
  let problems = 0;

  await statePage.route(pattern, (route) => route.abort());
  await statePage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await statePage.waitForSelector(".fe-panel", { timeout: 15000 });
  problems += await audit("error state", statePage);
  await statePage.unroute(pattern);

  await statePage.route(pattern, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Frontedge-Total": "0" },
      body: "[]",
    }),
  );
  await statePage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await statePage.waitForSelector(".fe-panel", { timeout: 15000 });
  problems += await audit("empty state", statePage);
  await statePage.unroute(pattern);

  await statePage.route(pattern, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  });
  await statePage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await statePage.waitForSelector(".fe-skeleton", { timeout: 10000 });
  problems += await audit("loading state", statePage);
  await statePage.close();
  return problems;
}

let layoutProblems = 0;

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForSelector(".fe-table__row");
await shoot("01-runs-light-1440");
seriousTotal += await audit("runs light");
layoutProblems += await checkMetricCells();
layoutProblems += await checkColumnReset();

// dark theme
await page.getByRole("button", { name: /dark theme/i }).click();
await page.waitForTimeout(250);
await shoot("02-runs-dark-1440");
seriousTotal += await audit("runs dark");

// back to light, open a run
await page.getByRole("button", { name: /light theme/i }).click();
await page.waitForTimeout(200);
await page.locator(".fe-run-name").nth(3).click();
await page.waitForSelector(".fe-detail__head", { timeout: 15000 });
await shoot("03-run-detail-light-1440");
seriousTotal += await audit("run detail light");

await page.getByRole("button", { name: /dark theme/i }).click();
await page.waitForTimeout(250);
await shoot("04-run-detail-dark-1440");
seriousTotal += await audit("run detail dark");

// detail tabs
await page.getByRole("button", { name: /light theme/i }).click();
await page.getByRole("tab", { name: /Examples/ }).click();
await shoot("05-run-examples-1440");
await page.getByRole("tab", { name: /Logs/ }).click();
await shoot("06-run-logs-1440");

// 1280
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForSelector(".fe-table__row");
await shoot("07-runs-light-1280");

layoutProblems += await checkDeepLink();
seriousTotal += await checkPicker();
seriousTotal += await auditStates();

await browser.close();
console.log(
  seriousTotal === 0
    ? "\naxe: no critical/serious."
    : `\naxe: ${seriousTotal} critical/serious`,
);
if (layoutProblems > 0) console.log(`layout: ${layoutProblems} problem(s)`);
process.exit(seriousTotal === 0 && layoutProblems === 0 ? 0 : 1);
