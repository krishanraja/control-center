import type { CoverageReport } from "../model.ts";
import type { ProviderContext, ProviderEvidence, ProviderFailure, ProviderResult } from "./types.ts";
import { collectCoinGecko } from "./coingecko.ts";
import { collectDefiLlama } from "./defillama.ts";
import { collectFmp } from "./fmp.ts";
import { collectFred } from "./fred.ts";

const PROVIDERS = [
  { name: "FRED", domains: ["rates", "credit", "currencies"] as const, collect: collectFred },
  { name: "FMP", domains: ["equities", "commodities"] as const, collect: collectFmp },
  { name: "CoinGecko", domains: ["crypto"] as const, collect: collectCoinGecko },
  { name: "DefiLlama", domains: ["crypto"] as const, collect: collectDefiLlama },
];

export interface CollectionResult {
  evidence: ProviderEvidence;
  successes: ProviderResult[];
  failures: ProviderFailure[];
  coverage: CoverageReport;
}

export async function collectEvidence(context: ProviderContext): Promise<CollectionResult> {
  const settled = await Promise.all(PROVIDERS.map(async (provider) => {
    const started = performance.now();
    try {
      return {
        ok: true as const,
        provider: provider.name,
        evidence: await provider.collect(context),
        latencyMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      return {
        ok: false as const,
        provider: provider.name,
        domains: [...provider.domains],
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Math.round(performance.now() - started),
      };
    }
  }));
  const successes: ProviderResult[] = [];
  const failures: ProviderFailure[] = [];
  for (const item of settled) {
    if (item.ok) {
      successes.push({ provider: item.provider, evidence: item.evidence, latencyMs: item.latencyMs });
    } else {
      failures.push({
        provider: item.provider,
        domains: item.domains,
        error: item.error,
        latencyMs: item.latencyMs,
      });
    }
  }
  const evidence: ProviderEvidence = {
    metrics: successes.flatMap((item) => item.evidence.metrics),
    industries: successes.flatMap((item) => item.evidence.industries),
    raw: Object.fromEntries(successes.map((item) => [item.provider, item.evidence.raw])),
    coverage: successes.flatMap((item) => item.evidence.coverage),
  };
  const failedCoverage = failures.flatMap((failure) =>
    failure.domains.map((domain) => ({
      provider: failure.provider,
      domain,
      status: "failed" as const,
      limitation: failure.error,
      latencyMs: failure.latencyMs,
    }))
  );
  const limitations = [
    ...evidence.coverage.flatMap((source) => source.limitation ? [source.limitation] : []),
    ...failures.map((failure) => `${failure.provider}: ${failure.error}`),
  ];
  return {
    evidence,
    successes,
    failures,
    coverage: {
      asOf: context.asOf,
      sources: [
        ...evidence.coverage.map((source) => ({
          ...source,
          latencyMs: successes.find((item) => item.provider === source.provider)?.latencyMs,
        })),
        ...failedCoverage,
      ],
      limitations,
    },
  };
}
