import { chromium } from "file:///C:/Users/krish/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import process from "node:process";

const outputDir = process.argv[2];
if (!outputDir) {
  throw new Error("Usage: node render-chat.mjs <output-directory>");
}

const source = pathToFileURL(path.resolve("index.html")).href;
const browser = await chromium.launch({ headless: true });

const shots = [
  { name: "compound-ask-mock-v1-mobile-ready.png", width: 390, height: 844, query: "view=ask", waitMs: 0 },
  { name: "compound-ask-mock-v1-desktop-ready.png", width: 1440, height: 1000, query: "view=ask", waitMs: 0 },
  { name: "compound-ask-mock-v1-mobile-streaming.png", width: 390, height: 844, query: "view=ask&stream=1", waitMs: 900 }
];

for (const shot of shots) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  await page.goto(`${source}?${shot.query}`, { waitUntil: "load" });
  if (shot.waitMs) await page.waitForTimeout(shot.waitMs);
  await page.screenshot({ path: path.join(outputDir, shot.name), fullPage: true });
  await context.close();
}

await browser.close();
