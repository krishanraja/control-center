import type { Coverage, ProviderContext, ProviderEvidence, ProviderFailure, ProviderResult } from "./types.ts";
import { collectDomain } from "./providers/domain.ts";
import { collectRba } from "./providers/rba.ts";
import { collectRta } from "./providers/rta.ts";

export const PROVIDERS: Array<{ name: string; collect: (context: ProviderContext) => Promise<ProviderEvidence> }> = [
  { name: "RBA", collect: collectRba },
  { name: "RTA", collect: collectRta },
  { name: "Domain", collect: collectDomain },
];

export interface CollectionResult {
  evidence: ProviderEvidence;
  successes: ProviderResult[];
  failures: ProviderFailure[];
  coverage: Coverage[];
}

/** Every provider runs; one failing never stops the others. */
export async function collectMarket(context: ProviderContext, providers = PROVIDERS): Promise<CollectionResult> {
  const settled = await Promise.all(providers.map(async (provider) => {
    const started = performance.now();
    try {
      const evidence = await provider.collect(context);
      return { ok: true as const, provider: provider.name, evidence, latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      return {
        ok: false as const,
        provider: provider.name,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Math.round(performance.now() - started),
      };
    }
  }));
  const successes: ProviderResult[] = [];
  const failures: ProviderFailure[] = [];
  for (const item of settled) {
    if (item.ok) successes.push({ provider: item.provider, evidence: item.evidence, latencyMs: item.latencyMs });
    else failures.push({ provider: item.provider, error: item.error, latencyMs: item.latencyMs });
  }
  const coverage: Coverage[] = [
    ...successes.flatMap((item) => item.evidence.coverage.map((source) => ({ ...source, latencyMs: item.latencyMs }))),
    ...failures.map((failure) => ({
      provider: failure.provider,
      status: "failed" as const,
      limitation: failure.error,
      latencyMs: failure.latencyMs,
    })),
  ];
  return {
    evidence: {
      observations: successes.flatMap((item) => item.evidence.observations),
      coverage,
    },
    successes,
    failures,
    coverage,
  };
}
