import { buildDailyBrief, scoreCandidate } from "./intelligence.ts";
import type { StoryCandidate, StoryDomain } from "./model.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function candidate(id: string, domain: StoryDomain, score: number): StoryCandidate {
  return {
    id,
    domain,
    classification: score > 0.7 ? "opportunity" : "regime",
    title: `${id} title`,
    verdict: `${id} verdict`,
    stance: score > 0.7 ? "consider" : "wait",
    significance: score,
    confidence: 0.8,
    decisiveMetric: { value: "1", label: id, sourceDate: "2026-08-11" },
    falsifier: `${id} falsifier`,
    falsifierState: "untriggered",
    entityRefs: [],
    coverage: [domain],
    citations: [{
      publisher: "Primary source",
      title: id,
      url: `https://example.com/${id}`,
      sourceDate: "2026-08-11",
      retrievedAt: "2026-08-11T10:30:00Z",
      evidenceType: "primary",
    }],
    scoreFactors: {
      magnitudePercentile: score,
      persistence: score,
      breadth: score,
      novelty: score,
      crossAssetConfirmation: score,
      evidenceQuality: 0.9,
    },
  };
}

Deno.test("ranking is deterministic and prefers distinct domains", () => {
  const brief = buildDailyBrief({
    asOf: "2026-08-11",
    generatedAt: "2026-08-11T10:30:00Z",
    candidates: [
      candidate("equities-a", "equities", 0.95),
      candidate("equities-b", "equities", 0.94),
      candidate("rates", "rates", 0.8),
      candidate("crypto", "crypto", 0.75),
    ],
    stableCheckpoints: [],
  });
  assert(brief.stories.length === 3, "brief must have exactly three stories");
  assert(new Set(brief.stories.map((story) => story.domain)).size === 3, "domains should be diverse");
  assert(brief.stories[0].id === "equities-a", "highest score should lead");
});

Deno.test("holdings cannot change ranking because they are not an engine input", () => {
  const inputs = {
    asOf: "2026-08-11",
    generatedAt: "2026-08-11T10:30:00Z",
    candidates: [
      candidate("rates", "rates", 0.9),
      candidate("equities", "equities", 0.8),
      candidate("crypto", "crypto", 0.7),
    ],
    stableCheckpoints: [],
  };
  const before = buildDailyBrief(inputs).stories.map((story) => story.id);
  const after = buildDailyBrief(structuredClone(inputs)).stories.map((story) => story.id);
  assert(JSON.stringify(before) === JSON.stringify(after), "same evidence must produce the same ranking");
});

Deno.test("quiet days contain one lead and two supported checkpoints", () => {
  const brief = buildDailyBrief({
    asOf: "2026-08-11",
    generatedAt: "2026-08-11T10:30:00Z",
    candidates: [candidate("weak", "equities", 0.2)],
    stableCheckpoints: [candidate("credit-stable", "credit", 0.4), candidate("rates-stable", "rates", 0.4)],
  });
  assert(brief.state === "quiet", "brief should be quiet");
  assert(brief.stories[0].title === "Nothing needs action", "quiet lead copy should be stable");
  assert(brief.stories.length === 3, "quiet brief must still have three positions");
});

Deno.test("one significant story is completed by supported checkpoints", () => {
  const brief = buildDailyBrief({
    asOf: "2026-08-11",
    generatedAt: "2026-08-11T10:30:00Z",
    candidates: [candidate("equity-breakout", "equities", 0.9)],
    stableCheckpoints: [candidate("credit-stable", "credit", 0.4), candidate("rates-stable", "rates", 0.4)],
  });
  assert(brief.state === "representative", "a significant story should lead a representative brief");
  assert(brief.stories.length === 3, "supported checkpoints should complete the brief");
  assert(brief.stories[0].id === "equity-breakout", "the significant story should remain first");
});

Deno.test("unsupported claims never enter a published brief", () => {
  const unsupported = candidate("unsupported", "crypto", 1);
  unsupported.citations = [];
  let error = "";
  try {
    buildDailyBrief({
      asOf: "2026-08-11",
      generatedAt: "2026-08-11T10:30:00Z",
      candidates: [unsupported],
      stableCheckpoints: [],
    });
  } catch (caught) {
    error = String(caught);
  }
  assert(error.includes("two supported stability checkpoints"), "unsupported data must fail closed");
});

Deno.test("candidate score remains bounded", () => {
  const item = candidate("bounded", "macro", 10);
  assert(scoreCandidate(item) <= 1, "score cannot exceed one");
});
