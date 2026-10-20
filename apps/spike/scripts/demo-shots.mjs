/** Скриншоты демо, собранного FastAPI (реальный API, а не мок). */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:8000/frontedge";
const OUT = "C:\\Users\\socra\\AppData\\Local\\Temp\\opencode\\fe-shots";

const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 300));
});

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForSelector(".fe-table__row", { timeout: 15000 });
await page.screenshot({ path: `${OUT}\\10-demo-runs.png` });
console.log("скриншот: 10-demo-runs.png");

const source = await page.locator(".sidebar__note").textContent();
console.log("источник данных:", source?.trim());

await page.locator(".fe-run-name").nth(3).click();
await page.waitForSelector(".fe-detail__head", { timeout: 15000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}\\11-demo-run-detail.png` });
console.log("скриншот: 11-demo-run-detail.png");

await page.getByRole("tab", { name: /Логи/ }).click();
await page.waitForTimeout(2500);
const logLines = await page.locator(".fe-logs__line").count();
console.log("строк лога по SSE:", logLines);
await page.screenshot({ path: `${OUT}\\12-demo-logs.png` });

await browser.close();
console.log(errors.length === 0 ? "ошибок в консоли нет" : `ошибки:\n- ${errors.join("\n- ")}`);
