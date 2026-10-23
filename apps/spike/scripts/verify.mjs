/**
 * Phase 1 quality gate: screenshots (light/dark, 1440 and 1280) + an axe audit.
 * Run: node apps/spike/scripts/verify.mjs
 * Needs a dev server at http://localhost:5173
 */

import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = process.env.FE_SHOTS_DIR ?? join(tmpdir(), "frontedge-shots");
mkdirSync(OUT, { recursive: true });

/** Edge is installed on the developer machine; CI uses the bundled Chromium. */
const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const BASE = process.env.FE_BASE_URL ?? "http://localhost:5173";

async function shoot(name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}\\${name}.png` });
  console.log(`screenshot: ${name}.png`);
}

async function audit(label) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
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

let seriousTotal = 0;

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForSelector(".fe-table__row");
await shoot("01-runs-light-1440");
seriousTotal += await audit("runs light");

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

await browser.close();
console.log(seriousTotal === 0 ? "\naxe: no critical/serious." : `\naxe: ${seriousTotal} critical/serious`);
process.exit(seriousTotal === 0 ? 0 : 1);
