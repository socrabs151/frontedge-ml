/** Клавиатурный прогон таблицы (гейт качества §8.1 п.3). */
import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const BASE = process.env.FE_BASE_URL ?? "http://localhost:5173";
const problems = [];
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForSelector(".fe-table__row");

const focusedIndex = () =>
  page.evaluate(() => {
    const node = document.activeElement;
    if (!node || !node.hasAttribute?.("data-row-index")) return null;
    return Number(node.getAttribute("data-row-index"));
  });

await page.locator(".fe-table__row").first().focus();
const start = await focusedIndex();
if (start === null) problems.push("строка не получила фокус");

await page.keyboard.press("ArrowDown");
await wait(120);
const afterDown = await focusedIndex();
if (afterDown !== start + 1) problems.push(`ArrowDown: ожидали ${start + 1}, получили ${afterDown}`);

await page.keyboard.press("ArrowUp");
await wait(120);
const afterUp = await focusedIndex();
if (afterUp !== start) problems.push(`ArrowUp: ожидали ${start}, получили ${afterUp}`);

await page.keyboard.press("End");
await wait(200);
const afterEnd = await focusedIndex();
if (afterEnd === null || afterEnd < 100) problems.push(`End: не дошли в конец, получили ${afterEnd}`);

await page.keyboard.press("Home");
await wait(200);
const afterHome = await focusedIndex();
if (afterHome !== 0) problems.push(`Home: ожидали 0, получили ${afterHome}`);

await page.keyboard.press("PageDown");
await wait(200);
const afterPage = await focusedIndex();
if (afterPage === null || afterPage < 5) problems.push(`PageDown: ожидали прыжок, получили ${afterPage}`);

await page.keyboard.press("PageUp");
await wait(200);
const afterPageUp = await focusedIndex();
if (afterPageUp === null || afterPageUp > 5) {
  problems.push(`PageUp: ожидали возврат, получили ${afterPageUp}`);
}

// Кольцо фокуса видимо
const outline = await page.evaluate(() => {
  const node = document.querySelector(".fe-table__row");
  if (!node) return null;
  node.focus();
  const style = getComputedStyle(node);
  return { width: style.outlineWidth, style: style.outlineStyle };
});
if (!outline || outline.style === "none" || parseFloat(outline.width) < 2) {
  problems.push(`кольцо фокуса слабое: ${JSON.stringify(outline)}`);
}

// Enter открывает прогон
await page.keyboard.press("Enter");
await page.waitForSelector(".fe-detail__head", { timeout: 8000 }).catch(() => {
  problems.push("Enter не открыл прогон");
});

// Меню колонок: Escape закрывает
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForSelector(".fe-table__row");
await page.getByRole("button", { name: /Колонки/ }).click();
await page.waitForSelector(".fe-menu");
await page.keyboard.press("Escape");
await wait(300);
if ((await page.locator(".fe-menu").count()) > 0) problems.push("меню не закрылось по Escape");

// Сортировка доступна с клавиатуры
await page.getByRole("button", { name: /Accuracy/ }).focus();
await page.keyboard.press("Enter");
await wait(250);
const sorted = await page.evaluate(() => {
  const th = [...document.querySelectorAll("th")].find((node) =>
    node.textContent?.includes("Accuracy"),
  );
  return th?.getAttribute("aria-sort");
});
if (sorted !== "ascending" && sorted !== "descending") {
  problems.push(`aria-sort не обновился: ${sorted}`);
}

await browser.close();
console.log(
  problems.length === 0 ? "Клавиатура: все проверки пройдены." : `Проблемы:\n- ${problems.join("\n- ")}`,
);
process.exit(problems.length === 0 ? 0 : 1);
