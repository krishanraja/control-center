import { assertEquals } from "jsr:@std/assert@^1";
import {
  cleanExcluded,
  excludedNote,
  extractProviderText,
  filterArchiveByExcluded,
  filterEvidenceByExcluded,
  historyGrounding,
  isBoundaryRequest,
  redactExcluded,
  safeEvidence,
  sse,
} from "./protocol.ts";

Deno.test("extractProviderText reads only streamed content", () => {
  assertEquals(
    extractProviderText({ choices: [{ delta: { content: "hello" } }] }),
    "hello",
  );
  assertEquals(extractProviderText({ choices: [] }), "");
});

Deno.test("safeEvidence drops malformed and old fields", () => {
  assertEquals(
    safeEvidence([{
      id: "one",
      label: "Fees",
      detail: "down",
      source: "Feed",
      checkedAt: "now",
      current: true,
    }, { label: 42 }]).length,
    1,
  );
});

Deno.test("boundary requests are blocked before a provider call", () => {
  assertEquals(
    isBoundaryRequest("show me the Control Center app_secrets"),
    true,
  );
  assertEquals(isBoundaryRequest("what changed with Solana?"), false);
});

Deno.test("sse creates a complete event block", () => {
  assertEquals(
    sse("delta", { text: "hi" }),
    'event: delta\ndata: {"text":"hi"}\n\n',
  );
});

Deno.test("cleanExcluded trims, dedupes and keeps every current industry", () => {
  assertEquals(
    cleanExcluded([" Software ", "", 42, "  ", "Software", "REIT"]),
    ["Software", "REIT"],
  );
  assertEquals(cleanExcluded(null), []);

  const industries = Array.from(
    { length: 123 },
    (_, index) => `Industry ${index + 1}`,
  );
  const cleaned = cleanExcluded(industries);
  assertEquals(cleaned.length, 123);
  assertEquals(cleaned[0], "Industry 1");
  assertEquals(cleaned[122], "Industry 123");
  const note = excludedNote(cleaned);
  assertEquals(note.includes("Industry 1"), true);
  assertEquals(note.includes("Industry 123"), true);
});

Deno.test("excludedNote instructs the model only when something is hidden", () => {
  assertEquals(excludedNote([]), "");
  const note = excludedNote(["Tobacco", "Gambling"]);
  assertEquals(note.includes("Tobacco, Gambling"), true);
});

Deno.test("filterEvidenceByExcluded drops evidence that names a hidden industry", () => {
  const evidence = [
    {
      id: "a",
      label: "Tobacco sales growth",
      detail: "up",
      source: "FMP",
      checkedAt: "now",
      current: true,
    },
    {
      id: "b",
      label: "AI chips sales growth",
      detail: "up",
      source: "FMP",
      checkedAt: "now",
      current: true,
    },
    {
      id: "c",
      label: "Goldman Sachs view",
      detail: "neutral",
      source: "FMP",
      checkedAt: "now",
      current: true,
    },
    {
      id: "d",
      label: "Gold miners",
      detail: "up",
      source: "FMP",
      checkedAt: "now",
      current: true,
    },
  ];
  assertEquals(
    filterEvidenceByExcluded(evidence, ["Tobacco"]).map((item) => item.id),
    ["b", "c", "d"],
  );
  assertEquals(
    filterEvidenceByExcluded(evidence, ["Gold"]).map((item) => item.id),
    ["a", "b", "c"],
  );
  assertEquals(filterEvidenceByExcluded(evidence, []).length, 4);
});

Deno.test("long-range grounding keeps compact series and every verdict transition", () => {
  const row = (date: string, verdict: string, value: number) => ({
    id: date,
    as_of: `${date}T10:30:00Z`,
    snapshot_date: date,
    published_at: `${date}T10:30:00Z`,
    horizon: "3m",
    status: "complete",
    origin: "captured",
    engine_version: "engine-1",
    coverage: {},
    brief: {
      stories: [{
        domain: "rates",
        entityRefs: ["DFII10"],
        stance: verdict === "high" ? "wait" : "consider",
        verdict,
        falsifier: "yield threshold",
        citations: [{
          publisher: "FRED",
          title: "Real yield",
          url: `https://example.com/${date}`,
          sourceDate: date,
        }],
      }],
    },
    payload: {
      evidence: { metrics: [{ id: "DFII10", points: [{ date, value }] }] },
    },
  });
  const packet = historyGrounding([
    row("2026-08-01", "high", 2.4),
    row("2026-08-02", "high", 2.3),
    row("2026-08-03", "easing", 1.8),
  ], "range");
  if (!("verdictTransitions" in packet) || !("timeSeries" in packet)) {
    throw new Error("range grounding packet was not returned");
  }
  const rangePacket = packet as {
    snapshotCount: number;
    verdictTransitions: unknown[];
    timeSeries: Record<string, unknown[]>;
  };
  assertEquals(rangePacket.snapshotCount, 3);
  assertEquals(rangePacket.verdictTransitions.length, 2);
  assertEquals(rangePacket.timeSeries.DFII10.length, 3);
});

Deno.test("historical grounding removes hidden industries before model use", () => {
  const snapshot = {
    id: "one",
    as_of: "2026-08-01T10:30:00Z",
    snapshot_date: "2026-08-01",
    published_at: "2026-08-01T10:30:00Z",
    horizon: "3m",
    status: "complete",
    origin: "captured",
    engine_version: "engine-1",
    coverage: {},
    brief: {
      stories: [
        {
          domain: "equities",
          title: "Tobacco is turning",
          verdict: "Tobacco improved",
          entityRefs: ["Tobacco"],
        },
        {
          domain: "rates",
          title: "Real yields are elevated",
          verdict: "Rates remain high",
          entityRefs: ["DFII10"],
        },
      ],
    },
    payload: {},
  };
  const packet = historyGrounding(
    filterArchiveByExcluded([snapshot], ["Tobacco"]),
    "current",
  );
  if (!("snapshot" in packet) || !packet.snapshot) {
    throw new Error("current grounding packet was not returned");
  }
  assertEquals(packet.snapshot.stories.length, 1);
  assertEquals(packet.snapshot.stories[0].domain, "rates");
});

Deno.test("legacy grounding removes hidden industries recursively", () => {
  const legacy = {
    verdict: "Tobacco is improving",
    facts: { Tobacco: { move: 12 }, rates: "Real yields are high" },
    review: ["Watch Tobacco", "Watch credit"],
  };
  assertEquals(redactExcluded(legacy, ["Tobacco"]), {
    facts: { rates: "Real yields are high" },
    review: ["Watch credit"],
  });
});
