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
  { name: "desktop-1440", width: 1440, height: 1000, touch: false },
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

    const settingsContext = await browser.newContext({
      viewport: { width: shape.width, height: shape.height },
      hasTouch: shape.touch,
      isMobile: shape.touch,
      reducedMotion: "reduce",
      deviceScaleFactor: 2,
    });
    const settingsPage = await settingsContext.newPage();
    await settingsPage.goto(`${baseUrl}/?tab=stocks`, { waitUntil: "networkidle" });
    await settingsPage.getByRole("navigation", { name: "Sections" }).waitFor();
    await settingsPage.getByRole("button", { name: "Settings" }).click();
    if (await settingsPage.getByRole("checkbox").count() !== 11) throw new Error(`${shape.name} Settings did not render 11 sectors`);
    if (await settingsPage.getByRole("switch").count() !== 0) throw new Error(`${shape.name} Settings exposed industries by default`);
    await settingsPage.screenshot({ path: `${dir}/${tag}-${shape.name}-settings.png` });
    await settingsContext.close();

    const contextDetail = await browser.newContext({
      viewport: { width: shape.width, height: shape.height },
      hasTouch: shape.touch,
      isMobile: shape.touch,
      reducedMotion: "reduce",
      deviceScaleFactor: 2,
    });
    const contextPage = await contextDetail.newPage();
    await contextPage.goto(`${baseUrl}/?tab=now`, { waitUntil: "networkidle" });
    await contextPage.getByRole("navigation", { name: "Sections" }).waitFor();
    await contextPage.locator(".chead").first().click();
    await contextPage.locator(".c.open .cworld").first().waitFor();
    await contextPage.screenshot({ path: `${dir}/${tag}-${shape.name}-context-open.png` });
    await contextDetail.close();
  }
  console.log(`Rendered ${CASES.length * (TABS.length + 2)} views into ${dir}`);
} finally {
  await browser.close();
}
