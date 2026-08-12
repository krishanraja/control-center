import type { CoverageSource, StoryDomain } from "../model.ts";

export interface TimePoint {
  date: string;
  value: number;
}

export interface MetricSeries {
  id: string;
  label: string;
  domain: StoryDomain;
  unit: string;
  provider: string;
  sourceUrl: string;
  points: TimePoint[];
}

export interface IndustryPoint {
  industry: string;
  changePercent: number;
  sourceDate: string;
  sourceUrl: string;
}

export interface ProviderEvidence {
  metrics: MetricSeries[];
  industries: IndustryPoint[];
  raw: Record<string, unknown>;
  coverage: CoverageSource[];
}

export interface ProviderContext {
  asOf: string;
  reconstructed: boolean;
  signal: AbortSignal;
}

export interface ProviderResult {
  provider: string;
  evidence: ProviderEvidence;
  latencyMs: number;
}

export interface ProviderFailure {
  provider: string;
  domains: StoryDomain[];
  error: string;
  latencyMs: number;
}

export function emptyEvidence(): ProviderEvidence {
  return { metrics: [], industries: [], raw: {}, coverage: [] };
}
