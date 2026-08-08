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

/**
 * COMPOUND renders two systems, so the QA pass checks two systems.
 *
 *   stack  bottom tabs, short tab names, sheets over the content, list rows
 *   split  a rail, long tab names, a panel beside the content, real tables
 *
 * Every case declares which system it expects, and every check below reads
 * that rather than assuming one shape. A case that renders the wrong system
 * for its width fails here rather than surprising somebody on a phone.
 */
const STACK = {
  system: "stack",
  tabs: { now: "Today", shifts: "Trends", stocks: "Stocks", mine: "Money", ask: "Ask" },
  close: "Back",
  rates: "Rates",
  groupSlowing: "Down, slowing",
  // 44px is the touch target size Apple and Android both publish, and above
  // the 24px WCAG 2.2 minimum. The old gate applied it to mice as well.
  minControl: 44,
  nav: ".botnav",
  detail: ".sheet",
};
const SPLIT = {
  system: "split",
  tabs: { now: "Today", shifts: "Big trends", stocks: "Stocks", mine: "My money", ask: "Ask a question" },
  close: "Close",
  rates: "Interest rates",
  groupSlowing: "Going down, but slowing",
  // A pointer is precise. 32px clears WCAG 2.2 target size comfortably and is
  // what desktop software actually uses.
  minControl: 32,
  nav: ".sidenav",
  detail: ".panel",
};
const SPLIT_TOUCH = { ...SPLIT, minControl: 44 };

async function openCase(name, width, height, route, device, test, emulation = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    screen: emulation.screen ?? { width, height },
    isMobile: emulation.isMobile ?? false,
    hasTouch: emulation.hasTouch ?? width <= 768,
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

  await checkSystem(page, name, device);

  // Tab, on every case. A ring is a keyboard affordance, so asserting it after
  // a programmatic focus would prove nothing a keyboard user relies on.
  await page.keyboard.press("Tab");
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

  await checkProportions(page, name, device);
  await checkControls(page, name, device);
  await checkOverflow(page, name, "on entry");
  await test(page, device);
  await checkControls(page, `${name} after interaction`, device);
  await checkOverflow(page, name, "after interaction");
  if (consoleErrors.length) throw new Error(`${name} console errors: ${consoleErrors.join(" | ")}`);

  const screenshot = path.join(evidenceDir, `${name}.png`);
  await page.screenshot({ path: screenshot });
  results.push({ name, width, height, route, system: device.system, screenshot, status: "verified" });
  await context.close();
}

/** The right system for this width, and none of the other one's furniture. */
async function checkSystem(page, name, device) {
  const other = device.system === "stack" ? "split" : "stack";
  if (!(await page.locator(`.shell.${device.system}`).count())) {
    throw new Error(`${name} did not render the ${device.system} system`);
  }
  if (await page.locator(`.shell.${other}`).count()) {
    throw new Error(`${name} rendered the ${other} system as well`);
  }
  if (!(await page.locator(device.nav).isVisible())) {
    throw new Error(`${name} is missing its ${device.system} navigation`);
  }
}

/**
 * The phone system is written in design pixels and multiplied by --px, so a
 * viewport wider than the screen it has to fit onto still arrives at thumb
 * size. This measures the result back into design pixels: a reading column
 * that is phone shaped, and body text nobody has to squint at.
 *
 * Without this, a browser handing the page a 980 pixel viewport on a 412 pixel
 * screen passed every other check while rendering 7 pixel text on the glass.
 */
async function checkProportions(page, name, device) {
  if (device.system !== "stack") return;
  const shape = await page.evaluate(() => {
    const shell = document.querySelector(".shell");
    const px = parseFloat(getComputedStyle(shell).getPropertyValue("--px")) || 1;
    const wanted = Math.min(Math.max(window.innerWidth / (window.screen.width || window.innerWidth), 1), 3);
    const body = parseFloat(getComputedStyle(document.querySelector(".sub")).fontSize);
    const column = (document.querySelector(".page")?.getBoundingClientRect().width ?? 0) / px;
    return { px, wanted, body: body / px, column, viewport: window.innerWidth, screen: window.screen.width };
  });
  // The design pixel has to match the squeeze the browser is about to apply.
  // Miss it and every other check still passes while the glass shows 7px text.
  if (shape.wanted > 1.2 && Math.abs(shape.px - shape.wanted) / shape.wanted > 0.1) {
    throw new Error(
      `${name} draws at ${shape.px} CSS pixels per design pixel, but a ${shape.viewport}px viewport on a `
      + `${shape.screen}px screen needs ${shape.wanted.toFixed(2)}. Everything would render at `
      + `${Math.round((shape.px / shape.wanted) * 100)}% of the size it was written at.`,
    );
  }
  if (shape.column > 600) {
    throw new Error(`${name} reads ${Math.round(shape.column)} design pixels wide, which is a tablet column on a phone layout`);
  }
  if (shape.body < 15) {
    throw new Error(`${name} sets body text at ${shape.body.toFixed(1)} design pixels, under the 15 the phone system is written in`);
  }
}

/** Column headings belong to the desktop table and to nothing else. */
async function checkTableShape(page, name, device) {
  const heads = await page.locator(".dthead").count();
  if (device.system === "split" && heads === 0) throw new Error(`${name} has tables with no column headings`);
  if (device.system === "stack" && heads > 0) throw new Error(`${name} put desktop table headings on a phone`);
}

async function checkControls(page, name, device) {
  const undersized = await page.evaluate((floor) => Array.from(document.querySelectorAll("button, input")).flatMap((element) => {
    const rect = element.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
    return visible && rect.height < floor
      ? [{ tag: element.tagName, text: element.textContent?.trim().slice(0, 40), height: Math.round(rect.height) }]
      : [];
  }), device.minControl);
  if (undersized.length) throw new Error(`${name} has controls under ${device.minControl}px: ${JSON.stringify(undersized)}`);
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

/**
 * Nothing on a phone screen may sit past the edge, and nothing may hide the
 * fact by scrolling sideways inside itself.
 *
 * checkOverflow only fires when the document itself scrolls. A control with
 * overflow-x: auto absorbs its own overflow, so a two column grid whose
 * columns refused to shrink below their labels ran 190 pixels off a 390 pixel
 * screen while every other check passed. The phone system has no business
 * scrolling sideways anywhere, so this says so.
 */
async function checkNoSideways(page, name, device) {
  if (device.system !== "stack") return;
  const found = await page.evaluate(() => {
    const edge = document.documentElement.clientWidth;
    const root = document.querySelector(".page");
    if (!root) return [];
    const out = [];
    for (const element of root.querySelectorAll("*")) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const describe = (why) => ({
        why,
        tag: element.tagName,
        className: String(element.className).slice(0, 40),
        text: (element.textContent ?? "").trim().slice(0, 34),
        right: Math.round(rect.right),
      });
      if (rect.right > edge + 1 || rect.left < -1) out.push(describe("past the screen edge"));
      else if (element.scrollWidth > element.clientWidth + 1) out.push(describe("hiding content behind a sideways scroll"));
    }
    return out.slice(0, 6);
  });
  if (found.length) throw new Error(`${name} has content off the side: ${JSON.stringify(found)}`);
}

/**
 * Headings marked one line have to hold one line. A Range over the text
 * reports a rect per line box, so two rects means it wrapped, whatever the
 * width or the device.
 */
async function checkOneLineHeadings(page, name) {
  const wrapped = await page.evaluate(() => Array.from(document.querySelectorAll(".oneline")).flatMap((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const lines = range.getClientRects().length;
    return lines > 1 ? [{ text: (element.textContent ?? "").trim(), lines }] : [];
  }));
  if (wrapped.length) throw new Error(`${name} wrapped a one line heading: ${JSON.stringify(wrapped)}`);
}

/** Nothing a reader sees may be cut off with an ellipsis by the layout. */
async function checkTruncation(page, name) {
  const clipped = await page.evaluate(() => Array.from(document.querySelectorAll(".rowname, .ch, .tn, h2, h3, .cnext, .sub"))
    .filter((element) => element.scrollWidth > element.clientWidth + 1)
    .map((element) => ({ className: String(element.className), text: element.textContent?.trim().slice(0, 60) }))
    .slice(0, 8));
  if (clipped.length) throw new Error(`${name} clips text it should wrap: ${JSON.stringify(clipped)}`);
}

const TAB_KEYS = ["now", "shifts", "stocks", "mine", "ask"];

/** Every section reachable and rendering, in the layout for this width. */
async function verifyTabs(page, device) {
  const nav = page.getByRole("navigation", { name: "Sections" });
  await nav.waitFor();
  for (const key of TAB_KEYS) {
    const label = device.tabs[key];
    await nav.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("heading", { level: 2 }).first().waitFor();
    if (await nav.getByRole("button", { name: label, exact: true }).getAttribute("aria-current") !== "page") {
      throw new Error(`${label} did not report itself as the current section`);
    }
    await checkOverflow(page, `${label} section`, "while open");
    await checkNoSideways(page, `${label} section`, device);
    await checkOneLineHeadings(page, `${label} section`);
    await checkTruncation(page, `${label} section`);
  }
  await nav.getByRole("button", { name: device.tabs.now, exact: true }).click();
}

/** Folded by default, one press to the working, source named next to it. */
async function verifyCardDepth(page) {
  await page.getByRole("heading", { name: "Your AI Fund Strategist" }).waitFor();
  const card = page.locator(".chead").first();
  if (await card.getAttribute("aria-expanded") !== "false") throw new Error("A card was open before it was asked to be");
  const face = page.locator(".c").first().locator(".cworld-face");
  if (!(await face.isVisible())) throw new Error("A closed card hid its cited world context");
  if (!((await face.locator(".cworld-preview").textContent()) ?? "").trim()) throw new Error("A context face had no glanceable summary");
  if (await page.locator(".c").first().getByRole("link").count()) throw new Error("A closed card placed citation links inside its disclosure control");
  await card.click();
  if (await card.getAttribute("aria-expanded") !== "true") throw new Error("A card did not report its open state");
  await page.locator(".c.open .src").first().waitFor();
  await page.locator(".c.open .cworld").first().waitFor();
  if (await page.locator(".c.open .cite").count() === 0) throw new Error("Expanded world context cited no sources");
  if (!(await page.locator(".c.open .askbtn").first().isVisible())) throw new Error("An open card offered no way to ask about it");
  await card.click();
  if (await card.getAttribute("aria-expanded") !== "false") throw new Error("A card did not fold up again");
  if (!(await face.isVisible())) throw new Error("The context face did not return after closing the card");
}

/** Hidden industries are set in Settings and apply to the whole app. */
async function verifySettings(page, device) {
  const nav = page.getByRole("navigation", { name: "Sections" });
  await nav.getByRole("button", { name: device.tabs.stocks, exact: true }).click();
  const count = page.getByText(/^\d+ companies/);
  const before = await count.textContent();

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: device.close }).waitFor();
  const sectors = page.getByRole("checkbox");
  if (await sectors.count() !== 11) throw new Error(`Settings showed ${await sectors.count()} top-level rows instead of 11 sectors`);
  if (await page.getByRole("switch").count() !== 0) throw new Error("Settings exposed industries before a sector was opened or searched");

  // Search flattens the hierarchy to one active industry, which is the safest
  // reversible persistence check for both device systems.
  await page.getByLabel("Search industries").fill("Software - Infrastructure");
  const toggle = page.getByRole("switch", { name: /Software - Infrastructure/ });
  const industry = (await toggle.locator(".tn").textContent()) ?? "";
  if (await toggle.getAttribute("aria-checked") !== "true") throw new Error("An industry started out hidden");
  await toggle.click();
  if (await toggle.getAttribute("aria-checked") !== "false") throw new Error("Turning an industry off did not register");

  await page.getByRole("button", { name: device.close }).click();
  const after = await count.textContent();
  if (after === before) throw new Error(`Hiding ${industry} changed nothing on Stocks (read "${before}" before and after)`);
  if (!after?.includes("hidden")) throw new Error("Stocks did not report how many industries are hidden");

  // Put it back so the screenshot shows the default state.
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Search industries").fill(industry);
  await page.getByRole("switch", { name: new RegExp(industry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
  await page.getByRole("button", { name: device.close }).click();
  if ((await count.textContent()) !== before) throw new Error("Showing the industry again did not restore Stocks");
}

/**
 * A stock opens without changing the route, and the way back is obvious. On a
 * phone the detail covers the content; on a desktop it sits beside it and the
 * list stays readable, which is the whole reason the two systems differ.
 */
async function verifyDetail(page, device) {
  const nav = page.getByRole("navigation", { name: "Sections" });
  await nav.getByRole("button", { name: device.tabs.stocks, exact: true }).click();
  await page.getByRole("heading", { name: "Which ones have real backing." }).waitFor();
  await checkTableShape(page, "Stocks", device);
  const routeBefore = new URL(page.url()).pathname;

  await page.locator("button.srow").first().click();
  await page.getByRole("button", { name: device.close }).waitFor();
  await page.getByText("What would change this").waitFor();
  if (new URL(page.url()).pathname !== routeBefore) throw new Error("The detail changed the route instead of opening in place");
  if (!(await page.locator(device.nav).isVisible())) throw new Error("The detail hid the navigation");
  if (!(await page.locator(device.detail).isVisible())) throw new Error(`The detail did not open as a ${device.system} ${device.detail}`);

  // The phone marks the content behind a sheet inert, so the heading drops out
  // of the accessibility tree entirely. The desktop panel is not modal, so the
  // list it was opened from stays right there beside it.
  const listReachable = await page.getByRole("heading", { name: "Which ones have real backing." }).count() > 0;
  if (device.system === "split" && !listReachable) throw new Error("The desktop panel covered the list it was opened from");
  if (device.system === "stack" && listReachable) throw new Error("The phone sheet left the content behind it reachable");

  await page.getByRole("button", { name: device.close }).click();
  await page.getByRole("heading", { name: "Which ones have real backing." }).waitFor();
}

/** A card hands its question to Ask, and Ask answers with its sources named. */
async function verifyAskHandover(page, device) {
  const nav = page.getByRole("navigation", { name: "Sections" });
  await nav.getByRole("button", { name: device.tabs.now, exact: true }).click();
  await page.locator(".chead").first().click();
  await page.locator(".c.open .askbtn").first().click();

  await page.getByRole("heading", { name: "Ask." }).waitFor();
  await page.locator(".ans").waitFor();
  await page.getByText("Where this came from").waitFor();
  if (await page.locator(".evline").count() === 0) throw new Error("An answer cited nothing");
  if (new URL(page.url()).searchParams.get("tab") !== "ask") throw new Error("Ask was not reflected in the URL");

  if (!(await page.locator(".composer button").isDisabled())) throw new Error("An empty question could be submitted");
  await page.getByLabel("Ask another question").fill("What is my biggest risk?");
  await page.locator(".composer button").click();
  await page.getByText(/Having too much in one thing/).first().waitFor();
}

/** Trends drills from a force into the companies on each side of it. */
async function verifyTrendDrill(page, device) {
  const nav = page.getByRole("navigation", { name: "Sections" });
  await nav.getByRole("button", { name: device.tabs.shifts, exact: true }).click();
  await page.getByRole("heading", { name: "The three forces." }).waitFor();

  const forces = page.getByRole("group", { name: "Which force" });
  await forces.getByRole("button", { name: device.rates }).click();
  await page.getByText(/Borrowing is priced/).waitFor();
  await forces.getByRole("button", { name: "Crypto" }).click();
  await page.getByText("Crypto is being used less, not more.").waitFor();
  await forces.getByRole("button", { name: "AI", exact: true }).click();

  await page.locator(".chead").first().click();
  await page.getByRole("button", { name: "See both sides" }).first().click();
  await page.getByText("the story says this side wins").waitFor();
  await page.getByText("the story says this side loses").waitFor();
  await page.getByRole("button", { name: device.close }).click();

  const groups = page.getByRole("group", { name: "Which group" });
  // Every group in turn. The longest label is the one that used to break out
  // of the two column track and run off the side of the screen.
  const groupCount = await groups.getByRole("button").count();
  for (let index = 0; index < groupCount; index += 1) {
    await groups.getByRole("button").nth(index).click();
    await checkNoSideways(page, `Trends group ${index + 1}`, device);
  }
  await groups.getByRole("button", { name: new RegExp(device.groupSlowing) }).click();
  await page.getByText(/Still down over three months/).waitFor();
}

/** Number keys move between sections. Desktop only, because keyboards are. */
async function verifyKeyboard(page, device) {
  const nav = page.getByRole("navigation", { name: "Sections" });
  await page.keyboard.press("3");
  await page.getByRole("heading", { name: "Which ones have real backing." }).waitFor();
  if (await nav.getByRole("button", { name: device.tabs.stocks, exact: true }).getAttribute("aria-current") !== "page") {
    throw new Error("Pressing 3 did not move to Stocks");
  }
  await page.locator("button.srow").first().click();
  await page.getByRole("button", { name: device.close }).waitFor();
  await page.keyboard.press("Escape");
  if (await page.locator(device.detail).count()) throw new Error("Escape did not close the panel");
  await page.keyboard.press("1");
  await page.getByRole("heading", { name: "Your AI Fund Strategist" }).waitFor();
}

async function verifyEverything(page, device) {
  await verifyTabs(page, device);
  await verifyCardDepth(page);
  await verifyTrendDrill(page, device);
  await verifySettings(page, device);
  await verifyDetail(page, device);
  await verifyAskHandover(page, device);
  if (device.system === "split") await verifyKeyboard(page, device);
}

try {
  await openCase("phone-320", 320, 700, "/", STACK, verifyEverything);
  await openCase("phone-360", 360, 800, "/", STACK, verifyEverything);
  await openCase("phone-390", 390, 844, "/", STACK, verifyEverything);
  await openCase("phone-412", 412, 915, "/", STACK, verifyEverything);
  await openCase("phone-430", 430, 932, "/", STACK, verifyEverything);
  await openCase("tablet-768", 768, 1024, "/", STACK, verifyEverything);
  // A browser in desktop site mode, and several Android in-app browsers, hand
  // the page a viewport far wider than the screen and squeeze the result to
  // fit. Both of these render at phone size or they fail.
  await openCase("android-scaled", 980, 1600, "/", STACK, verifyEverything, {
    screen: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await openCase("desktop-site-980", 980, 2100, "/", STACK, verifyEverything, {
    screen: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
  });
  await openCase("tablet-landscape-1180", 1180, 820, "/", SPLIT_TOUCH, verifyEverything, {
    screen: { width: 1180, height: 820 },
    hasTouch: true,
  });
  await openCase("desktop-1280", 1280, 900, "/", SPLIT, verifyEverything);
  await openCase("desktop-1440", 1440, 1000, "/", SPLIT, verifyEverything);
  await openCase("desktop-1920", 1920, 1080, "/", SPLIT, verifyEverything);
  await openCase("deep-link-stocks", 390, 844, "/?tab=stocks", STACK, async (page, device) => {
    await page.getByRole("heading", { name: "Which ones have real backing." }).waitFor();
    await verifyDetail(page, device);
  });
  await openCase("deep-link-ask", 390, 844, "/ask", STACK, async (page) => {
    await page.getByRole("heading", { name: "Ask." }).waitFor();
  });
  console.log(JSON.stringify({ baseUrl, results }, null, 2));
} finally {
  await browser.close();
}
