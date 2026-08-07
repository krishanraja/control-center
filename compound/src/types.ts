/**
 * The shape of `latest.json`, the single file the app reads.
 *
 * The daily job writes `data/YYYY-MM-DD.json` for history and
 * `public/latest.json` for the app. Every field below is produced by one named
 * feed or one named engine, so every number on screen can be traced back to a
 * source shown next to it.
 */

export type SignalName = "price" | "analysts" | "news" | "revenue";
export type SignalVote = -1 | 0 | 1;
export type Direction = "up" | "down" | "split";
export type Quadrant = "early" | "crowded" | "turning" | "avoid";
export type FeedState = string;

export interface Signals {
  price: SignalVote;
  analysts: SignalVote;
  news: SignalVote;
  revenue: SignalVote;
}

/** One company with its four independent signals. Engine: agreement. */
export interface AgreementRow {
  symbol: string;
  name: string;
  industry: string;
  direction: Direction;
  agree: number;
  total: number;
  signals: Signals;
  m1: number | null;
  pe: number | null;
  sent: number | null;
  rev: number | null;
  breadth: number | null;
}

/** One industry with compounded momentum and its quadrant. Engine: industries. */
export interface IndustryRow {
  industry: string;
  r1m: number;
  r3m: number;
  accel: number;
  pe: number | null;
  peRank: number | null;
  rank3m: number | null;
  rankAccel?: number | null;
  quadrant: Quadrant;
  series: number[];
}

export interface CompanyRow {
  symbol: string;
  name: string;
  industry: string;
  price: number | null;
  mcap?: number | null;
  d1: number | null;
  m1: number | null;
  m3: number | null;
  ytd: number | null;
  y1?: number | null;
  pe: number | null;
  ps?: number | null;
  gm?: number | null;
  netMargin?: number | null;
  breadth: number | null;
  breadthDelta: number | null;
  ptMonth?: number | null;
  ptQuarter?: number | null;
  ptCount?: number | null;
  yearHigh?: number | null;
  yearLow?: number | null;
}

/** One company's revenue growth this year against last. Engine: migration. */
export interface AccelRow {
  symbol: string;
  group: string;
  now: number;
  prev: number;
  delta: number;
  gm: number | null;
  year: string;
}

export interface MigrationGroup {
  avgGrowth: number;
  avgGm: number | null;
  members: Array<{
    symbol: string;
    growth: number;
    gm: number | null;
    year: string;
    prevGrowth: number | null;
  }>;
}

export interface Stage {
  stage: number;
  name: string;
  desc: string;
}

/** Where a theme currently sits on the five-stage disruption track. */
export interface Placed {
  what: string;
  stage: number;
  note: string;
  dir: "up" | "down" | "mixed";
  /** Which force is doing the moving. Inferred from `what` when absent. */
  force?: string;
}

export interface Holding {
  symbol: string;
  name: string;
  kind: "crypto" | "equity";
  valueAud: number;
  pct: number;
  price: number | null;
  d1: number | null;
  d7?: number | null;
  d30?: number | null;
}

export interface Macro {
  fedFunds: number | null;
  y1: number | null;
  y2: number | null;
  y10: number | null;
  y30: number | null;
  real10: number | null;
  real10_1y: number | null;
  hyOAS: number | null;
  hyOAS_3m?: number | null;
  vix: number | null;
  curve: number | null;
  dollar: number | null;
  claims: number | null;
  fci?: number | null;
  pricingHikes?: boolean;
  spark?: Record<string, number[]>;
}

export interface CoinRow {
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  market_cap: number | null;
  price_change_percentage_7d_in_currency: number | null;
  price_change_percentage_30d_in_currency: number | null;
}

export interface Snapshot {
  generated: string;
  /** Per-feed health. A dead feed degrades its own section instead of the run. */
  feeds: Record<string, FeedState>;
  macro: Macro;
  portfolio: {
    totalAud: number;
    investedAud?: number;
    cashAud: number;
    cryptoPct: number;
    largest: string;
    largestPct: number;
  };
  holdings: Holding[];
  solana: {
    fees24h: number | null;
    fees30d: number | null;
    fees1y: number | null;
    change1d?: number | null;
    tvl: number | null;
    stables: number | null;
  };
  cryptoGlobal: { mcap: number | null; btcDom: number | null; mcapChange?: number | null };
  cryptoHot: CoinRow[];
  cryptoCold: CoinRow[];
  industries: IndustryRow[];
  companies: CompanyRow[];
  agreement: AgreementRow[];
  migration: Record<string, MigrationGroup>;
  gap?: number | null;
  sentiment?: Record<string, number | null>;
  accel: AccelRow[];
  stages: Stage[];
  placed: Placed[];
}

export type TabKey = "now" | "shifts" | "stocks" | "mine" | "ask";

export interface ChatEvidence {
  id: string;
  label: string;
  source: string;
  checkedAt: string;
}

export type ChatEvent =
  | { event: "meta"; data: { threadId: string; snapshotAsOf: string } }
  | { event: "delta"; data: { text: string } }
  | { event: "evidence"; data: { items: ChatEvidence[]; excluded: string[] } }
  | { event: "done"; data: { messageId: string } }
  | { event: "error"; data: { message: string; retryable: boolean } };
