import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const evidenceDir = process.argv[3];
if (!evidenceDir) throw new Error("Usage: npm run qa:ux -- <base-url> <evidence-directory>");
await mkdir(evidenceDir, { recursive: true });

// CHROMIUM_PATH lets a host with a preinstalled browser skip the download.
const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch({ headless: true, executablePath });
const results = [];

async function openCase(name, width, height, route, test, device = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    screen: device.screen ?? { width, height },
    isMobile: device.isMobile ?? false,
    hasTouch: device.hasTouch ?? width <= 768,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  // A bare console message does not say which URL failed. Name it.
  page.on("response", (response) => {
    if (response.status() >= 400) consoleErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
  // The app renders after latest.json arrives, which is a second request that
  // can land after networkidle. Measure the app, not the loading notice.
  await page.getByRole("navigation", { name: "Sections" }).waitFor();
  await page.getByRole("heading", { level: 2 }).first().waitFor();

  if (device.hasTouch ?? width <= 768) {
    await page.locator("button, input, a[href]").first().focus();
  } else {
    await page.keyboard.press("Tab");
  }
  // Poll rather than sample once: the focus ring can be read mid-recalculation
  // and report a zero width that it does not keep. A ring that never arrives
  // times out here and still fails the case.
  const focusState = await page
    .waitForFunction(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement) || element.tagName === "BODY") return null;
      const style = getComputedStyle(element);
      if (style.outlineStyle === "none" || parseFloat(style.outlineWidth) <= 0) return null;
      return { tag: element.tagName, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    }, null, { timeout: 4000 })
    .then((handle) => handle.jsonValue())
    .catch(() => null);
  if (!focusState) throw new Error(`${name} has no visible keyboard focus on entry`);

  await checkControls(page, name);
  await checkOverflow(page, name, "on entry");
  await test(page);
  await checkControls(page, `${name} after interaction`);
  await checkOverflow(page, name, "after interaction");
  if (consoleErrors.length) throw new Error(`${name} console errors: ${consoleErrors.join(" | ")}`);

  const screenshot = path.join(evidenceDir, `${name}.png`);
  await page.screenshot({ path: screenshot });
  results.push({ name, width, height, route, screenshot, status: "verified" });
  await context.close();
}

async function checkControls(page, name) {
  const undersized = await page.evaluate(() => Array.from(document.querySelectorAll("button, input")).flatMap((element) => {
    const rect = element.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
    return visible && rect.height < 42
      ? [{ tag: element.tagName, text: element.textContent?.trim().slice(0, 40), height: Math.round(rect.height) }]
      : [];
  }));
  if (undersized.length) throw new Error(`${name} has undersized controls: ${JSON.stringify(undersized)}`);
}

async function checkOverflow(page, name, when) {
  const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (layout.scrollWidth <= layout.width) return;
  const offenders = await page.evaluate(() => Array.from(document.querySelectorAll("body *")).flatMap((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const leaks = element.scrollWidth > element.clientWidth + 1 && !["auto", "scroll", "hidden", "clip"].includes(style.overflowX);
    return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1 || leaks
      ? [{ tag: element.tagName, className: String(element.className), right: Math.round(rect.right), width: Math.round(rect.width) }]
      : [];
  }).slice(0, 10));
  throw new Error(`${name} has ${layout.scrollWidth - layout.width}px horizontal overflow ${when}: ${JSON.stringify(offenders)}`);
}

const TABS = ["Now", "Shifts", "Stocks", "Mine", "Ask"];

/** Every tab reachable, every tab rendering, in the layout for this width. */
async function verifyTabs(page) {
  const nav = page.getByRole("navigation", { name: "Sections" });
  await nav.waitFor();
  for (const tab of TABS) {
    await nav.getByRole("button", { name: tab, exact: true }).click();
    await page.getByRole("heading", { level: 2 }).first().waitFor();
    if (await nav.getByRole("button", { name: tab, exact: true }).getAttribute("aria-current") !== "page") {
      throw new Error(`${tab} did not report itself as the current section`);
    }
    await checkOverflow(page, `${tab} tab`, "while open");
  }
  await nav.getByRole("button", { name: "Now", exact: true }).click();
}

/** Collapsed by default, one tap to the working, source named next to it. */
async function verifyCardDepth(page) {
  await page.getByRole("heading", { name: "Three things that could matter next." }).waitFor();
  const card = page.locator(".chead").first();
  if (await card.getAttribute("aria-expanded") !== "false") throw new Error("A card was expanded before it was asked to be");
  await card.click();
  if (await card.getAttribute("aria-expanded") !== "true") throw new Error("A card did not report its open state");
  await page.locator(".c.open .src").first().waitFor();
  if (!(await page.locator(".c.open .askbtn").first().isVisible())) throw new Error("An expanded card offered no way to ask about it");
  await card.click();
  if (await card.getAttribute("aria-expanded") !== "false") throw new Error("A card did not collapse again");
}

/** Exclusions come from Settings and apply to the whole app. */
async function verifySettings(page) {
  const nav = page.getByRole("navigation", { name: "Sections" });
  await nav.getByRole("button", { name: "Stocks", exact: true }).click();
  // The count line, not whichever eyebrow the layout happens to put first.
  const count = page.getByText(/^\d+ names/);
  const before = await count.textContent();

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Done" }).waitFor();
  // An industry carrying no names today would hide nothing, which proves nothing.
  const withNames = page.getByRole("switch").filter({ hasNotText: "no names today" });
  const toggle = withNames.first();
  const industry = (await toggle.locator(".tn").textContent()) ?? "";
  if (await toggle.getAttribute("aria-checked") !== "true") throw new Error("An industry started out hidden");
  await toggle.click();
  if (await toggle.getAttribute("aria-checked") !== "false") throw new Error("Turning an industry off did not register");

  await page.getByRole("button", { name: "Done" }).click();
  const after = await count.textContent();
  if (after === before) throw new Error(`Hiding ${industry} changed nothing on Stocks (read "${before}" before and after)`);
  if (!after?.includes("hidden")) throw new Error("Stocks did not report how many industries are hidden");

  // Put it back so the screenshot shows the default state.
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("switch", { name: new RegExp(industry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
  await page.getByRole("button", { name: "Done" }).click();
  if ((await count.textContent()) !== before) throw new Error("Showing the industry again did not restore Stocks");
}

/** A stock opens as a sheet over the frame, with a way back and no new route. */
async function verifyStockSheet(page) {
  const nav = page.getByRole("navigation", { name: "Sections" });
  await nav.getByRole("button", { name: "Stocks", exact: true }).click();
  await page.getByRole("heading", { name: "What looks worth the work." }).waitFor();
  const routeBefore = new URL(page.url()).pathname;

  await page.locator("button.srow").first().click();
  await page.getByRole("button", { name: "← Back" }).waitFor();
  await page.getByText("What it would take").waitFor();
  if (new URL(page.url()).pathname !== routeBefore) throw new Error("A sheet changed the route instead of covering the frame");
  if (!(await nav.isVisible())) throw new Error("A sheet hid the navigation");

  await page.getByRole("button", { name: "← Back" }).click();
  await page.getByRole("heading", { name: "What looks worth the work." }).waitFor();
}

/** A card hands its question to Ask, and Ask answers with its sources named. */
async function verifyAskHandover(page) {
  const nav = page.getByRole("navigation", { name: "Sections" });
  await nav.getByRole("button", { name: "Now", exact: true }).click();
  await page.locator(".chead").first().click();
  await page.locator(".c.open .askbtn").first().click();

  await page.getByRole("heading", { name: "Ask." }).waitFor();
  await page.locator(".ans").waitFor();
  await page.getByText("What this used").waitFor();
  if (await page.locator(".evline").count() === 0) throw new Error("An answer cited nothing");
  if (new URL(page.url()).searchParams.get("tab") !== "ask") throw new Error("Ask was not reflected in the URL");

  if (!(await page.locator(".composer button").isDisabled())) throw new Error("An empty question could be submitted");
  await page.getByLabel("Ask another question").fill("What is my biggest risk?");
  await page.locator(".composer button").click();
  await page.getByText(/Concentration/).first().waitFor();
}

/** Shifts drills from a theme into the companies on each side of it. */
async function verifyThemeDrill(page) {
  const nav = page.getByRole("navigation", { name: "Sections" });
  await nav.getByRole("button", { name: "Shifts", exact: true }).click();
  await page.getByRole("heading", { name: "The forces." }).waitFor();

  const forces = page.getByRole("group", { name: "Force" });
  await forces.getByRole("button", { name: "Cost of money" }).click();
  await page.getByText(/Borrowing costs are priced/).waitFor();
  await forces.getByRole("button", { name: "Crypto" }).click();
  await page.getByText("Crypto is being used less, not more.").waitFor();
  await forces.getByRole("button", { name: "AI", exact: true }).click();

  await page.locator(".chead").first().click();
  await page.getByRole("button", { name: "See both sides →" }).first().click();
  await page.getByText("story says wins").waitFor();
  await page.getByText("story says loses").waitFor();
  await page.getByRole("button", { name: "← Back" }).click();

  const groups = page.getByRole("group", { name: "Industry group" });
  await groups.getByRole("button", { name: /Falling, pace easing/ }).click();
  await page.getByText(/Still down over three months/).waitFor();
}

async function verifyEverything(page) {
  await verifyTabs(page);
  await verifyCardDepth(page);
  await verifyThemeDrill(page);
  await verifySettings(page);
  await verifyStockSheet(page);
  await verifyAskHandover(page);
}

try {
  await openCase("phone-320", 320, 700, "/", verifyEverything);
  await openCase("phone-360", 360, 800, "/", verifyEverything);
  await openCase("phone-390", 390, 844, "/", verifyEverything);
  await openCase("phone-412", 412, 915, "/", verifyEverything);
  await openCase("phone-430", 430, 932, "/", verifyEverything);
  await openCase("tablet-768", 768, 1024, "/", verifyEverything);
  await openCase("android-scaled", 980, 1600, "/", verifyEverything, {
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await openCase("desktop-1280", 1280, 900, "/", verifyEverything);
  await openCase("desktop-1440", 1440, 1000, "/", verifyEverything);
  await openCase("deep-link-stocks", 390, 844, "/?tab=stocks", async (page) => {
    await page.getByRole("heading", { name: "What looks worth the work." }).waitFor();
    await verifyStockSheet(page);
  });
  await openCase("deep-link-ask", 390, 844, "/ask", async (page) => {
    await page.getByRole("heading", { name: "Ask." }).waitFor();
  });
  console.log(JSON.stringify({ baseUrl, results }, null, 2));
} finally {
  await browser.close();
}
