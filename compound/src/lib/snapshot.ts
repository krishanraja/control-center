import { z } from "zod";
import type { Snapshot } from "../types";

/**
 * `latest.json` is validated on arrival. A field the pipeline could not fill
 * arrives as null and the section that needs it says so, rather than the app
 * inventing a number or falling back to a stale copy baked into the bundle.
 */

const num = z.number().nullable().catch(null);
const vote = z.union([z.literal(-1), z.literal(0), z.literal(1)]).catch(0);

const signalsSchema = z.object({
  price: vote,
  analysts: vote,
  news: vote,
  revenue: vote,
});

const agreementSchema = z.object({
  symbol: z.string(),
  name: z.string().catch(""),
  industry: z.string().catch("Unclassified"),
  direction: z.enum(["up", "down", "split"]).catch("split"),
  agree: z.number().catch(0),
  total: z.number().catch(0),
  signals: signalsSchema,
  m1: num,
  pe: num,
  sent: num,
  rev: num,
  breadth: num,
});

const industrySchema = z.object({
  industry: z.string(),
  r1m: z.number().catch(0),
  r3m: z.number().catch(0),
  accel: z.number().catch(0),
  pe: num,
  peRank: num,
  rank3m: num,
  rankAccel: num.optional(),
  quadrant: z.enum(["early", "crowded", "turning", "avoid"]).catch("avoid"),
  series: z.array(z.number()).catch([]),
});

const companySchema = z.object({
  symbol: z.string(),
  name: z.string().catch(""),
  industry: z.string().catch("Unclassified"),
  price: num,
  mcap: num.optional(),
  d1: num,
  m1: num,
  m3: num,
  ytd: num,
  y1: num.optional(),
  pe: num,
  ps: num.optional(),
  gm: num.optional(),
  netMargin: num.optional(),
  breadth: num,
  breadthDelta: num,
  ptMonth: num.optional(),
  ptQuarter: num.optional(),
  ptCount: num.optional(),
  yearHigh: num.optional(),
  yearLow: num.optional(),
});

const coinSchema = z.object({
  id: z.string(),
  symbol: z.string().catch(""),
  name: z.string().catch(""),
  current_price: num,
  market_cap: num,
  price_change_percentage_7d_in_currency: num,
  price_change_percentage_30d_in_currency: num,
});

export const snapshotSchema: z.ZodType<Snapshot> = z.object({
  generated: z.string(),
  feeds: z.record(z.string(), z.string()).catch({}),
  macro: z.object({
    fedFunds: num,
    y1: num,
    y2: num,
    y10: num,
    y30: num,
    real10: num,
    real10_1y: num,
    hyOAS: num,
    hyOAS_3m: num.optional(),
    vix: num,
    curve: num,
    dollar: num,
    claims: num,
    fci: num.optional(),
    pricingHikes: z.boolean().optional(),
    spark: z.record(z.string(), z.array(z.number())).optional(),
  }),
  portfolio: z.object({
    totalAud: z.number(),
    investedAud: z.number().optional(),
    cashAud: z.number(),
    cryptoPct: z.number(),
    largest: z.string(),
    largestPct: z.number(),
  }),
  holdings: z.array(z.object({
    symbol: z.string(),
    name: z.string().catch(""),
    kind: z.enum(["crypto", "equity"]).catch("equity"),
    valueAud: z.number().catch(0),
    pct: z.number().catch(0),
    price: num,
    d1: num,
    d7: num.optional(),
    d30: num.optional(),
  })),
  solana: z.object({
    fees24h: num,
    fees30d: num,
    fees1y: num,
    change1d: num.optional(),
    tvl: num,
    stables: num,
  }),
  cryptoGlobal: z.object({ mcap: num, btcDom: num, mcapChange: num.optional() }),
  cryptoHot: z.array(coinSchema).catch([]),
  cryptoCold: z.array(coinSchema).catch([]),
  industries: z.array(industrySchema),
  companies: z.array(companySchema),
  agreement: z.array(agreementSchema),
  migration: z.record(z.string(), z.object({
    avgGrowth: z.number(),
    avgGm: num,
    members: z.array(z.object({
      symbol: z.string(),
      growth: z.number(),
      gm: num,
      year: z.string().catch(""),
      prevGrowth: num,
    })).catch([]),
  })).catch({}),
  gap: num.optional(),
  sentiment: z.record(z.string(), num).optional(),
  accel: z.array(z.object({
    symbol: z.string(),
    group: z.string(),
    now: z.number(),
    prev: z.number(),
    delta: z.number(),
    gm: num,
    year: z.string().catch(""),
  })).catch([]),
  stages: z.array(z.object({ stage: z.number(), name: z.string(), desc: z.string() })).catch([]),
  placed: z.array(z.object({
    what: z.string(),
    stage: z.number(),
    note: z.string().catch(""),
    dir: z.enum(["up", "down", "mixed"]).catch("mixed"),
    force: z.string().optional(),
  })).catch([]),
});

export function parseSnapshot(input: unknown): Snapshot {
  const parsed = snapshotSchema.safeParse(input);
  if (!parsed.success) throw new Error("Today's data arrived in a shape COMPOUND does not recognise.");
  return parsed.data;
}

/** Feeds that reported anything other than "ok" for this run. */
export function degradedFeeds(snapshot: Snapshot): string[] {
  return Object.entries(snapshot.feeds)
    .filter(([, state]) => state !== "ok")
    .map(([feed, state]) => `${feed}: ${state}`);
}

export async function loadSnapshot(signal?: AbortSignal): Promise<Snapshot> {
  const response = await fetch("/latest.json", { cache: "no-store", signal });
  if (!response.ok) throw new Error("There is no COMPOUND data file to read yet.");
  return parseSnapshot(await response.json() as unknown);
}
