// Provider outcomes, and the difference between "not configured" and "out of
// credits".
//
// Every enrichment provider in this repo used to swallow its own failures and
// return an empty string (see the catch blocks in _enrich.ts). That is the
// right shape for a best-effort research brief and the wrong shape for adding
// somebody to the network: a run where PDL 402s and OpenAI is out of quota
// looks, from the outside, exactly like a run where the person simply has a
// thin public footprint. The contact lands, `enrichment_status` says
// 'enriched', and nothing anywhere says the enrichment did not happen.
//
// Krish's requirement, verbatim: "if there are not enough api credits anywhere,
// I need an alert rather than just half enriching."
//
// So each provider call returns a typed outcome instead of a string, and the
// outcomes are separated into three kinds:
//
//   SKIPPED    no key configured. Expected, silent, not an alert. Some of these
//              keys are deliberately unset.
//   DEGRADED   the provider answered and had nothing (empty dataset, no match),
//              or failed transiently. Named in the response, not an alert.
//   BLOCKING   the key is present but the account cannot serve the call:
//              exhausted credits, revoked key, hard rate limit. This is the one
//              that must stop the run and alert rather than half-enrich.

export type ProviderStatus =
  | 'ok'
  | 'empty'           // 2xx, nothing useful in the body
  | 'skipped_no_key'  // not configured — expected
  | 'auth_failed'     // 401/403 — key bad or revoked
  | 'exhausted'       // 402 / quota / insufficient credits
  | 'rate_limited'    // 429
  | 'error'           // anything else

export interface ProviderOutcome {
  /** Matches api_usage_state.api_name so the ledger and the alerter agree. */
  api: string
  status: ProviderStatus
  httpStatus?: number
  detail?: string
}

/** The statuses that mean "the account cannot serve this call right now". These
 *  stop an enrichment run; everything else only degrades it. */
const BLOCKING: ReadonlySet<ProviderStatus> = new Set<ProviderStatus>([
  'exhausted', 'auth_failed', 'rate_limited',
])

export function isBlocking(o: ProviderOutcome): boolean {
  return BLOCKING.has(o.status)
}

/** Substrings that mean "out of credits" rather than "bad request", across the
 *  providers this repo calls. Each vendor picks a different status code for the
 *  same condition — PDL and Apify use 402, OpenAI uses 429 with an
 *  `insufficient_quota` code, Apollo uses 403 with a message — so the body text
 *  is read as well as the status. */
const EXHAUSTED_HINTS = [
  'insufficient_quota',
  'insufficient credits',
  'insufficient_credits',
  'credit balance is too low',
  'quota exceeded',
  'usage-limit-exceeded',
  'monthly-usage-hard-limit-exceeded',
  'monthly usage hard limit',
  'exceeded your current quota',
  'out of credits',
  'no credits',
  'payment required',
  'billing',
  'plan limit',
  'subscription',
]

/** Classify one provider response. `body` is the raw text — callers should pass
 *  whatever they already read rather than re-reading the stream. */
export function classify(httpStatus: number, body: string): ProviderStatus {
  if (httpStatus >= 200 && httpStatus < 300) return 'ok'
  const b = (body || '').toLowerCase()
  const hinted = EXHAUSTED_HINTS.some(h => b.includes(h))

  if (httpStatus === 402) return 'exhausted'
  // 429 is the ambiguous one: it is a burst limit on a healthy account and the
  // permanent state of an empty one. The body decides; without a hint, treat it
  // as a rate limit, which is still blocking but reads differently in an alert.
  if (httpStatus === 429) return hinted ? 'exhausted' : 'rate_limited'
  if (httpStatus === 401) return 'auth_failed'
  if (httpStatus === 403) return hinted ? 'exhausted' : 'auth_failed'
  return 'error'
}

/** Build an outcome from a fetch response the caller has already read. */
export function outcomeFrom(api: string, httpStatus: number, body: string): ProviderOutcome {
  const status = classify(httpStatus, body)
  return {
    api,
    status,
    httpStatus,
    detail: status === 'ok' ? undefined : (body || '').replace(/\s+/g, ' ').trim().slice(0, 200) || undefined,
  }
}

export const skipped = (api: string): ProviderOutcome => ({ api, status: 'skipped_no_key' })
export const ok = (api: string): ProviderOutcome => ({ api, status: 'ok' })
export const empty = (api: string, detail?: string): ProviderOutcome => ({ api, status: 'empty', detail })
export const errored = (api: string, detail: string): ProviderOutcome => ({ api, status: 'error', detail: detail.slice(0, 200) })

export interface OutcomeSummary {
  /** Providers that could not serve the call. Non-empty means: do not claim the
   *  record was enriched. */
  blocked: ProviderOutcome[]
  /** Human-readable "ran but gave nothing" list, for the UI's honesty line. */
  degraded: string[]
  /** Providers that actually contributed. */
  used: string[]
  /** Not configured. Reported separately so an unset key never reads as a fault. */
  skipped: string[]
}

export function summarise(outcomes: ProviderOutcome[]): OutcomeSummary {
  const blocked = outcomes.filter(isBlocking)
  return {
    blocked,
    degraded: outcomes.filter(o => o.status === 'empty' || o.status === 'error')
      .map(o => `${o.api}${o.detail ? `: ${o.detail.slice(0, 80)}` : ''}`),
    used: outcomes.filter(o => o.status === 'ok').map(o => o.api),
    skipped: outcomes.filter(o => o.status === 'skipped_no_key').map(o => o.api),
  }
}

/** One line per blocked provider, phrased for a person reading an alert rather
 *  than a log. */
export function blockedMessage(blocked: ProviderOutcome[]): string {
  return blocked.map(o => {
    const why = o.status === 'exhausted' ? 'out of credits/quota'
      : o.status === 'auth_failed' ? 'key rejected (401/403)'
      : 'rate limited (429)'
    return `${o.api}: ${why}${o.httpStatus ? ` [HTTP ${o.httpStatus}]` : ''}${o.detail ? ` — ${o.detail.slice(0, 120)}` : ''}`
  }).join('\n')
}
