import { describe, expect, it } from "vitest";
import { cleanSummary, contextQuery, hostOf, normalizeExa, normalizePerplexity } from "./context";

describe("contextQuery", () => {
  it("builds one tight, time-bounded query per topic", () => {
    expect(contextQuery("Palantir (PLTR)")).toMatch(/Palantir \(PLTR\).*last two weeks/);
  });
});

describe("cleanSummary", () => {
  it("strips citation markers and collapses whitespace", () => {
    expect(cleanSummary("PLTR jumped [1] after a beat[12].  Analysts stay bullish[3].")).toBe(
      "PLTR jumped after a beat. Analysts stay bullish.",
    );
  });

  it("caps to a whole sentence rather than a hard cut", () => {
    const long = `${"A".repeat(200)}. ${"B".repeat(200)}. tail`;
    const out = cleanSummary(long);
    expect(out.length).toBeLessThanOrEqual(360);
    expect(out.endsWith(".")).toBe(true);
  });
});

describe("hostOf", () => {
  it("returns a bare hostname", () => {
    expect(hostOf("https://www.reuters.com/markets/x")).toBe("reuters.com");
    expect(hostOf("not a url")).toBe("not a url");
  });
});

describe("normalizePerplexity", () => {
  it("prefers titled search results and dedupes to a cap", () => {
    const ctx = normalizePerplexity({
      choices: [{ message: { content: "Solana fees fell [1] while deposits held [2]." } }],
      search_results: [
        { title: "Reuters: Solana", url: "https://reuters.com/a" },
        { title: "Dup", url: "https://reuters.com/a" },
        { title: "CNBC", url: "https://cnbc.com/b" },
      ],
    }, "2026-08-08");
    expect(ctx?.summary).toBe("Solana fees fell while deposits held.");
    expect(ctx?.citations).toEqual([
      { title: "Reuters: Solana", url: "https://reuters.com/a" },
      { title: "CNBC", url: "https://cnbc.com/b" },
    ]);
    expect(ctx?.via).toBe("perplexity");
  });

  it("falls back to citation urls when there are no search results", () => {
    const ctx = normalizePerplexity({
      choices: [{ message: { content: "Something happened." } }],
      citations: ["https://www.wsj.com/x"],
    }, "2026-08-08");
    expect(ctx?.citations).toEqual([{ title: "wsj.com", url: "https://www.wsj.com/x" }]);
  });

  it("returns null when there is no usable content", () => {
    expect(normalizePerplexity({ choices: [] }, "2026-08-08")).toBeNull();
  });
});

describe("normalizeExa", () => {
  it("builds a summary from the first snippet and lists sources", () => {
    const ctx = normalizeExa({
      results: [
        { title: "FT", url: "https://ft.com/a", highlights: ["Rates are priced to stay higher for longer."] },
        { title: "BBG", url: "https://bloomberg.com/b" },
      ],
    }, "2026-08-08");
    expect(ctx?.summary).toBe("Rates are priced to stay higher for longer.");
    expect(ctx?.citations.map((c) => c.url)).toEqual(["https://ft.com/a", "https://bloomberg.com/b"]);
    expect(ctx?.via).toBe("exa");
  });

  it("returns null when there are no results", () => {
    expect(normalizeExa({ results: [] }, "2026-08-08")).toBeNull();
  });
});
