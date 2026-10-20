/**
 * Гейт качества Phase 1: скриншоты (светлая/тёмная, 1440 и 1280) + axe-аудит.
 * Запуск: node apps/spike/scripts/verify.mjs
 * Требует запущенного dev-сервера на http://localhost:5173
 */

import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";

const OUT = "C:\\Users\\socra\\AppData\\Local\\Temp\\opencode\\fe-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const BASE = process.env.FE_BASE_URL ?? "http://localhost:5173";

async function shoot(name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}\\${name}.png` });
  console.log(`скриншот: ${name}.png`);
}

async function audit(label) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  console.log(`axe [${label}]: нарушений всего ${results.violations.length}, critical/serious — ${serious.length}`);
  for (const violation of results.violations) {
    console.log(
      `  - (${violation.impact}) ${violation.id}: ${violation.help} [${violation.nodes.length} узлов]`,
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

// тёмная тема
await page.getByRole("button", { name: /тёмную тему/i }).click();
await page.waitForTimeout(250);
await shoot("02-runs-dark-1440");
seriousTotal += await audit("runs dark");

// обратно в светлую, открываем прогон
await page.getByRole("button", { name: /светлую тему/i }).click();
await page.waitForTimeout(200);
await page.locator(".fe-run-name").nth(3).click();
await page.waitForSelector(".fe-detail__head", { timeout: 15000 });
await shoot("03-run-detail-light-1440");
seriousTotal += await audit("run detail light");

await page.getByRole("button", { name: /тёмную тему/i }).click();
await page.waitForTimeout(250);
await shoot("04-run-detail-dark-1440");
seriousTotal += await audit("run detail dark");

// вкладки деталей
await page.getByRole("button", { name: /светлую тему/i }).click();
await page.getByRole("tab", { name: /Примеры/ }).click();
await shoot("05-run-examples-1440");
await page.getByRole("tab", { name: /Логи/ }).click();
await shoot("06-run-logs-1440");

// 1280
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForSelector(".fe-table__row");
await shoot("07-runs-light-1280");

await browser.close();
console.log(seriousTotal === 0 ? "\naxe: critical/serious нет." : `\naxe: critical/serious — ${seriousTotal}`);
