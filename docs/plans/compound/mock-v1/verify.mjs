import { chromium } from "file:///C:/Users/krish/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const source = pathToFileURL(path.resolve("index.html")).href;
const browser = await chromium.launch({ headless: true });
const cases = [
  { state: "partial", width: 390, height: 844 },
  { state: "partial", width: 1440, height: 1000 },
  { state: "quiet", width: 390, height: 844 },
  { state: "stale", width: 1440, height: 1000 }
];

for (const testCase of cases) {
  const context = await browser.newContext({ viewport: { width: testCase.width, height: testCase.height } });
  const page = await context.newPage();
  await page.goto(`${source}?state=${testCase.state}`, { waitUntil: "load" });

  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    heading: document.querySelector("h1")?.textContent?.trim(),
    gateCount: document.querySelector("[data-copy='gate-count']")?.textContent?.trim(),
    visibleIssue: document.querySelector("[data-copy='issue-feed']")?.textContent?.trim() || null
  }));

  if (layout.documentWidth > layout.viewportWidth) {
    throw new Error(`${testCase.state} ${testCase.width}px overflows by ${layout.documentWidth - layout.viewportWidth}px`);
  }
  if (!layout.heading) throw new Error(`${testCase.state} ${testCase.width}px has no Today verdict`);
  if (testCase.state === "quiet" && layout.gateCount !== "0") throw new Error("Quiet state must show zero things to check");
  if (testCase.state === "stale" && layout.visibleIssue !== "PRICE DATA") throw new Error("Stale state must identify the missing data in plain language");

  await page.getByRole("button", { name: "1 year" }).click();
  if ((await page.getByRole("button", { name: "1 year" }).getAttribute("aria-pressed")) !== "true") {
    throw new Error("Time-period control did not update pressed state");
  }

  await page.getByRole("button", { name: "See the list" }).click();
  if ((await page.getByRole("button", { name: "Hide the list" }).getAttribute("aria-expanded")) !== "true") {
    throw new Error("Full list did not open");
  }

  console.log(JSON.stringify({ ...testCase, ...layout, horizon: "pass", table: "pass" }));
  await context.close();
}

await browser.close();
