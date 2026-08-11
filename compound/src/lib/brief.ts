import { z } from "zod";
import { DEMO_CONTEXT } from "./contextDemo";
import { loadDemoSnapshot } from "./snapshot";
import type {
  BriefStory,
  CompoundDay,
  DailyBrief,
  Snapshot,
  StoryClassification,
  StoryDomain,
  StoryStance,
} from "../types";

const domain = z.enum(["equities", "rates", "credit", "currencies", "commodities", "crypto", "macro"]);
const citation = z.object({
  publisher: z.string(),
  title: z.string(),
  url: z.string().url(),
  sourceDate: z.string(),
  retrievedAt: z.string(),
  evidenceType: z.enum(["primary", "secondary"]),
});
const story = z.object({
  id: z.string(),
  rank: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  domain,
  classification: z.enum(["opportunity", "risk", "regime"]),
  title: z.string(),
  verdict: z.string(),
  stance: z.enum(["consider", "wait", "avoid"]),
  significance: z.number(),
  confidence: z.number(),
  decisiveMetric: z.object({
    value: z.string(),
    label: z.string(),
    sourceDate: z.string(),
    direction: z.enum(["up", "down", "flat"]).optional(),
  }),
  falsifier: z.string(),
  falsifierState: z.enum(["untriggered", "triggered", "resolved"]),
  entityRefs: z.array(z.string()),
  coverage: z.array(z.string()),
  citations: z.array(citation),
  emerging: z.boolean().optional(),
  portfolioAnnotation: z.string().optional(),
  worldContext: z.object({
    summary: z.string(),
    citations: z.array(z.object({ title: z.string(), url: z.string().url() })),
    asOf: z.string(),
    via: z.enum(["perplexity", "exa", "demo"]),
  }).optional(),
});
const evidence = z.object({
  metrics: z.array(z.object({
    id: z.string(),
    label: z.string(),
    domain,
    unit: z.string(),
    provider: z.string(),
    sourceUrl: z.string().url(),
    points: z.array(z.object({ date: z.string(), value: z.number() })),
  })).optional(),
  industries: z.array(z.object({
    industry: z.string(),
    changePercent: z.number(),
    sourceDate: z.string(),
    sourceUrl: z.string().url(),
  })).optional(),
  portfolio: z.object({
    totalAud: z.number(),
    investedAud: z.number().optional(),
    cashAud: z.number(),
    cryptoPct: z.number(),
    largest: z.string(),
    largestPct: z.number(),
  }).optional(),
  holdings: z.array(z.object({
    symbol: z.string(),
    name: z.string(),
    kind: z.enum(["crypto", "equity"]),
    valueAud: z.number(),
    pct: z.number(),
    price: z.number().nullable(),
    d1: z.number().nullable(),
    d7: z.number().nullable().optional(),
    d30: z.number().nullable().optional(),
  })).optional(),
}).passthrough();

export const archivedSnapshotSchema = z.object({
  id: z.string(),
  snapshot_date: z.string(),
  published_at: z.string(),
  schema_version: z.number(),
  engine_version: z.string(),
  origin: z.enum(["captured", "reconstructed", "starter"]),
  status: z.enum(["complete", "partial", "quiet"]),
  horizon: z.enum(["3m", "1y"]),
  coverage: z.object({
    asOf: z.string(),
    sources: z.array(z.object({
      provider: z.string(),
      domain,
      status: z.enum(["available", "carried", "failed", "not_configured"]),
      sourceDate: z.string().optional(),
      limitation: z.string().optional(),
      latencyMs: z.number().optional(),
    })),
    limitations: z.array(z.string()),
  }),
  brief: z.object({
    state: z.enum(["representative", "quiet"]),
    asOf: z.string(),
    generatedAt: z.string(),
    engineVersion: z.string(),
    stories: z.tuple([story, story, story]),
    coverageLimitations: z.array(z.string()),
  }),
  payload: z.object({ evidence: evidence.optional() }).passthrough(),
});

export function parseArchivedSnapshot(value: unknown) {
  const parsed = archivedSnapshotSchema.safeParse(value);
  if (!parsed.success) throw new Error("The COMPOUND snapshot arrived in an unsupported shape.");
  return parsed.data;
}

export function parseArchivedTimeline(value: unknown) {
  const parsed = z.array(archivedSnapshotSchema).safeParse(value);
  if (!parsed.success) throw new Error("The COMPOUND timeline arrived in an unsupported shape.");
  return parsed.data;
}

function demoStory(input: {
  id: string;
  rank: 1 | 2 | 3;
  domain: StoryDomain;
  classification: StoryClassification;
  title: string;
  verdict: string;
  stance: StoryStance;
  value: string;
  label: string;
  date: string;
  falsifier: string;
  publisher: string;
  url: string;
  worldContext?: BriefStory["worldContext"];
}): BriefStory {
  return {
    id: input.id,
    rank: input.rank,
    domain: input.domain,
    classification: input.classification,
    title: input.title,
    verdict: input.verdict,
    stance: input.stance,
    significance: 0.8,
    confidence: 0.84,
    decisiveMetric: { value: input.value, label: input.label, sourceDate: input.date },
    falsifier: input.falsifier,
    falsifierState: "untriggered",
    entityRefs: [input.id],
    coverage: [input.publisher],
    citations: [{
      publisher: input.publisher,
      title: input.label,
      url: input.url,
      sourceDate: input.date,
      retrievedAt: `${input.date}T11:30:00.000Z`,
      evidenceType: "primary",
    }],
    worldContext: input.worldContext,
  };
}

function demoBrief(snapshot: Snapshot, requestedState?: string | null): DailyBrief {
  const date = snapshot.generated.slice(0, 10);
  const services = snapshot.migration["IT services & consulting"]?.members ?? [];
  const accelerating = services.filter((member) => member.prevGrowth != null && member.growth > member.prevGrowth).length;
  const quiet = requestedState === "quiet";
  const rates = demoStory({
    id: quiet ? "quiet-demo" : "rates-demo",
    rank: 1,
    domain: "rates",
    classification: "regime",
    title: quiet ? "Nothing needs action" : "Markets are calm, but money is still expensive.",
    verdict: quiet
      ? "No market-wide signal cleared COMPOUND's significance threshold."
      : "Easy upside is limited while the real cost of capital stays here.",
    stance: "wait",
    value: quiet ? "Stable" : `${snapshot.macro.real10?.toFixed(2) ?? "2.41"}%`,
    label: quiet ? "market-wide signal check" : "10-year real yield",
    date,
    falsifier: quiet
      ? "This changes when a supported signal clears the significance threshold."
      : "This changes if real yields fall while credit spreads stay contained.",
    publisher: "FRED",
    url: "https://fred.stlouisfed.org/series/DFII10",
    worldContext: DEMO_CONTEXT.n3,
  });
  const servicesStory = demoStory({
    id: "services-demo",
    rank: 2,
    domain: "equities",
    classification: quiet ? "regime" : "opportunity",
    title: quiet ? "IT services growth held its recent pace." : "IT services are outrunning the replacement story.",
    verdict: `${accelerating} of ${services.length} tracked firms grew faster than a year earlier.`,
    stance: quiet ? "wait" : "consider",
    value: `${accelerating} of ${services.length}`,
    label: "firms accelerating sales growth",
    date,
    falsifier: "This changes if fewer than half of the tracked firms keep accelerating.",
    publisher: "FMP",
    url: "https://financialmodelingprep.com/",
    worldContext: DEMO_CONTEXT.n1,
  });
  const cryptoStory = demoStory({
    id: "crypto-demo",
    rank: 3,
    domain: quiet ? "credit" : "crypto",
    classification: quiet ? "regime" : "risk",
    title: quiet ? "High-yield spreads stayed contained." : "Crypto is moving at the edges, not across the market.",
    verdict: quiet
      ? "Credit is not confirming broad market stress."
      : "The aggregate move is too small to confirm a market-wide crypto turn.",
    stance: quiet ? "wait" : "avoid",
    value: quiet ? `${snapshot.macro.hyOAS?.toFixed(2) ?? "3.08"}%` : `${snapshot.cryptoGlobal.mcapChange?.toFixed(2) ?? "0.38"}%`,
    label: quiet ? "high-yield spread" : "crypto market value change",
    date,
    falsifier: quiet ? "This changes if the spread rises above 5%." : "This changes if breadth and network use rise together.",
    publisher: quiet ? "FRED" : "CoinGecko",
    url: quiet ? "https://fred.stlouisfed.org/series/BAMLH0A0HYM2" : "https://www.coingecko.com/",
    worldContext: quiet ? undefined : DEMO_CONTEXT.n2,
  });
  return {
    state: quiet ? "quiet" : "representative",
    asOf: date,
    generatedAt: snapshot.generated,
    engineVersion: "compound-brief/demo",
    stories: [rates, servicesStory, cryptoStory],
    coverageLimitations: requestedState === "partial" ? ["MarketAux was unavailable. Price and primary-data claims remain current."] : [],
  };
}

export function buildDemoDay(snapshot: Snapshot, requestedState?: string | null): CompoundDay {
  const brief = demoBrief(snapshot, requestedState);
  const forceFresh = requestedState === "representative" || requestedState === "quiet" || requestedState === "partial";
  const publishedAt = forceFresh ? new Date().toISOString() : snapshot.generated;
  return {
    legacy: snapshot,
    archive: {
      id: "demo-snapshot",
      snapshot_date: brief.asOf,
      published_at: publishedAt,
      schema_version: 2,
      engine_version: brief.engineVersion,
      origin: "captured",
      status: brief.state === "quiet" ? "quiet" : requestedState === "partial" ? "partial" : "complete",
      horizon: "3m",
      coverage: {
        asOf: brief.asOf,
        sources: [
          { provider: "FRED", domain: "rates", status: "available", sourceDate: brief.asOf },
          { provider: "FMP", domain: "equities", status: "available", sourceDate: brief.asOf },
          { provider: "CoinGecko", domain: "crypto", status: "available", sourceDate: brief.asOf },
        ],
        limitations: brief.coverageLimitations,
      },
      brief,
      payload: { evidence: { portfolio: snapshot.portfolio, holdings: snapshot.holdings } },
    },
  };
}

export function isStale(day: CompoundDay, now = Date.now()): boolean {
  return now - Date.parse(day.archive.published_at) > 30 * 60 * 60 * 1_000;
}

export async function loadCompoundDay(options: {
  mode: "demo" | "live";
  accessToken?: string;
  signal?: AbortSignal;
}): Promise<CompoundDay> {
  if (options.mode === "demo") {
    const snapshot = loadDemoSnapshot();
    const requested = new URLSearchParams(window.location.search).get("demoState");
    return buildDemoDay(snapshot, requested);
  }
  if (!options.accessToken) throw new Error("Sign in to read COMPOUND snapshots.");
  const response = await fetch("/api/snapshots/latest", {
    cache: "no-store",
    signal: options.signal,
    headers: { Authorization: `Bearer ${options.accessToken}` },
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body && typeof body.message === "string"
      ? body.message
      : "The latest COMPOUND brief could not be read.";
    throw new Error(message);
  }
  return { archive: parseArchivedSnapshot(body) };
}
