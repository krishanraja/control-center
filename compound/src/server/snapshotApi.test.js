import { describe, expect, it } from "vitest";
import { compareSnapshots, readRows } from "./snapshotApi.js";

function snapshot(date, overrides = {}) {
  return {
    snapshot_date: date,
    brief: {
      stories: [{
        id: `rates-${date}`,
        domain: "rates",
        entityRefs: ["DFII10"],
        verdict: "Real yields are elevated.",
        stance: "wait",
        falsifier: "Real yields fall below 1.5%.",
        falsifierState: "untriggered",
        decisiveMetric: { value: "2.4%", label: "Real yield", direction: "flat" },
        citations: [{ title: "FRED", url: "https://fred.example/old" }],
      }],
    },
    coverage: { sources: [{ provider: "FRED", domain: "rates", status: "available" }] },
    payload: { evidence: { metrics: [{ id: "DFII10", points: [{ value: 2.4 }] }] } },
    ...overrides,
  };
}

describe("private snapshot API helpers", () => {
  it("denies an anonymous read before contacting storage", async () => {
    const result = await readRows({ headers: {} }, "daily_snapshots?limit=1");
    expect(result.status).toBe(401);
  });

  it("leads comparison with verdict and evidence changes", () => {
    const from = snapshot("2026-08-10");
    const to = snapshot("2026-08-11", {
      brief: {
        stories: [{
          ...from.brief.stories[0],
          id: "rates-2026-08-11",
          verdict: "Real yields are easing.",
          stance: "consider",
          falsifierState: "triggered",
          decisiveMetric: { value: "1.4%", label: "Real yield", direction: "down" },
          citations: [{ title: "FRED", url: "https://fred.example/new" }],
        }],
      },
      coverage: { sources: [{ provider: "FRED", domain: "rates", status: "carried" }] },
      payload: { evidence: { metrics: [{ id: "DFII10", points: [{ value: 1.4 }] }] } },
    });
    const result = compareSnapshots(from, to);
    expect(result.changedVerdicts).toHaveLength(1);
    expect(result.newEvidence).toHaveLength(1);
    expect(result.falsifierTransitions[0].to).toBe("triggered");
    expect(result.capitalMovement[0].to).toBe("1.4%");
    expect(result.coverageDifferences).toHaveLength(1);
    expect(result.rawMetricDeltas[0].delta).toBeCloseTo(-1);
  });
});
