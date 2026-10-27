/**
 * Eval scale check: render a synthetic comparison of FE_EVAL_SCALE rows (default 1000)
 * through the real screen and measure the first render, the scroll and the sticky footer.
 *
 * Run with the demo on FE_BASE_URL (default http://127.0.0.1:8000/frontedge):
 *   node apps/spike/scripts/eval-scale.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.FE_BASE_URL ?? "http://127.0.0.1:8000/frontedge";
const COUNT = Number(process.env.FE_EVAL_SCALE ?? 1000);
const BUDGET_MS = Number(process.env.FE_EVAL_BUDGET_MS ?? 3000);

const examples = Array.from({ length: COUNT }, (_, index) => {
  const changed = index % 7 === 0;
  return {
    id: `ex-${String(index).padStart(4, "0")}`,
    input: `Question ${index}: what is the answer?`,
    output: `candidate answer ${index}${changed ? " (incomplete)" : ""}`,
    expected: `gold answer ${index}`,
    referenceOutput: `reference answer ${index}`,
    comparisonOutput: `candidate answer ${index}${changed ? " (incomplete)" : ""}`,
    referenceScore: changed ? 0.4 : 0.8,
    comparisonScore: changed ? 0.2 : 0.9,
    changed,
  };
});

const comparison = {
  evalId: "eval-scale",
  name: "scale",
  dataset: "demo",
  scorer: "exact",
  metric: "accuracy",
  direction: "maximize",
  aggregate: "mean",
  referenceRun: "reference",
  comparisonRun: "candidate",
  referenceName: "reference",
  comparisonName: "candidate",
  examples,
  referenceAggregate: 0.78,
  comparisonAggregate: 0.85,
  changed: examples.filter((example) => example.changed).length,
};

const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
await page.route("**/api/evals/*/compare**", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(comparison),
  }),
);

const started = Date.now();
await page.goto(`${BASE}/#/evals`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".fe-table--eval", { timeout: 15000 });
await page.waitForSelector(".fe-table__row", { timeout: 15000 });
const renderMs = Date.now() - started;
const info = await page.evaluate(() => {
  const scroll = document.querySelector(".fe-table--eval .fe-table__scroll");
  const footer = document.querySelector(".fe-table__foot-row");
  return {
    rows: document.querySelectorAll(".fe-table--eval .fe-table__row").length,
    scrollHeight: scroll?.scrollHeight ?? 0,
    clientHeight: scroll?.clientHeight ?? 0,
    scrollWidth: scroll?.scrollWidth ?? 0,
    clientWidth: scroll?.clientWidth ?? 0,
    bodyHeight: document.documentElement.scrollHeight,
    footerVisible: footer ? footer.getBoundingClientRect().bottom <= innerHeight + 1 : false,
  };
});
await browser.close();

const problems = [];
if (info.rows !== COUNT) problems.push(`rendered ${info.rows} rows, expected ${COUNT}`);
if (renderMs > BUDGET_MS) problems.push(`first render ${renderMs} ms, budget ${BUDGET_MS} ms`);
if (!info.footerVisible) problems.push("the sticky footer is not visible");
if (info.bodyHeight > 902) problems.push(`the document scrolls (height ${info.bodyHeight})`);
if (errors.length > 0) problems.push(`console errors: ${errors.join("; ")}`);

console.log(
  `eval scale: ${COUNT} rows, first render ${renderMs} ms, table ${info.clientWidth}x${info.clientHeight} ` +
    `(content ${info.scrollWidth}x${info.scrollHeight}), footer ${info.footerVisible ? "visible" : "hidden"}`,
);
if (problems.length > 0) {
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
