export const SNAPSHOT_SCHEMA_VERSION = 2;
export const ENGINE_VERSION = "compound-brief/1.0.0";

export type SnapshotOrigin = "captured" | "reconstructed" | "starter";
export type SnapshotStatus = "complete" | "partial" | "quiet";
export type BriefState = "representative" | "quiet";
export type StoryDomain =
  | "equities"
  | "rates"
  | "credit"
  | "currencies"
  | "commodities"
  | "crypto"
  | "macro";
export type StoryClassification = "opportunity" | "risk" | "regime";
export type StoryStance = "consider" | "wait" | "avoid";

export interface Citation {
  publisher: string;
  title: string;
  url: string;
  sourceDate: string;
  retrievedAt: string;
  evidenceType: "primary" | "secondary";
}

export interface DecisiveMetric {
  value: string;
  label: string;
  sourceDate: string;
  direction?: "up" | "down" | "flat";
}

export interface SignificanceFactors {
  magnitudePercentile: number;
  persistence: number;
  breadth: number;
  novelty: number;
  crossAssetConfirmation: number;
  evidenceQuality: number;
}

export interface StoryCandidate {
  id: string;
  domain: StoryDomain;
  classification: StoryClassification;
  title: string;
  verdict: string;
  stance: StoryStance;
  significance: number;
  confidence: number;
  decisiveMetric: DecisiveMetric;
  falsifier: string;
  falsifierState: "untriggered" | "triggered" | "resolved";
  entityRefs: string[];
  coverage: string[];
  citations: Citation[];
  scoreFactors: SignificanceFactors;
  emerging?: boolean;
  portfolioAnnotation?: string;
  worldContext?: WorldContext;
}

export interface WorldContext {
  summary: string;
  citations: Array<{ title: string; url: string }>;
  asOf: string;
  via: "perplexity" | "exa";
}

export interface BriefStory extends StoryCandidate {
  rank: 1 | 2 | 3;
  selectionScore: number;
}

export interface CoverageSource {
  provider: string;
  domain: StoryDomain;
  status: "available" | "carried" | "failed" | "not_configured";
  sourceDate?: string;
  limitation?: string;
  latencyMs?: number;
}

export interface CoverageReport {
  asOf: string;
  sources: CoverageSource[];
  limitations: string[];
}

export interface DailyBrief {
  state: BriefState;
  asOf: string;
  generatedAt: string;
  engineVersion: string;
  stories: [BriefStory, BriefStory, BriefStory];
  coverageLimitations: string[];
}

export interface ArchivedSnapshot {
  snapshotDate: string;
  publishedAt: string;
  schemaVersion: number;
  engineVersion: string;
  origin: SnapshotOrigin;
  status: SnapshotStatus;
  horizon: "3m" | "1y";
  coverage: CoverageReport;
  brief: DailyBrief;
  evidence: Record<string, unknown>;
}

export interface BriefBuildInput {
  asOf: string;
  generatedAt: string;
  candidates: StoryCandidate[];
  stableCheckpoints: StoryCandidate[];
  coverageLimitations?: string[];
}
