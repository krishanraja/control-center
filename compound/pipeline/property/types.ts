/**
 * Property pipeline contracts. Market facts are observations: one number for
 * one area, one metric, one period, from one named source. Everything the tab
 * shows about the market is derived from rows of this shape, so every figure
 * can be traced back to where it came from.
 */

export type ObservationSource = "rta" | "domain" | "qld_open_data" | "rba" | "apify" | "manual";
export type AreaKind = "postcode" | "suburb" | "lga" | "state" | "national" | "building";
export type DwellingType = "unit" | "house" | "townhouse" | "all";

export interface Observation {
  source: ObservationSource;
  areaKind: AreaKind;
  areaCode: string;
  dwellingType: DwellingType | null;
  bedrooms: number | null;
  metric: string;
  periodStart: string;
  periodEnd: string;
  value: number;
  unit: string;
  sourceUrl?: string;
  sourceDate?: string;
  detail?: Record<string, unknown>;
}

export type CoverageStatus = "available" | "carried" | "failed" | "not_configured";

export interface Coverage {
  provider: string;
  status: CoverageStatus;
  sourceDate?: string;
  limitation?: string;
  latencyMs?: number;
}

export interface ProviderEvidence {
  observations: Observation[];
  coverage: Coverage[];
}

export interface Target {
  suburb: string;
  postcode: string;
}

export interface ProviderContext {
  runOn: string;
  targets: Target[];
  subjectPostcode: string;
  subjectBedrooms: number;
  signal: AbortSignal;
  /** Resolves a runtime secret from the environment first, then Supabase Vault. */
  secret: (name: string) => Promise<string | undefined>;
}

export interface ProviderResult {
  provider: string;
  evidence: ProviderEvidence;
  latencyMs: number;
}

export interface ProviderFailure {
  provider: string;
  error: string;
  latencyMs: number;
}

export interface PropertyRow {
  id: string;
  user_id: string;
  slug: string;
  suburb: string;
  postcode: string;
  dwelling_type: DwellingType;
  bedrooms: number;
  bathrooms: number;
  car_spaces: number;
  purchase_price_aud: number;
  settled_on: string;
}

export function emptyEvidence(): ProviderEvidence {
  return { observations: [], coverage: [] };
}
