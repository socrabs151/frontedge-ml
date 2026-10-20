/** Скриншоты и axe-аудит экранов Phase 3 (Eval diff, Dataset) на собранном демо. */
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.FE_BASE_URL ?? "http://127.0.0.1:8000/frontedge";
const OUT = "C:\\Users\\socra\\AppData\\Local\\Temp\\opencode\\fe-shots";

const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 300));
});

async function shoot(name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}\\${name}.png` });
  console.log(`скриншот: ${name}.png`);
}

async function audit(label) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  console.log(`axe [${label}]: нарушений ${results.violations.length}, critical/serious ${serious.length}`);
  for (const violation of results.violations) {
    console.log(`  - (${violation.impact}) ${violation.id}: ${violation.help} [${violation.nodes.length}]`);
    for (const node of violation.nodes.slice(0, 3)) console.log(`      ${node.target.join(" ")}`);
  }
  return serious.length;
}

let serious = 0;

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForSelector(".fe-table__row");

// --- Evals ---
await page.getByRole("button", { name: /^Evals$/ }).click();
await page.waitForSelector(".fe-table--eval", { timeout: 15000 });
await shoot("20-evals-light-1440");
serious += await audit("eval diff light");

// только различия
await page.getByLabel("Только различия").check();
await shoot("21-evals-only-diff-1440");
await page.getByLabel("Только различия").uncheck();

// формат числа: процент
await page.getByRole("radio", { name: "73%" }).click();
await page.waitForTimeout(250);
await shoot("22-evals-percent-1440");
await page.getByRole("radio", { name: "0.73" }).click();

await page.getByRole("button", { name: /тёмную тему/i }).click();
await page.waitForTimeout(250);
await shoot("23-evals-dark-1440");
serious += await audit("eval diff dark");
await page.getByRole("button", { name: /светлую тему/i }).click();

// --- Datasets ---
await page.getByRole("button", { name: /^Datasets$/ }).click();
await page.waitForSelector(".fe-datasets", { timeout: 15000 });
await page.waitForSelector(".fe-table--dataset", { timeout: 15000 });
await shoot("24-datasets-light-1440");
serious += await audit("datasets light");

await page.getByRole("tab", { name: /Datasheet/ }).click();
await shoot("25-datasets-datasheet-1440");
await page.getByRole("tab", { name: /Провенанс/ }).click();
await shoot("26-datasets-provenance-1440");

await browser.close();
console.log(
  errors.length === 0
    ? "ошибок в консоли нет"
    : `ошибки:\n- ${errors.join("\n- ")}`,
);
console.log(serious === 0 ? "axe: critical/serious нет" : `axe: critical/serious — ${serious}`);
