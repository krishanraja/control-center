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

// Substrings that mean "out of credits" rather than "bad request", across the
// providers this repo calls. Each vendor picks a different status code for the
// same condition — PDL and Apify use 402, OpenAI 429 with `insufficient_quota`,
// Apollo 403 with a message — so the body is read as well as the status.
//
// Split into two lists because the status code changes how much the body can be
// trusted.

/** Unambiguous. These mean an empty account whatever the status code, including
 *  a 400 — which is what Anthropic actually returns when the balance is spent:
 *  `400 invalid_request_error: Your credit balance is too low to access the
 *  Claude API`. Classifying that as a generic error was a real hole: Anthropic
 *  does both the screenshot read AND the judgment pass, so it is the provider
 *  most likely to run dry in this flow, and it would have degraded silently. */
const EXHAUSTED_STRONG = [
  'insufficient_quota',
  'insufficient credits',
  'insufficient_credits',
  'credit balance is too low',
  'quota exceeded',
  'exceeded your current quota',
  'usage-limit-exceeded',
  'monthly-usage-hard-limit-exceeded',
  'monthly usage hard limit',
  'out of credits',
  'no credits remaining',
  'payment required',
  'billing hard limit',
]

/** Suggestive only. A 400 mentioning "billing" is usually a malformed request
 *  about a billing endpoint; a 403 or 429 mentioning it is usually an empty
 *  account. So these count only alongside a status that already implies refusal. */
const EXHAUSTED_WEAK = [
  'billing',
  'plan limit',
  'subscription',
  'no credits',
  'upgrade your plan',
]

/** Classify one provider response. `body` is the raw text — callers should pass
 *  whatever they already read rather than re-reading the stream. */
export function classify(httpStatus: number, body: string): ProviderStatus {
  if (httpStatus >= 200 && httpStatus < 300) return 'ok'
  const b = (body || '').toLowerCase()
  const strong = EXHAUSTED_STRONG.some(h => b.includes(h))
  const weak = strong || EXHAUSTED_WEAK.some(h => b.includes(h))

  if (httpStatus === 402) return 'exhausted'
  // 429 is the ambiguous one: a burst limit on a healthy account and the
  // permanent state of an empty one look identical. The body decides; without
  // a hint, treat it as a rate limit — still blocking, but it reads differently
  // in an alert and means something different to whoever acts on it.
  if (httpStatus === 429) return weak ? 'exhausted' : 'rate_limited'
  if (httpStatus === 401) return 'auth_failed'
  if (httpStatus === 403) return weak ? 'exhausted' : 'auth_failed'
  // Any other status, including 400, is only a credit wall on an unambiguous
  // message. Anthropic's spent-balance 400 lands here.
  return strong ? 'exhausted' : 'error'
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
