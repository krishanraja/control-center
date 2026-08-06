import { chromium } from "file:///C:/Users/krish/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import process from "node:process";

const outputDir = process.argv[2];
if (!outputDir) {
  throw new Error("Usage: node render.mjs <output-directory>");
}

const source = pathToFileURL(path.resolve("index.html")).href;
const browser = await chromium.launch({ headless: true });

const shots = [
  { name: "compound-mock-v2-mobile-partial.png", width: 390, height: 844, state: "partial", fullPage: true },
  { name: "compound-mock-v2-desktop-partial.png", width: 1440, height: 1000, state: "partial", fullPage: true },
  { name: "compound-mock-v2-mobile-quiet.png", width: 390, height: 844, state: "quiet", fullPage: true },
  { name: "compound-mock-v2-desktop-stale.png", width: 1440, height: 1000, state: "stale", fullPage: true }
];

for (const shot of shots) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  await page.goto(`${source}?state=${shot.state}`, { waitUntil: "load" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({ path: path.join(outputDir, shot.name), fullPage: shot.fullPage });
  await context.close();
}

await browser.close();
