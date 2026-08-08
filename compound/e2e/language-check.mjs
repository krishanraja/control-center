import { chromium } from "@playwright/test";

/**
 * Reading level gate.
 *
 * COMPOUND is written for someone who has never bought a share, so "a fifteen
 * year old can read this" has to be measured rather than claimed. This walks
 * the running app, opens everything that hides text, pulls what a reader
 * actually sees, and scores it.
 *
 * Flesch Kincaid grade level: 0.39 x (words per sentence) + 11.8 x (syllables
 * per word) - 15.59. Grade 9 is the last year a fifteen year old has finished,
 * so 9.0 is the ceiling. Figures, tickers and currency are stripped first,
 * because "A$41,844" is not a word and syllable counting cannot read it.
 *
 * It also fails on em dashes and on the words the house voice does not use.
 */

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const GRADE_CEILING = 9;

const BANNED = [
  "excited", "thrilled", "seamless", "empower", "journey", "landscape", "ecosystem",
  "game-changer", "game-changing", "revolutionary", "cutting-edge", "robust", "leverage",
  "utilise", "facilitate", "paradigm", "tapestry", "moreover", "furthermore", "groundbreaking",
  "innovative", "synergy", "holistic", "spearhead", "deep dive", "unpack", "delve", "harness",
  "unleash", "elevate", "supercharge", "foster", "cultivate", "crucial", "pivotal", "testament",
  "boasts", "underscores", "mission-critical", "best-in-class", "transformative",
];

// Finance words that a fifteen year old would have to look up. Every one of
// these has a plain replacement in lib/words.ts.
const JARGON = [
  "revenue", "equity", "valuation", "portfolio", "allocation", "diversification",
  "correlation", "volatility", "liquidity", "yield curve", "basis points", "sentiment",
  "amortis", "capital expenditure", "ebitda", "p/e", "price-to-earnings", "gross margin",
  "market capitalisation", "arbitrage", "hedge", "derivative", "thesis", "conviction",
];

function syllables(word) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return 0;
  if (clean.length <= 3) return 1;
  const trimmed = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return (trimmed.match(/[aeiouy]{1,2}/g) ?? []).length || 1;
}

function score(text) {
  // Strip anything that is a figure rather than a word: currency, percentages,
  // dates and ticker symbols all break a syllable count.
  const prose = text
    .replace(/A?\$[\d,.]+[A-Za-z]?/g, "")
    .replace(/[-+]?\d[\d,.]*%?/g, "")
    .replace(/\b[A-Z]{2,5}\b/g, "")
    .replace(/\s+/g, " ");
  const sentences = prose.split(/[.!?]+(?:\s|$)/).map((entry) => entry.trim()).filter((entry) => entry.split(/\s+/).length > 2);
  const words = prose.split(/\s+/).filter((word) => /[a-zA-Z]/.test(word));
  if (!sentences.length || !words.length) return null;
  const totalSyllables = words.reduce((carry, word) => carry + syllables(word), 0);
  const grade = 0.39 * (words.length / sentences.length) + 11.8 * (totalSyllables / words.length) - 15.59;
  return {
    grade: Number(grade.toFixed(2)),
    words: words.length,
    sentences: sentences.length,
    wordsPerSentence: Number((words.length / sentences.length).toFixed(1)),
  };
}

/**
 * The sentences COMPOUND wrote, not the names it was handed. Company and
 * industry names arrive from a feed, and scoring "Cognizant Technology
 * Solutions Corporation" as prose measures the feed rather than the writing.
 */
const PROSE = [
  "h1", "h2", "h3", ".sub", ".ch", ".cnext", ".cbody p", ".keynote", ".footnote",
  ".verdict p", ".ans p", ".degraded p", ".tracknow", ".tile .d", ".tile .lbl",
  ".navblurb", ".railnote", ".src", ".evline span:first-child", ".hint", ".migcap",
  ".cworld-preview", ".cworld-summary", ".groupcopy .ts",
].join(", ");

/** Opens everything that folds away, so hidden copy is scored too. */
async function revealAll(page) {
  const cards = page.locator(".chead");
  for (let index = 0; index < await cards.count(); index += 1) {
    const card = cards.nth(index);
    if (await card.getAttribute("aria-expanded") === "false") await card.click();
  }
}

async function proseIn(page, root) {
  return page.evaluate(([root, selectors]) => {
    const scope = document.querySelector(root);
    if (!scope) return "";
    return Array.from(scope.querySelectorAll(selectors))
      .map((element) => element.textContent?.trim() ?? "")
      .filter(Boolean)
      .map((line) => (/[.!?]$/.test(line) ? line : `${line}.`))
      .join(" ");
  }, [root, PROSE]);
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const page = await context.newPage();
const collected = [];
const failures = [];

try {
  for (const [tab, label] of [["now", "Today"], ["shifts", "Big trends"], ["stocks", "Stocks"], ["mine", "My money"], ["ask", "Ask a question"]]) {
    await page.goto(`${baseUrl}/?tab=${tab}`, { waitUntil: "networkidle" });
    await page.getByRole("navigation", { name: "Sections" }).waitFor();
    await revealAll(page);
    collected.push({ where: label, text: await proseIn(page, ".page") });
  }

  // The detail surfaces carry the densest explanations, so score them too.
  await page.goto(`${baseUrl}/?tab=stocks`, { waitUntil: "networkidle" });
  await page.locator("button.srow").first().click();
  await page.locator(".panelbody").waitFor();
  collected.push({ where: "One stock", text: await proseIn(page, ".panelbody") });

  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator(".panelbody").waitFor();
  collected.push({ where: "Settings", text: await proseIn(page, ".panelbody") });

  const report = collected.map((entry) => ({ where: entry.where, ...score(entry.text) }));
  const all = score(collected.map((entry) => entry.text).join("\n"));

  for (const entry of report) {
    if (entry.grade > GRADE_CEILING) failures.push(`${entry.where} reads at grade ${entry.grade}, above the ${GRADE_CEILING} ceiling`);
  }

  const haystack = collected.map((entry) => entry.text).join("\n").toLowerCase();
  if (haystack.includes("—") || haystack.includes("–")) failures.push("Copy contains a dash that should be a comma, a full stop or brackets");
  for (const word of BANNED) {
    if (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystack)) failures.push(`Copy uses "${word}"`);
  }
  for (const word of JARGON) {
    if (haystack.includes(word)) failures.push(`Copy uses the finance term "${word}" with no plain replacement`);
  }

  console.log(JSON.stringify({ ceiling: GRADE_CEILING, overall: all, screens: report, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
