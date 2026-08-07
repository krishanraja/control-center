import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.argv[2];
const evidenceDir = process.argv[3];
if (!baseUrl || !evidenceDir) throw new Error("Usage: npm run qa:auth -- <base-url> <evidence-directory>");
await mkdir(evidenceDir, { recursive: true });

const cases = [
  { name: "phone-320", viewport: { width: 320, height: 700 } },
  { name: "phone-360", viewport: { width: 360, height: 800 } },
  { name: "phone-390", viewport: { width: 390, height: 844 } },
  { name: "phone-412", viewport: { width: 412, height: 915 } },
  { name: "phone-430", viewport: { width: 430, height: 932 } },
  { name: "tablet-768", viewport: { width: 768, height: 1024 } },
  { name: "android-scaled", viewport: { width: 980, height: 1600 }, screen: { width: 390, height: 844 }, isMobile: true },
];

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const testCase of cases) {
    const context = await browser.newContext({
      viewport: testCase.viewport,
      screen: testCase.screen ?? testCase.viewport,
      isMobile: testCase.isMobile ?? false,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    const metrics = await page.evaluate(() => {
      const card = document.querySelector(".signin-card");
      const title = document.querySelector(".signin-card h1");
      const input = document.querySelector(".signin-card input");
      const button = document.querySelector(".signin-card button");
      if (!(card instanceof HTMLElement) || !(title instanceof HTMLElement) || !(input instanceof HTMLElement) || !(button instanceof HTMLElement)) {
        throw new Error("The public sign-in controls did not render");
      }
      const cardRect = card.getBoundingClientRect();
      return {
        innerWidth,
        screenWidth: screen.width,
        scrollWidth: document.documentElement.scrollWidth,
        cardWidth: Math.round(cardRect.width),
        cardRatio: cardRect.width / innerWidth,
        titleSize: Number.parseFloat(getComputedStyle(title).fontSize),
        inputSize: Number.parseFloat(getComputedStyle(input).fontSize),
        inputHeight: input.getBoundingClientRect().height,
        buttonHeight: button.getBoundingClientRect().height,
      };
    });

    if (metrics.scrollWidth > metrics.innerWidth) throw new Error(`${testCase.name} has horizontal overflow`);
    if (testCase.viewport.width <= 430 && metrics.cardRatio < 0.86) throw new Error(`${testCase.name} uses too little of the phone width`);
    if (testCase.name === "android-scaled" && metrics.cardRatio < 0.86) throw new Error("Android scaled layout still renders as a small desktop card");
    if (metrics.inputSize < 16) throw new Error(`${testCase.name} can trigger mobile form zoom`);
    if (metrics.inputHeight < 52 || metrics.buttonHeight < 52) throw new Error(`${testCase.name} has undersized sign-in controls`);
    if (errors.length) throw new Error(`${testCase.name} console errors: ${errors.join(" | ")}`);

    const screenshot = path.join(evidenceDir, `${testCase.name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    results.push({ name: testCase.name, ...metrics, screenshot, status: "verified" });
    await context.close();
  }
  console.log(JSON.stringify({ baseUrl, results }, null, 2));
} finally {
  await browser.close();
}
