/** Keyboard pass over the table (quality gate §8.1, item 3). */
import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
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
if (start === null) problems.push("the row did not take focus");

await page.keyboard.press("ArrowDown");
await wait(120);
const afterDown = await focusedIndex();
if (afterDown !== start + 1) problems.push(`ArrowDown: expected ${start + 1}, got ${afterDown}`);

await page.keyboard.press("ArrowUp");
await wait(120);
const afterUp = await focusedIndex();
if (afterUp !== start) problems.push(`ArrowUp: expected ${start}, got ${afterUp}`);

await page.keyboard.press("End");
await wait(200);
const afterEnd = await focusedIndex();
// The list is paginated (50 by default), so "the end" is the end of the page, not of the project.
if (afterEnd === null || afterEnd < 40) problems.push(`End: did not reach the end, got ${afterEnd}`);

await page.keyboard.press("Home");
await wait(200);
const afterHome = await focusedIndex();
if (afterHome !== 0) problems.push(`Home: expected 0, got ${afterHome}`);

await page.keyboard.press("PageDown");
await wait(200);
const afterPage = await focusedIndex();
if (afterPage === null || afterPage < 5) problems.push(`PageDown: expected a jump, got ${afterPage}`);

await page.keyboard.press("PageUp");
await wait(200);
const afterPageUp = await focusedIndex();
if (afterPageUp === null || afterPageUp > 5) {
  problems.push(`PageUp: expected a return, got ${afterPageUp}`);
}

// The focus ring is visible
const outline = await page.evaluate(() => {
  const node = document.querySelector(".fe-table__row");
  if (!node) return null;
  node.focus();
  const style = getComputedStyle(node);
  return { width: style.outlineWidth, style: style.outlineStyle };
});
if (!outline || outline.style === "none" || parseFloat(outline.width) < 2) {
  problems.push(`the focus ring is weak: ${JSON.stringify(outline)}`);
}

// Enter opens a run
await page.keyboard.press("Enter");
await page.waitForSelector(".fe-detail__head", { timeout: 8000 }).catch(() => {
  problems.push("Enter did not open a run");
});

// The columns menu: Escape closes it
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForSelector(".fe-table__row");
await page.getByRole("button", { name: /Columns/ }).click();
await page.waitForSelector(".fe-menu");
await page.keyboard.press("Escape");
await wait(300);
if ((await page.locator(".fe-menu").count()) > 0) problems.push("the menu did not close on Escape");

// Sorting is reachable from the keyboard
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
  problems.push(`aria-sort did not update: ${sorted}`);
}

await browser.close();
console.log(
  problems.length === 0 ? "Keyboard: all checks passed." : `Problems:\n- ${problems.join("\n- ")}`,
);
process.exit(problems.length === 0 ? 0 : 1);
