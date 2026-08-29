import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.COMPOUND_QA_URL ?? "http://127.0.0.1:4175";
const outputDir = process.env.COMPOUND_QA_OUT
  ?? path.join(process.env.USERPROFILE ?? process.env.HOME ?? process.cwd(), ".scratch", "compound-calm-brief", "after");
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome-stable");

const viewports = [
  { name: "stack-320", width: 320, height: 700, mobile: true },
  { name: "stack-390", width: 390, height: 844, mobile: true },
  { name: "stack-430", width: 430, height: 932, mobile: true },
  { name: "split-1024", width: 1024, height: 768, mobile: false },
  { name: "split-1440", width: 1440, height: 1000, mobile: false },
  { name: "split-1920", width: 1920, height: 1080, mobile: false },
];

const states = ["representative", "stale", "quiet", "partial"];
const failures = [];
const results = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function pageErrors(page, label) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    if (!request.url().includes("favicon")) errors.push(`request: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`);
  });
  return () => errors.forEach((error) => failures.push(`${label} ${error}`));
}

async function openState(page, viewport, state) {
  const query = `?demoState=${state}`;
  await page.goto(`${baseUrl}/${query}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("navigation", { name: "Sections" }).waitFor();
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  check(overflow.document <= 1 && overflow.body <= 1, `${viewport.name}/${state} has horizontal overflow ${JSON.stringify(overflow)}`);

  const stories = await page.locator(".lead-story, .brief-story").count();
  check(stories === 3, `${viewport.name}/${state} renders ${stories} story positions, expected 3`);
  check(await page.locator(".domain-glyph svg").count() >= 3, `${viewport.name}/${state} is missing restrained domain glyphs`);
  check(await page.locator(".story-kind svg").count() >= 3, `${viewport.name}/${state} is missing classification glyphs`);

  const truth = (await page.locator(".truthline").innerText()).toLowerCase();
  if (state === "stale") check(truth.includes("update delayed") && truth.includes("last published"), `${viewport.name}/stale does not identify the delayed last publication`);
  if (state === "quiet") check(await page.getByText("Nothing needs action", { exact: true }).isVisible(), `${viewport.name}/quiet lacks the calm no-action headline`);
  if (state === "partial") check(truth.includes("partial brief") && truth.includes("source limitation"), `${viewport.name}/partial does not disclose limitations`);
}

async function verifyStoryDetail(page, viewport) {
  await openState(page, viewport, "representative");
  const lead = page.locator(".lead-story");
  await lead.focus();
  await lead.click();
  const detail = viewport.mobile ? page.getByRole("dialog") : page.locator(".panel");
  await detail.waitFor();
  check(await detail.getByText("In the wider world", { exact: true }).isVisible(), `${viewport.name} story detail omits world context`);
  check(await detail.locator(".world-detail .source-links a").count() >= 1, `${viewport.name} story detail omits cited links`);
  check(await detail.getByText("What would change this", { exact: true }).isVisible(), `${viewport.name} story detail omits falsifier`);
  await page.screenshot({ path: path.join(outputDir, `${viewport.name}-story-detail.png`), fullPage: true });
  await detail.getByRole("button", { name: viewport.mobile ? /back/i : /close/i }).click();
  check(await lead.evaluate((node) => document.activeElement === node), `${viewport.name} does not restore focus to the opened story`);
}

async function verifyMarketsAndSettings(page, viewport) {
  await openState(page, viewport, "representative");
  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: /Markets/ }).click();
  check(await page.locator(".sector-row").count() === 11, `${viewport.name} Markets does not show the 11-sector taxonomy`);
  check(await page.getByText("Holdings and bookmarks do not change this order.", { exact: true }).isVisible(), `${viewport.name} Markets does not state ranking independence`);
  await page.screenshot({ path: path.join(outputDir, `${viewport.name}-markets.png`), fullPage: true });

  await page.getByRole("button", { name: "Settings" }).click();
  const surface = viewport.mobile ? page.getByRole("dialog", { name: /settings/i }) : page.locator(".panel");
  await surface.waitFor();
  check(await surface.locator(".group").count() === 11, `${viewport.name} Settings does not default to 11 collapsed groups`);
  check(await surface.locator(".groupmembers").count() === 0, `${viewport.name} Settings exposes industry rows before expansion`);
  check(await surface.locator(".groupcontrol[role=checkbox]").count() === 11, `${viewport.name} Settings group switches are incomplete`);
  await page.screenshot({ path: path.join(outputDir, `${viewport.name}-settings-collapsed.png`), fullPage: true });
  await surface.locator(".groupname").first().click();
  check(await surface.locator(".groupmembers [role=switch]").count() > 0, `${viewport.name} Settings group does not reveal industry switches`);
  await surface.getByRole("button", { name: viewport.mobile ? /back/i : /close/i }).click();
}

async function verifyNavigation(page, viewport) {
  await openState(page, viewport, "representative");
  const nav = page.getByRole("navigation", { name: "Sections" });
  check(await nav.locator(":scope > button").count() === 4, `${viewport.name} does not have exactly four primary destinations`);

  await nav.getByRole("button", { name: /Portfolio/ }).click();
  check(await page.getByText("Separate from market ranking", { exact: true }).isVisible(), `${viewport.name} Portfolio separation is unclear`);
  await page.screenshot({ path: path.join(outputDir, `${viewport.name}-portfolio.png`), fullPage: true });

  await nav.getByRole("button", { name: /Ask/ }).click();
  check(await page.getByText("Compare", { exact: true }).isVisible(), `${viewport.name} Ask lacks compare scope`);
  check(await page.getByText("Range", { exact: true }).isVisible(), `${viewport.name} Ask lacks range scope`);

  if (!viewport.mobile) {
    await page.keyboard.press("1");
    check(await nav.getByRole("button", { name: /Today in markets/ }).getAttribute("aria-current") === "page", `${viewport.name} keyboard shortcut 1 failed`);
    await page.keyboard.press("4");
    check(await nav.getByRole("button", { name: /Ask/ }).getAttribute("aria-current") === "page", `${viewport.name} keyboard shortcut 4 failed`);
  }

  await page.getByRole("button", { name: /history/i }).click();
  const history = viewport.mobile ? page.getByRole("dialog") : page.locator(".panel");
  check(await history.getByRole("heading", { name: "Market history", exact: true }).isVisible(), `${viewport.name} history is not reachable from the date control`);
}

async function run() {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.mobile,
        hasTouch: viewport.mobile,
        reducedMotion: "reduce",
        colorScheme: "dark",
      });
      const page = await context.newPage();
      const flushErrors = await pageErrors(page, viewport.name);

      for (const state of states) {
        await openState(page, viewport, state);
        if ((viewport.name === "stack-390" || viewport.name === "split-1440") && ["representative", "stale", "quiet", "partial"].includes(state)) {
          await page.screenshot({ path: path.join(outputDir, `${viewport.name}-${state}.png`), fullPage: true });
        }
      }

      if (viewport.name === "stack-390" || viewport.name === "split-1440") {
        await verifyStoryDetail(page, viewport);
        await verifyMarketsAndSettings(page, viewport);
        await verifyNavigation(page, viewport);
      }

      flushErrors();
      results.push({ viewport: viewport.name, states: states.length, status: "tested" });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({ baseUrl, outputDir, results, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}

await run();
