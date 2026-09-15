// What an Apify actor actually costs, from Apify's own per-run records.
//
// ── Why this file exists ───────────────────────────────────────────────────
// A backfill was run all day on an estimate of $0.0013 per profile, inferred
// from api_usage_state.balance_usd moving eleven cents. That column is an
// hourly-synced account aggregate and it was lagging badly. The truth, already
// in meter_daily from the hourly apify-sync, was $0.0090 for a profile and
// $0.0158 for a posts read: seven times the guess on one actor and a cost never
// priced at all on the other. The day came to $58 against a plan that includes
// $29, and the first real signal was Apify's monthly hard limit tripping.
//
// api_call_log cannot help here — it records est_cost_usd 0 for every Apify
// call, because the run cost is not known at call time. meter_daily is the
// only place the money is real.
//
// So: no constants, no inference from balances. A price is either observed in
// the meter or it is not available, and "not available" must be reported as
// such rather than filled in with a plausible number.

export interface ActorPrice {
  /** Lowercased actor slug, e.g. "dev_fusion/linkedin-profile-scraper". */
  actor: string
  usdPerRun: number
  /** How many runs the average is drawn from. One run is not a price. */
  runs: number
  /** Most recent day observed, so a caller can see how stale the price is. */
  lastDay: string
}

export interface PriceBook {
  byActor: Record<string, ActorPrice>
  /** Null when nothing was observed at all — the caller must not invent one. */
  get(actorSlug: string): ActorPrice | null
}

export interface MeterRow {
  unit_label: string | null
  usd: number | string | null
  runs: number | null
  day: string
}

/** Rows for the window, fetched by the caller.
 *
 *  A callback rather than a Supabase client: this module owns the pricing
 *  arithmetic and nothing else, and typing the postgrest builder structurally
 *  dragged the whole generated schema into every script that imported it. */
export type FetchMeterRows = (sinceDay: string) => Promise<MeterRow[]>

/** Observed price per run per actor, over the last `days` days.
 *
 *  Averaged across days weighted by run count, because a day with four runs
 *  and a day with four thousand are not equal evidence. */
export async function loadPrices(fetchRows: FetchMeterRows, days = 14): Promise<PriceBook> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const rows = await fetchRows(since)

  const acc = new Map<string, { usd: number; runs: number; lastDay: string }>()
  for (const r of rows) {
    const actor = (r.unit_label || '').toLowerCase()
    const runs = Number(r.runs || 0)
    const usd = Number(r.usd || 0)
    if (!actor || runs <= 0) continue
    const cur = acc.get(actor) || { usd: 0, runs: 0, lastDay: r.day }
    cur.usd += usd
    cur.runs += runs
    if (r.day > cur.lastDay) cur.lastDay = r.day
    acc.set(actor, cur)
  }

  const byActor: Record<string, ActorPrice> = {}
  for (const [actor, v] of acc) {
    byActor[actor] = { actor, usdPerRun: v.usd / v.runs, runs: v.runs, lastDay: v.lastDay }
  }

  return {
    byActor,
    get(slug: string) { return byActor[slug.toLowerCase()] ?? null },
  }
}

export interface Quote {
  people: number
  /** Per person, summed across every actor this run will invoke. */
  usdPerPerson: number
  usdTotal: number
  /** Priced components, for showing the working. */
  parts: { actor: string; usdPerRun: number; runs: number; lastDay: string }[]
  /** Actors with no observed price. A quote with any of these is incomplete and
   *  must never be presented as a total. */
  unpriced: string[]
}

/** Price a run of `people` against the actors it will invoke. */
export function quote(prices: PriceBook, people: number, actors: string[]): Quote {
  const parts: Quote['parts'] = []
  const unpriced: string[] = []
  let usdPerPerson = 0

  for (const a of actors) {
    const p = prices.get(a)
    if (!p) { unpriced.push(a); continue }
    parts.push({ actor: p.actor, usdPerRun: p.usdPerRun, runs: p.runs, lastDay: p.lastDay })
    usdPerPerson += p.usdPerRun
  }

  return { people, usdPerPerson, usdTotal: usdPerPerson * people, parts, unpriced }
}

/** How many people fit in a budget. Floor, never round: the point of a ceiling
 *  is that it is not exceeded. */
export function peopleWithin(budgetUsd: number, usdPerPerson: number): number {
  if (!(usdPerPerson > 0)) return 0
  return Math.max(0, Math.floor(budgetUsd / usdPerPerson))
}

export function money(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`
}
