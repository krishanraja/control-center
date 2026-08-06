import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const evidenceDir = process.argv[3];
if (!evidenceDir) throw new Error("Usage: npm run qa:ux -- <base-url> <evidence-directory>");
await mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

async function openCase(name, width, height, route, test) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const focusState = await page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return null;
    const style = getComputedStyle(element);
    return { tag: element.tagName, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  if (!focusState || focusState.tag === "BODY" || focusState.outlineStyle === "none" || focusState.outlineWidth === "0px") throw new Error(`${name} has no visible keyboard focus on entry`);
  const undersized = await page.evaluate(() => Array.from(document.querySelectorAll("button, input")).flatMap((element) => {
    const rect = element.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
    return visible && rect.height < 42 ? [{ tag: element.tagName, text: element.textContent?.trim().slice(0, 60), height: Math.round(rect.height) }] : [];
  }));
  if (undersized.length) throw new Error(`${name} has undersized controls: ${JSON.stringify(undersized)}`);
  const startLayout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (startLayout.scrollWidth > startLayout.width) {
    const offenders = await page.evaluate(() => Array.from(document.querySelectorAll("body *")).flatMap((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const leaks = element.scrollWidth > element.clientWidth + 1 && !["auto", "scroll", "hidden", "clip"].includes(style.overflowX);
      return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1 || leaks
        ? [{ tag: element.tagName, className: element.className, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, overflowX: style.overflowX }]
        : [];
    }).slice(0, 12));
    throw new Error(`${name} has ${startLayout.scrollWidth - startLayout.width}px horizontal overflow: ${JSON.stringify(offenders)}`);
  }
  await test(page);
  const endLayout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (endLayout.scrollWidth > endLayout.width) throw new Error(`${name} has ${endLayout.scrollWidth - endLayout.width}px horizontal overflow after interaction`);
  if (consoleErrors.length) throw new Error(`${name} console errors: ${consoleErrors.join(" | ")}`);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const screenshot = path.join(evidenceDir, `${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  results.push({ name, width, height, route, screenshot, status: "verified" });
  await context.close();
}

async function verifyDashboard(page, expectedState) {
  await page.getByRole("heading", { name: "Your money at a glance" }).waitFor();
  await page.getByRole("heading", { name: "How each investment looks" }).waitFor();
  await page.getByRole("heading", { name: "Where money is moving" }).waitFor();
  if (expectedState === "quiet") await page.getByText("Nothing needs your attention today.", { exact: true }).first().waitFor();
  if (expectedState === "stale") await page.getByText("PRICE DATA", { exact: true }).waitFor();

  await page.getByRole("button", { name: "See the list" }).click();
  await page.getByRole("table").waitFor();
  if (await page.getByRole("button", { name: "Hide the list" }).getAttribute("aria-expanded") !== "true") throw new Error("Holdings list did not expose its open state");

  await page.getByRole("button", { name: "1 year" }).click();
  if (await page.getByRole("button", { name: "1 year" }).getAttribute("aria-pressed") !== "true") throw new Error("One-year horizon did not expose its selected state");
  if (!(new URL(page.url())).searchParams.has("horizon")) throw new Error("Horizon was not preserved in the URL");

  await page.getByRole("button", { name: "Ask COMPOUND" }).click();
  if (new URL(page.url()).pathname !== "/ask") throw new Error("Ask did not open as a separate route");
  await page.getByRole("heading", { name: "Ask about your money." }).waitFor();
  await page.getByRole("button", { name: "Back to today" }).click();
  if (new URL(page.url()).pathname !== "/") throw new Error("Back to today did not return to the dashboard");
  await page.getByRole("heading", { name: "Your money at a glance" }).waitFor();
}

async function verifyAsk(page) {
  await page.getByRole("heading", { name: "Ask about your money." }).waitFor();
  if (!(await page.locator(".composer button").isDisabled())) throw new Error("An empty question could be submitted");
  await page.getByRole("button", { name: "What changed today?" }).click();
  const input = page.getByLabel("Ask another question");
  if (await input.inputValue() !== "What changed today?") throw new Error("Suggested question did not fill the input");
  await input.press("Enter");
  await page.getByText("Answer ready", { exact: true }).waitFor();
  await page.getByText("Don't buy more Solana yet", { exact: false }).waitFor();
  await page.getByRole("heading", { name: "Used for this answer" }).waitFor();
  if (await page.locator(".evidence-line").count() !== 2) throw new Error("The answer did not show its two deterministic evidence rows");
  if (!(await page.getByText(/News updates are late/).isVisible())) throw new Error("Excluded late data was not explained");
}

async function verifyStaleAsk(page) {
  await page.getByText(/latest complete COMPOUND data is 31 hours old/i).waitFor();
  await page.getByRole("heading", { name: "Why there is no current answer" }).waitFor();
  if (await page.locator(".evidence-line").count() !== 0) throw new Error("Stale Ask state displayed current evidence");
}

try {
  await openCase("dashboard-mobile-partial", 390, 844, "/?state=partial", (page) => verifyDashboard(page, "partial"));
  await openCase("dashboard-desktop-partial", 1440, 1000, "/?state=partial", (page) => verifyDashboard(page, "partial"));
  await openCase("dashboard-mobile-quiet", 390, 844, "/?state=quiet", (page) => verifyDashboard(page, "quiet"));
  await openCase("dashboard-desktop-stale", 1440, 1000, "/?state=stale", (page) => verifyDashboard(page, "stale"));
  await openCase("ask-mobile-ready", 390, 844, "/ask?state=partial", verifyAsk);
  await openCase("ask-desktop-ready", 1440, 1000, "/ask?state=partial", verifyAsk);
  await openCase("ask-mobile-stale", 390, 844, "/ask?state=stale", verifyStaleAsk);
  console.log(JSON.stringify({ baseUrl, results }, null, 2));
} finally {
  await browser.close();
}
