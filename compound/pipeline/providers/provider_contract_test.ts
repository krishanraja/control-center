import { collectEvidence } from "./collect.ts";
import { collectFmp } from "./fmp.ts";
import { collectFred } from "./fred.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function rememberEnv(names: string[]): Map<string, string | undefined> {
  return new Map(names.map((name) => [name, Deno.env.get(name)]));
}

function restoreEnv(values: Map<string, string | undefined>): void {
  for (const [name, value] of values) {
    if (value === undefined) Deno.env.delete(name);
    else Deno.env.set(name, value);
  }
}

Deno.test("FMP weekend evidence carries the exact prior source date and never requests future data", async () => {
  const originalFetch = globalThis.fetch;
  const environment = rememberEnv(["FMP_API_KEY"]);
  const requested: URL[] = [];
  Deno.env.set("FMP_API_KEY", "fixture-key");
  globalThis.fetch = (input) => {
    const url = new URL(String(input));
    requested.push(url);
    if (url.pathname.endsWith("industry-performance-snapshot")) {
      return Promise.resolve(Response.json([{
        industry: "Software - Application",
        changesPercentage: 1.2,
        date: "2026-08-07",
      }]));
    }
    return Promise.resolve(Response.json([
      { date: "2026-08-06", close: 99 },
      { date: "2026-08-07", close: 100 },
    ]));
  };
  try {
    const evidence = await collectFmp({
      asOf: "2026-08-08",
      reconstructed: false,
      signal: new AbortController().signal,
    });
    const equities = evidence.coverage.find((item) => item.domain === "equities");
    assert(equities?.status === "carried", "Saturday equities must be marked carried");
    assert(equities.sourceDate === "2026-08-07", "Friday must remain the visible source date");
    assert(equities.limitation?.includes("2026-08-07"), "carry-forward limitation must name the date");
    assert(
      requested.filter((url) => url.pathname.endsWith("historical-price-eod/full"))
        .every((url) => url.searchParams.get("to") === "2026-08-08"),
      "historical requests must stop at the target date",
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(environment);
  }
});

Deno.test("FRED reconstruction pins every request to the historical vintage", async () => {
  const originalFetch = globalThis.fetch;
  const environment = rememberEnv(["FRED_API_KEY"]);
  const requested: URL[] = [];
  Deno.env.set("FRED_API_KEY", "fixture-key");
  globalThis.fetch = (input) => {
    const url = new URL(String(input));
    requested.push(url);
    return Promise.resolve(Response.json({ observations: [{ date: "2021-08-11", value: "2.5" }] }));
  };
  try {
    await collectFred({
      asOf: "2021-08-11",
      reconstructed: true,
      signal: new AbortController().signal,
    });
    assert(requested.length === 4, "all four FRED series should be requested");
    assert(
      requested.every((url) => url.searchParams.get("observation_end") === "2021-08-11"),
      "no observation may come after the target date",
    );
    assert(
      requested.every((url) => url.searchParams.get("realtime_start") === "2021-08-11"),
      "vintage start must equal the target date",
    );
    assert(
      requested.every((url) => url.searchParams.get("realtime_end") === "2021-08-11"),
      "vintage end must equal the target date",
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(environment);
  }
});

Deno.test("provider collection preserves supported crypto evidence when required feeds fail", async () => {
  const originalFetch = globalThis.fetch;
  const environment = rememberEnv([
    "FMP_API_KEY",
    "FRED_API_KEY",
    "COINGECKO_API_KEY",
    "COINGECKO_PRO_API_KEY",
  ]);
  for (const name of environment.keys()) Deno.env.delete(name);
  globalThis.fetch = (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.coingecko.com") {
      return Promise.resolve(Response.json({ market_data: { current_price: { usd: 100 } } }));
    }
    if (url.hostname === "api.llama.fi") {
      return Promise.resolve(Response.json({
        totalDataChart: [[Date.parse("2026-08-08T00:00:00Z") / 1_000, 500_000]],
      }));
    }
    return Promise.resolve(new Response(null, { status: 503 }));
  };
  try {
    const result = await collectEvidence({
      asOf: "2026-08-08",
      reconstructed: false,
      signal: new AbortController().signal,
    });
    assert(result.failures.some((item) => item.provider === "FMP"), "FMP failure should be explicit");
    assert(result.failures.some((item) => item.provider === "FRED"), "FRED failure should be explicit");
    assert(
      result.evidence.metrics.some((item) => item.domain === "crypto"),
      "supported crypto evidence must survive",
    );
    assert(
      result.coverage.limitations.some((item) => item.startsWith("FMP:")),
      "partial limitation must name FMP",
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(environment);
  }
});
