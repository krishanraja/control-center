import { describe, expect, it } from "vitest";
import {
  cleanSummary,
  contextPreview,
  contextQuery,
  contextSourceLine,
  hasCitedContext,
  hostOf,
  normalizeExa,
  normalizePerplexity,
  truncateWords,
} from "./context";

describe("contextQuery", () => {
  it("builds one tight, time-bounded query per topic", () => {
    expect(contextQuery("Palantir (PLTR)")).toMatch(/Palantir \(PLTR\).*last two weeks/);
  });
});

describe("summary presentation", () => {
  it("strips citation markers and provider Markdown", () => {
    expect(cleanSummary("## Update\n**PLTR jumped** [1] after a `beat`.  Analysts stay bullish[3].")).toBe(
      "Update PLTR jumped after a beat. Analysts stay bullish.",
    );
  });

  it("caps summaries and previews at whole words", () => {
    const long = Array.from({ length: 90 }, (_, index) => `word${index}`).join(" ");
    const summary = cleanSummary(long);
    const preview = contextPreview(long);
    expect(summary.length).toBeLessThanOrEqual(360);
    expect(preview.length).toBeLessThanOrEqual(160);
    expect(summary.endsWith("…")).toBe(true);
    expect(preview.endsWith("…")).toBe(true);
    expect(truncateWords("x".repeat(200), 160)).toBe("");
  });

  it("uses a concise first sentence when one is available", () => {
    expect(contextPreview("Fees fell while deposits held. Analysts disagree on the recovery."))
      .toBe("Fees fell while deposits held.");
  });
});

describe("citation safety", () => {
  it("returns only safe hostnames", () => {
    expect(hostOf("https://www.reuters.com/markets/x")).toBe("reuters.com");
    expect(hostOf("javascript:alert(1)")).toBe("");
    expect(hostOf("not a url")).toBe("");
  });

  it("builds compact source metadata", () => {
    expect(contextSourceLine({
      summary: "Something happened.",
      citations: [
        { title: "Reuters", url: "https://reuters.com/a" },
        { title: "FT", url: "https://ft.com/b" },
      ],
      asOf: "2026-08-08",
      via: "demo",
    })).toBe("reuters.com +1 source");
  });
});

describe("normalizePerplexity", () => {
  it("prefers titled search results, removes unsafe URLs and dedupes", () => {
    const context = normalizePerplexity({
      choices: [{ message: { content: "**Solana fees fell** [1] while deposits held [2]." } }],
      search_results: [
        { title: "Reuters: Solana", url: "https://reuters.com/a" },
        { title: "Dup", url: "https://reuters.com/a" },
        { title: "Unsafe", url: "javascript:alert(1)" },
        { title: "CNBC", url: "https://cnbc.com/b" },
      ],
    }, "2026-08-08");
    expect(context?.summary).toBe("Solana fees fell while deposits held.");
    expect(context?.citations).toEqual([
      { title: "Reuters: Solana", url: "https://reuters.com/a" },
      { title: "CNBC", url: "https://cnbc.com/b" },
    ]);
    expect(context?.via).toBe("perplexity");
  });

  it("falls back to safe citation URLs when search results are absent", () => {
    const context = normalizePerplexity({
      choices: [{ message: { content: "Something happened." } }],
      citations: ["https://www.wsj.com/x"],
    }, "2026-08-08");
    expect(context?.citations).toEqual([{ title: "wsj.com", url: "https://www.wsj.com/x" }]);
  });

  it("returns null without usable content and at least one citation", () => {
    expect(normalizePerplexity({ choices: [] }, "2026-08-08")).toBeNull();
    expect(normalizePerplexity({ choices: [{ message: { content: "Uncited." } }] }, "2026-08-08")).toBeNull();
  });
});

describe("normalizeExa", () => {
  it("builds a summary from the first snippet and lists sources", () => {
    const context = normalizeExa({
      results: [
        { title: "FT", url: "https://ft.com/a", highlights: ["Rates are priced to stay higher for longer."] },
        { title: "BBG", url: "https://bloomberg.com/b" },
      ],
    }, "2026-08-08");
    expect(context?.summary).toBe("Rates are priced to stay higher for longer.");
    expect(context?.citations.map((citation) => citation.url)).toEqual(["https://ft.com/a", "https://bloomberg.com/b"]);
    expect(context?.via).toBe("exa");
    expect(hasCitedContext(context)).toBe(true);
  });

  it("returns null without both a snippet and citations", () => {
    expect(normalizeExa({ results: [] }, "2026-08-08")).toBeNull();
    expect(normalizeExa({ results: [{ title: "No URL", highlights: ["Text"] }] }, "2026-08-08")).toBeNull();
  });
});
