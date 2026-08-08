import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

/**
 * Renders every section on one phone and one desktop, so a change to either
 * device system can be looked at rather than reasoned about.
 *
 * Usage: npm run qa:render -- <base-url> <output-directory> <tag>
 */
const [, , baseUrl, dir, tag = "render"] = process.argv;
if (!baseUrl || !dir) throw new Error("Usage: npm run qa:render -- <base-url> <output-directory> [tag]");
await mkdir(dir, { recursive: true });

const CASES = [
  { name: "phone-390", width: 390, height: 844, touch: true },
  { name: "desktop-1440", width: 1440, height: 900, touch: false },
];
const TABS = ["now", "shifts", "stocks", "mine", "ask"];

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  for (const shape of CASES) {
    for (const tab of TABS) {
      const context = await browser.newContext({
        viewport: { width: shape.width, height: shape.height },
        hasTouch: shape.touch,
        isMobile: shape.touch,
        reducedMotion: "reduce",
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/?tab=${tab}`, { waitUntil: "networkidle" });
      await page.getByRole("navigation", { name: "Sections" }).waitFor();
      await page.getByRole("heading", { level: 2 }).first().waitFor();
      await page.screenshot({ path: `${dir}/${tag}-${shape.name}-${tab}.png` });
      await context.close();
    }
  }
  console.log(`Rendered ${CASES.length * TABS.length} views into ${dir}`);
} finally {
  await browser.close();
}
