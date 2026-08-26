import { classify, type ProviderStatus } from './_quota.js'

// The provider check table behind /api/health/connections-sweep.
//
// One entry per service_registry.check_kind != 'none' service: the cheapest
// request that proves the stored key can still be served, plus — where the
// vendor exposes one — a balance read so "needs topping up" is a number, not
// a guess. Registry rows say WHICH services to check and WHERE their key
// lives (env var name, never a value); this file says HOW to check each one.
//
// A check that reached authorization is a live key even when the request
// shape is rejected, which is what pingClassify's 400/404/405 remap encodes.
// _quota.classify still wins first: Anthropic's spent-balance 400 carries an
// unambiguous "credit balance is too low" body and classifies as exhausted
// before the remap can call it ok.

export interface ProviderRequest {
  url: string
  init?: RequestInit
}

export interface ProviderCheck {
  build(key: string): ProviderRequest
  /** Present only for balance-capable vendors. Return null when the payload
   *  did not carry a usable number (the check still counts as a ping). */
  parseBalance?(json: unknown): { balance: number; unit: string } | null
  /** Rough cost of one check, for the metering ledger. Undefined = free. */
  estCostUsd?: number
}

type J = Record<string, unknown>
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}
const path = (o: unknown, keys: string[]): unknown =>
  keys.reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as J)[k] : undefined), o)

export const PROVIDERS: Record<string, ProviderCheck> = {
  // --- LLMs ---
  openai: { build: k => ({ url: 'https://api.openai.com/v1/models', init: { headers: { Authorization: `Bearer ${k}` } } }) },
  anthropic: {
    build: k => ({
      url: 'https://api.anthropic.com/v1/models',
      init: { headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01' } },
    }),
  },
  gemini: { build: k => ({ url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(k)}` }) },
  perplexity: {
    build: k => ({
      url: 'https://api.perplexity.ai/chat/completions',
      init: {
        method: 'POST',
        headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
        // No free list endpoint exists; one token is the cheapest proof of life.
        body: JSON.stringify({ model: 'sonar', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
      },
    }),
    estCostUsd: 0.001,
  },
  deepseek: {
    build: k => ({ url: 'https://api.deepseek.com/user/balance', init: { headers: { Authorization: `Bearer ${k}` } } }),
    parseBalance: j => {
      const infos = path(j, ['balance_infos'])
      const first = Array.isArray(infos) ? infos[0] as J : null
      const b = first ? num(first.total_balance) : null
      return b === null ? null : { balance: b, unit: String(first?.currency || 'usd').toLowerCase() }
    },
  },
  moonshot: {
    build: k => ({ url: 'https://api.moonshot.ai/v1/users/me/balance', init: { headers: { Authorization: `Bearer ${k}` } } }),
    parseBalance: j => {
      const b = num(path(j, ['data', 'available_balance']))
      return b === null ? null : { balance: b, unit: 'credits' }
    },
  },
  xai: { build: k => ({ url: 'https://api.x.ai/v1/models', init: { headers: { Authorization: `Bearer ${k}` } } }) },

  // --- Infra ---
  vercel: { build: k => ({ url: 'https://api.vercel.com/v2/user', init: { headers: { Authorization: `Bearer ${k}` } } }) },
  supabase: {
    // The service-role key against this project's own REST root: proves both
    // the key and the PostgREST surface. SUPABASE_URL is always set server-side.
    build: k => ({
      url: `${(process.env.SUPABASE_URL || '').replace(/\/+$/, '')}/rest/v1/`,
      init: { headers: { apikey: k, Authorization: `Bearer ${k}` } },
    }),
  },
  n8n: {
    build: k => ({
      url: `${(process.env.N8N_BASE_URL || 'https://krishraja10101.app.n8n.cloud').replace(/\/+$/, '')}/api/v1/workflows?limit=1`,
      init: { headers: { 'X-N8N-API-KEY': k } },
    }),
  },
  github: { build: k => ({ url: 'https://api.github.com/rate_limit', init: { headers: { Authorization: `Bearer ${k}`, 'User-Agent': 'control-center-sweep' } } }) },
  cloudflare: { build: k => ({ url: 'https://api.cloudflare.com/client/v4/user/tokens/verify', init: { headers: { Authorization: `Bearer ${k}` } } }) },
  expo: {
    build: k => ({
      url: 'https://api.expo.dev/graphql',
      init: {
        method: 'POST',
        headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ me { id } }' }),
      },
    }),
  },
  telegram: { build: k => ({ url: `https://api.telegram.org/bot${k}/getMe` }) },
  stripe: { build: k => ({ url: 'https://api.stripe.com/v1/balance', init: { headers: { Authorization: `Bearer ${k}` } } }) },
  'stripe-fractionl': { build: k => ({ url: 'https://api.stripe.com/v1/balance', init: { headers: { Authorization: `Bearer ${k}` } } }) },

  // --- Data / enrichment / search ---
  apify: {
    build: k => ({ url: 'https://api.apify.com/v2/users/me/limits', init: { headers: { Authorization: `Bearer ${k}` } } }),
    parseBalance: j => {
      // Monthly headroom in dollars: what the plan allows minus what this
      // month already used. That is the number that runs out.
      const max = num(path(j, ['data', 'limits', 'maxMonthlyUsageUsd']))
      const used = num(path(j, ['data', 'current', 'monthlyUsageUsd']))
      if (max === null || used === null) return null
      return { balance: Math.round((max - used) * 100) / 100, unit: 'usd' }
    },
  },
  apollo: {
    build: k => ({
      url: 'https://api.apollo.io/api/v1/auth/health',
      init: { headers: { 'x-api-key': k } },
    }),
  },
  peopledatalabs: {
    // An intentionally parameterless enrich: a valid key gets a 400 ("no
    // params"), a dead one gets a 401/402/403. pingClassify reads that right.
    build: k => ({ url: 'https://api.peopledatalabs.com/v5/person/enrich', init: { headers: { 'X-Api-Key': k } } }),
  },
  exa: {
    build: k => ({
      url: 'https://api.exa.ai/search',
      init: {
        method: 'POST',
        headers: { 'x-api-key': k, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'ping', numResults: 1 }),
      },
    }),
    estCostUsd: 0.0025,
  },
  brave: {
    build: k => ({
      url: 'https://api.search.brave.com/res/v1/web/search?q=ping&count=1',
      init: { headers: { 'X-Subscription-Token': k, Accept: 'application/json' } },
    }),
  },
  neverbounce: {
    build: k => ({ url: `https://api.neverbounce.com/v4/account/info?key=${encodeURIComponent(k)}` }),
    parseBalance: j => {
      const b = num(path(j, ['credits_info', 'paid_credits_remaining']))
      return b === null ? null : { balance: b, unit: 'credits' }
    },
  },
  phantombuster: {
    build: k => ({ url: 'https://api.phantombuster.com/api/v2/orgs/fetch-resources', init: { headers: { 'X-Phantombuster-Key-1': k } } }),
    parseBalance: j => {
      const left = num(path(j, ['executionTimeLeft']))
      return left === null ? null : { balance: Math.round(left / 60), unit: 'minutes' }
    },
  },
  browserless: {
    build: k => ({ url: `https://production-sfo.browserless.io/pressure?token=${encodeURIComponent(k)}` }),
  },
  builtwith: {
    build: k => ({ url: `https://api.builtwith.com/usagev2/api.json?KEY=${encodeURIComponent(k)}` }),
    parseBalance: j => {
      const purchased = num(path(j, ['Purchased']))
      const used = num(path(j, ['Used']))
      if (purchased === null || used === null) return null
      return { balance: purchased - used, unit: 'credits' }
    },
  },
  newsapi: { build: k => ({ url: `https://newsapi.org/v2/top-headlines?pageSize=1&country=us&apiKey=${encodeURIComponent(k)}` }) },
  marketaux: { build: k => ({ url: `https://api.marketaux.com/v1/news/all?limit=1&api_token=${encodeURIComponent(k)}` }) },
  // The /api/v3 path 403s with "Legacy Endpoint" even on live keys (verified
  // 2026-08-25); /stable is FMP's current surface, so a topped-up key
  // classifies ok instead of reading as broken forever.
  fmp: { build: k => ({ url: `https://financialmodelingprep.com/stable/profile?symbol=AAPL&apikey=${encodeURIComponent(k)}` }) },
  fred: { build: k => ({ url: `https://api.stlouisfed.org/fred/series?series_id=GNPCA&file_type=json&api_key=${encodeURIComponent(k)}` }) },
  coingecko: {
    // Demo-tier keys live on the public host with their own header; the /ping
    // endpoint accepts them and costs nothing.
    build: k => ({ url: 'https://api.coingecko.com/api/v3/ping', init: { headers: { 'x-cg-demo-api-key': k } } }),
  },
  'football-data': { build: k => ({ url: 'https://api.football-data.org/v4/competitions?limit=1', init: { headers: { 'X-Auth-Token': k } } }) },
  'api-football': {
    build: k => ({ url: 'https://v3.football.api-sports.io/status', init: { headers: { 'x-apisports-key': k } } }),
    parseBalance: j => {
      const limit = num(path(j, ['response', 'requests', 'limit_day']))
      const current = num(path(j, ['response', 'requests', 'current']))
      if (limit === null || current === null) return null
      return { balance: limit - current, unit: 'requests' }
    },
  },
  artificialanalysis: {
    build: k => ({ url: 'https://artificialanalysis.ai/api/v2/data/llms/models', init: { headers: { 'x-api-key': k } } }),
  },

  // --- Outreach / media ---
  instantly: { build: k => ({ url: 'https://api.instantly.ai/api/v2/accounts?limit=1', init: { headers: { Authorization: `Bearer ${k}` } } }) },
  resend: { build: k => ({ url: 'https://api.resend.com/domains', init: { headers: { Authorization: `Bearer ${k}` } } }) },
  fireflies: {
    build: k => ({
      url: 'https://api.fireflies.ai/graphql',
      init: {
        method: 'POST',
        headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ user { user_id } }' }),
      },
    }),
  },
  elevenlabs: {
    build: k => ({ url: 'https://api.elevenlabs.io/v1/user/subscription', init: { headers: { 'xi-api-key': k } } }),
    parseBalance: j => {
      const limit = num(path(j, ['character_limit']))
      const used = num(path(j, ['character_count']))
      if (limit === null || used === null) return null
      return { balance: limit - used, unit: 'characters' }
    },
  },
}

/** classify(), with one remap for pings: a non-2xx that carries no exhausted
 *  signal but proves the request reached authorization (400 bad request, 404,
 *  405) means the key is alive. */
export function pingClassify(httpStatus: number, body: string): ProviderStatus {
  const s = classify(httpStatus, body)
  if (s === 'error' && (httpStatus === 400 || httpStatus === 404 || httpStatus === 405)) return 'ok'
  return s
}

// Key resolution: deploy env first, then the service-role-only app_secrets
// table (lower-cased env name as the key), so a provider can be wired without
// a redeploy. Cached per process; a missing key is an honest skipped_no_key,
// never a guess.
const secretCache = new Map<string, string | null>()
export async function resolveKey(envName: string | null): Promise<string | null> {
  if (!envName) return null
  const fromEnv = process.env[envName]
  if (fromEnv) return fromEnv
  if (secretCache.has(envName)) return secretCache.get(envName) ?? null
  try {
    const { supabase } = await import('./_supabase.js')
    const { data } = await supabase.from('app_secrets').select('value').eq('key', envName.toLowerCase()).maybeSingle()
    const v = data && typeof (data as { value?: unknown }).value === 'string' ? (data as { value: string }).value : null
    secretCache.set(envName, v)
    return v
  } catch {
    secretCache.set(envName, null)
    return null
  }
}

export interface CheckResult {
  status: ProviderStatus
  httpStatus: number | null
  detail: string | null
  balance: number | null
  balanceUnit: string | null
}

/** Run one provider check with a hard timeout. Never throws. */
export async function runCheck(providerKey: string, apiKey: string, kind: 'balance' | 'ping', timeoutMs = 8000): Promise<CheckResult> {
  const provider = PROVIDERS[providerKey]
  if (!provider) return { status: 'error', httpStatus: null, detail: 'no check implemented', balance: null, balanceUnit: null }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const { url, init } = provider.build(apiKey)
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    const body = await res.text().catch(() => '')
    const status = kind === 'ping' ? pingClassify(res.status, body) : classify(res.status, body)
    let balance: number | null = null
    let balanceUnit: string | null = null
    if (status === 'ok' && provider.parseBalance) {
      try {
        const parsed = provider.parseBalance(JSON.parse(body))
        if (parsed) { balance = parsed.balance; balanceUnit = parsed.unit }
      } catch { /* a balance we cannot read is still a live key */ }
    }
    return {
      status,
      httpStatus: res.status,
      detail: status === 'ok' ? null : body.replace(/\s+/g, ' ').trim().slice(0, 300) || null,
      balance,
      balanceUnit,
    }
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      status: 'error',
      httpStatus: null,
      detail: aborted ? `timeout after ${timeoutMs}ms` : String((err as Error)?.message || err).slice(0, 300),
      balance: null,
      balanceUnit: null,
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Run tasks with bounded concurrency, preserving order of results. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}
