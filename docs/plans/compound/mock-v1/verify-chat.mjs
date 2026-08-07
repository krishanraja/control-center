import { chromium } from "file:///C:/Users/krish/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const source = pathToFileURL(path.resolve("index.html")).href;
const browser = await chromium.launch({ headless: true });

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${source}?view=ask`, { waitUntil: "load" });

  const state = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    heading: document.querySelector("#ask-title")?.textContent?.trim(),
    question: document.querySelector(".question p")?.textContent?.trim(),
    evidenceCount: document.querySelectorAll(".evidence-line").length,
    status: document.querySelector("[data-stream-status]")?.textContent?.trim()
  }));

  if (state.documentWidth > state.viewportWidth) {
    throw new Error(`${viewport.width}px ask view overflows by ${state.documentWidth - state.viewportWidth}px`);
  }
  if (state.heading !== "Ask about your money.") throw new Error("Ask heading is missing");
  if (!state.question) throw new Error("Question is missing");
  if (state.evidenceCount !== 2) throw new Error("Answer must show two deterministic evidence rows");
  if (state.status !== "Answer ready") throw new Error("Ready state is not visible");

  await page.getByRole("button", { name: "What changed today?" }).click();
  if ((await page.locator("#ask-input").inputValue()) !== "What changed today?") {
    throw new Error("Suggested question did not populate the input");
  }
  await page.locator("#ask-input").press("Enter");
  if ((await page.locator(".question p").textContent())?.trim() !== "What changed today?") {
    throw new Error("Keyboard send did not preserve the question in the thread");
  }

  console.log(JSON.stringify({ ...viewport, ...state, suggestion: "pass", keyboardSend: "pass" }));
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${source}?view=ask&stream=1`, { waitUntil: "load" });
  const firstLength = (await page.locator("[data-answer-copy]").textContent())?.length || 0;
  await page.waitForTimeout(330);
  const secondLength = (await page.locator("[data-answer-copy]").textContent())?.length || 0;
  if (secondLength <= firstLength) throw new Error("Answer text did not stream progressively");
  await page.waitForFunction(() => document.querySelector("[data-stream-status]")?.textContent === "Answer ready");
  console.log(JSON.stringify({ streamGrowth: `${firstLength}->${secondLength}`, completion: "pass" }));
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${source}?view=ask&stream=1`, { waitUntil: "load" });
  const status = await page.locator("[data-stream-status]").textContent();
  const answerLength = (await page.locator("[data-answer-copy]").textContent())?.length || 0;
  if (status?.trim() !== "Answer ready" || answerLength < 300) {
    throw new Error("Reduced-motion mode must show the complete answer immediately");
  }
  console.log(JSON.stringify({ reducedMotion: "pass", answerLength }));
  await context.close();
}

await browser.close();
