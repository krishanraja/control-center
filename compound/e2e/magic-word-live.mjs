import { chromium } from "@playwright/test";

const baseUrl = process.argv[2] ?? "https://compound.krishraja.com";
const magicWord = process.env.COMPOUND_QA_MAGIC_WORD;
if (!magicWord) throw new Error("COMPOUND_QA_MAGIC_WORD is required");

const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByLabel("Magic word").fill(magicWord);
  await page.getByRole("button", { name: "Open COMPOUND" }).click();
  await page.getByRole("heading", { name: "Your money at a glance" }).waitFor({ timeout: 20_000 });

  if (new URL(page.url()).pathname !== "/") throw new Error(`Private dashboard opened at an unexpected path: ${page.url()}`);
  if (await page.getByRole("button", { name: "Ask COMPOUND" }).count() !== 1) throw new Error("The private Ask entry point is missing");
  if (await page.getByLabel("Magic word").count() !== 0) throw new Error("The sign-in form remained visible after the session opened");
  if (errors.length) throw new Error(`Live page errors: ${errors.join(" | ")}`);

  console.log("Live magic-word browser session opened the private dashboard and Ask entry point on a 390px phone viewport.");
  await context.close();
} finally {
  await browser.close();
}
