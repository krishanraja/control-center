// _harness: the budgeted evidence-gathering layer for the MYMU: Teardown
// investigation pipeline.
//
// TWO HARD CONSTRAINTS SHAPE EVERY FUNCTION HERE.
//
// 1. "We are not pulling huge amounts of data." Depth comes from SELECTIVITY,
//    not volume. Every probe is capped, every cap is a named constant, and
//    anything over the cap is REPORTED as skipped rather than silently dropped
//    (the discipline proven in api/growth/geo-probe.ts). A whole run reads under
//    1MB of page text: 24 ranged GETs at 40KB each.
//
// 2. An enrichment failure is NEVER fatal to the investigation. Every harness
//    returns a typed result with a verdict, including 'error' and 'budget'.
//    Nothing here throws into the run loop.

import { rootDomain } from './_trendGate.js'
import { normalizeSpan, FETCH_BYTES, FETCH_TIMEOUT_MS, FETCH_CONCURRENCY } from './_gates.js'

// ── Budget ──────────────────────────────────────────────────────────────────

export const MAX_MODEL_CALLS_PER_RUN = 10
export const MAX_SEARCH_CALLS_PER_RUN = 8
export const MAX_PAGE_FETCHES_PER_RUN = 24
export const PERPLEXITY_MAX_TOKENS = 900

export interface RunBudget {
  maxModelCalls: number
  maxSearchCalls: number
  maxFetches: number
  modelCalls: number
  searchCalls: number
  fetches: number
  inputTokens: number
  outputTokens: number
  estCostUsd: number
  /** Every refusal to spend, kept so the trace shows what was NOT done. */
  skipped: { what: string; why: string }[]
}

export function newBudget(overrides: Partial<RunBudget> = {}): RunBudget {
  return {
    maxModelCalls: MAX_MODEL_CALLS_PER_RUN,
    maxSearchCalls: MAX_SEARCH_CALLS_PER_RUN,
    maxFetches: MAX_PAGE_FETCHES_PER_RUN,
    modelCalls: 0, searchCalls: 0, fetches: 0,
    inputTokens: 0, outputTokens: 0, estCostUsd: 0,
    skipped: [],
    ...overrides,
  }
}

export function budgetLeft(b: RunBudget): { model: number; search: number; fetch: number } {
  return {
    model: Math.max(0, b.maxModelCalls - b.modelCalls),
    search: Math.max(0, b.maxSearchCalls - b.searchCalls),
    fetch: Math.max(0, b.maxFetches - b.fetches),
  }
}

// ── Metered Anthropic call ──────────────────────────────────────────────────
//
// api/_content.ts callClaude() cannot be used for the ladder. It ALWAYS sends
// `temperature`, and temperature/top_p/top_k are REMOVED on claude-opus-4-8:
// the request returns a 400. It also discards `usage`, so a run could not
// report what it actually cost. Both matter here, so this is a separate, small,
// metered client rather than a change to a helper twelve other routes rely on.

/** Models that reject temperature/top_p/top_k with a 400. */
const NO_SAMPLING_MODELS = /^claude-(opus-4-7|opus-4-8|opus-5|sonnet-5|fable-5|mythos-5)/

/** USD per 1M tokens. Update alongside the model list. */
export const MODEL_PRICES: Record<string, { in: number; out: number }> = {
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
}

export const LADDER_MODEL = 'claude-opus-4-8'
export const UTILITY_MODEL = 'claude-sonnet-4-6'

export interface MeteredResult {
  text: string
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  error?: string
}

export interface MeteredOpts {
  system: string
  user: string
  model?: string
  maxTokens?: number
  temperature?: number
}

/** Single metered Anthropic call. Never throws: returns `error` instead, so a
 *  failed probe degrades the run rather than killing it. Spends budget only on
 *  a call that was actually made. */
export async function callMetered(opts: MeteredOpts, budget: RunBudget): Promise<MeteredResult> {
  const model = opts.model || UTILITY_MODEL
  const empty: MeteredResult = { text: '', model, inputTokens: 0, outputTokens: 0, costUsd: 0 }
  if (budgetLeft(budget).model <= 0) {
    budget.skipped.push({ what: `model call (${model})`, why: `model call cap ${budget.maxModelCalls} reached` })
    return { ...empty, error: 'budget_exhausted' }
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ...empty, error: 'ANTHROPIC_API_KEY not configured' }

  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? 1200,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  }
  // Sampling parameters are a 400 on the opus-4-7 family. Thinking is
  // deliberately left OFF (omitting the field on opus-4-8 means no thinking),
  // because max_tokens caps thinking plus text together and this pipeline runs
  // on a bounded budget.
  if (!NO_SAMPLING_MODELS.test(model)) body.temperature = opts.temperature ?? 0.2

  budget.modelCalls++
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const j = await r.json().catch(() => ({})) as {
      content?: { text?: string }[]
      usage?: { input_tokens?: number; output_tokens?: number }
      error?: { message?: string }
    }
    const inTok = j?.usage?.input_tokens || 0
    const outTok = j?.usage?.output_tokens || 0
    const price = MODEL_PRICES[model] || { in: 5, out: 25 }
    const cost = (inTok / 1e6) * price.in + (outTok / 1e6) * price.out
    budget.inputTokens += inTok
    budget.outputTokens += outTok
    budget.estCostUsd += cost
    if (!r.ok) {
      return { ...empty, inputTokens: inTok, outputTokens: outTok, costUsd: cost, error: `anthropic_${r.status}:${(j?.error?.message || '').slice(0, 160)}` }
    }
    return { text: j?.content?.[0]?.text || '', model, inputTokens: inTok, outputTokens: outTok, costUsd: cost }
  } catch (e) {
    return { ...empty, error: String((e as Error)?.message || e).slice(0, 160) }
  }
}

// ── Page fetch (G5.1 supply) ────────────────────────────────────────────────

export interface FetchedPage {
  url: string
  ok: boolean
  status: number | null
  title: string | null
  ogTitle: string | null
  publishedOn: string | null
  text: string
  error?: string | null
}

function pick(html: string, re: RegExp): string | null {
  const m = html.match(re)
  return m ? normalizeSpan(m[1]).slice(0, 300) : null
}

function stripTags(html: string): string {
  return normalizeSpan(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      // The 40KB range cut lands mid-document, so the LAST <script> or <style>
      // usually has no closing tag inside the slice. A non-greedy pair match
      // then never fires and the whole minified blob survives into page_text.
      // Measured on the first live run: Bloomberg and CNBC both filled their
      // entire 12,000-char store with CSS and analytics boilerplate and carried
      // zero article text, which silently starves every number check
      // downstream. Drop any unterminated trailing block.
      .replace(/<script[\s\S]*$/i, ' ')
      .replace(/<style[\s\S]*$/i, ' ')
      // Leftover CSS rule bodies from inline <style> the slice did close.
      .replace(/[^{}<>]*\{[^{}]*\}/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      // Numeric entities, decoded before &amp; so &amp;#39; cannot double-decode
      // into a stray quote. TechCrunch ships &#039; in its <title>, which broke
      // both titleJaccard and any exact quote match against the headline.
      .replace(/&#(\d{1,6});/g, (_m, d: string) => String.fromCharCode(Number(d)))
      .replace(/&#x([0-9a-f]{1,5});/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&amp;/g, '&'),
  )
}

/** Ranged GET, not HEAD: many publishers 405 a HEAD. 40KB is enough for the
 *  title, the dateline and the paragraph carrying the number, and it is the
 *  concrete answer to "not pulling huge amounts of data". */
export async function fetchPage(url: string, budget: RunBudget): Promise<FetchedPage> {
  const base: FetchedPage = { url, ok: false, status: null, title: null, ogTitle: null, publishedOn: null, text: '', error: null }
  if (!rootDomain(url)) return { ...base, error: 'unparseable_url' }
  if (budgetLeft(budget).fetch <= 0) {
    budget.skipped.push({ what: `fetch ${url}`, why: `fetch cap ${budget.maxFetches} reached` })
    return { ...base, error: 'budget_exhausted' }
  }
  budget.fetches++
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const r = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        Range: `bytes=0-${FETCH_BYTES}`,
        'User-Agent': 'Mozilla/5.0 (compatible; MindmakeVerifier/1.0; +https://mindmakerlive.substack.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    const status = r.status
    // 206 Partial Content is the success case for a ranged GET.
    const ok = r.ok || status === 206
    const html = ok ? (await r.text()).slice(0, FETCH_BYTES) : ''
    return {
      url, ok, status,
      title: pick(html, /<title[^>]*>([\s\S]{0,300}?)<\/title>/i),
      ogTitle: pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{0,300})["']/i)
        || pick(html, /<meta[^>]+content=["']([^"']{0,300})["'][^>]+property=["']og:title["']/i),
      publishedOn: pick(html, /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']{4,40})["']/i)
        || pick(html, /<time[^>]+datetime=["']([^"']{4,40})["']/i),
      text: stripTags(html),
      error: ok ? null : null,
    }
  } catch (e) {
    const msg = String((e as Error)?.name === 'AbortError' ? 'timeout' : (e as Error)?.message || e).slice(0, 120)
    return { ...base, error: msg }
  } finally {
    clearTimeout(timer)
  }
}

/** Bounded-concurrency fetch. Concurrency 6, matching the gate spec. */
export async function fetchPages(urls: string[], budget: RunBudget): Promise<FetchedPage[]> {
  const out: FetchedPage[] = []
  const queue = [...urls]
  const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, queue.length) }, async () => {
    for (;;) {
      const u = queue.shift()
      if (!u) return
      out.push(await fetchPage(u, budget))
    }
  })
  await Promise.all(workers)
  return out
}

// ── Search (Perplexity sonar) ───────────────────────────────────────────────

export interface SearchResult {
  query: string
  ok: boolean
  findings: string
  citations: string[]
  error?: string | null
}

/** Rough per-call estimate. Perplexity bills per request plus tokens; this is
 *  logged as an ESTIMATE and never presented as a measured figure. */
export const PERPLEXITY_EST_COST_PER_CALL = 0.006

export async function perplexity(query: string, budget: RunBudget, systemHint?: string): Promise<SearchResult> {
  const base: SearchResult = { query, ok: false, findings: '', citations: [], error: null }
  if (budgetLeft(budget).search <= 0) {
    budget.skipped.push({ what: `search "${query.slice(0, 60)}"`, why: `search cap ${budget.maxSearchCalls} reached` })
    return { ...base, error: 'budget_exhausted' }
  }
  const key = process.env.PERPLEXITY_API_KEY
  if (!key) return { ...base, error: 'PERPLEXITY_API_KEY not configured' }
  budget.searchCalls++
  budget.estCostUsd += PERPLEXITY_EST_COST_PER_CALL
  try {
    const r = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'sonar',
        max_tokens: PERPLEXITY_MAX_TOKENS,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: systemHint || 'You are a research assistant. Answer only from sources you can cite. If the record does not support an answer, say so plainly. Never invent a source, a statistic, or a company. No em dashes.',
          },
          { role: 'user', content: query },
        ],
      }),
    })
    const j = await r.json().catch(() => ({})) as {
      choices?: { message?: { content?: string } }[]
      citations?: string[]
      search_results?: { url?: string }[]
      error?: { message?: string }
    }
    if (!r.ok) return { ...base, error: `perplexity_${r.status}:${(j?.error?.message || '').slice(0, 120)}` }
    const cites = Array.isArray(j?.citations) && j.citations.length
      ? j.citations
      : (j?.search_results || []).map(s => s?.url).filter(Boolean) as string[]
    return { query, ok: true, findings: j?.choices?.[0]?.message?.content || '', citations: cites.filter(Boolean), error: null }
  } catch (e) {
    return { ...base, error: String((e as Error)?.message || e).slice(0, 120) }
  }
}

// ── The harness set ─────────────────────────────────────────────────────────

export type HarnessName =
  | 'supporting' | 'contradictory' | 'base_rate' | 'primary_source'
  | 'provenance_chain' | 'adjacent_category' | 'url_liveness' | 'publisher_beat'

export interface HarnessResult {
  harness: HarnessName
  subjectRef: string
  query: string | null
  verdict: 'hit' | 'miss' | 'skipped' | 'error' | 'budget'
  costCalls: number
  costFetches: number
  latencyMs: number
  payload: Record<string, unknown>
}

export interface HarnessContext {
  budget: RunBudget
  /** Individually skippable. A harness named here is not run, and says so. */
  disabled?: Set<HarnessName>
}

function skipResult(harness: HarnessName, ref: string, why: string): HarnessResult {
  return { harness, subjectRef: ref, query: null, verdict: 'skipped', costCalls: 0, costFetches: 0, latencyMs: 0, payload: { why } }
}

/** Wraps a probe so no harness can throw into the run loop, and so every probe
 *  reports its own cost and latency whatever happens. */
async function runProbe(
  harness: HarnessName,
  ref: string,
  ctx: HarnessContext,
  fn: () => Promise<Omit<HarnessResult, 'harness' | 'subjectRef' | 'costCalls' | 'costFetches' | 'latencyMs'>>,
): Promise<HarnessResult> {
  if (ctx.disabled?.has(harness)) return skipResult(harness, ref, 'disabled for this run')
  const t0 = Date.now()
  const callsBefore = ctx.budget.searchCalls + ctx.budget.modelCalls
  const fetchesBefore = ctx.budget.fetches
  try {
    const r = await fn()
    return {
      harness, subjectRef: ref, ...r,
      costCalls: ctx.budget.searchCalls + ctx.budget.modelCalls - callsBefore,
      costFetches: ctx.budget.fetches - fetchesBefore,
      latencyMs: Date.now() - t0,
    }
  } catch (e) {
    return {
      harness, subjectRef: ref, query: null, verdict: 'error',
      costCalls: ctx.budget.searchCalls + ctx.budget.modelCalls - callsBefore,
      costFetches: ctx.budget.fetches - fetchesBefore,
      latencyMs: Date.now() - t0,
      payload: { error: String((e as Error)?.message || e).slice(0, 200) },
    }
  }
}

function toResult(s: SearchResult): { query: string; verdict: HarnessResult['verdict']; payload: Record<string, unknown> } {
  const verdict: HarnessResult['verdict'] = s.error === 'budget_exhausted'
    ? 'budget'
    : s.error ? 'error' : s.citations.length ? 'hit' : 'miss'
  return { query: s.query, verdict, payload: { findings: s.findings.slice(0, 2000), citations: s.citations.slice(0, 12), error: s.error || null } }
}

/** 1. SUPPORTING EVIDENCE. Independent corroboration of the specific claim. */
export function harnessSupporting(ref: string, claim: string, ctx: HarnessContext): Promise<HarnessResult> {
  return runProbe('supporting', ref, ctx, async () => {
    const q = `Find independent reporting or a primary document that corroborates this specific claim, with URLs: "${claim.slice(0, 300)}". Prefer filings, regulator documents, transcripts and named mastheads over vendor blogs. If nothing independent exists, say so.`
    return toResult(await perplexity(q, ctx.budget))
  })
}

/** 2. CONTRADICTORY EVIDENCE. Asked as its own probe, because a model asked to
 *  "check" a claim will confirm it. Asking specifically for the disconfirming
 *  record is the only version of this that works. */
export function harnessContradictory(ref: string, claim: string, ctx: HarnessContext): Promise<HarnessResult> {
  return runProbe('contradictory', ref, ctx, async () => {
    const q = `Find evidence that CONTRADICTS or materially qualifies this claim, with URLs: "${claim.slice(0, 300)}". Look for disputed numbers, retractions, competing measurements, and regulators or analysts who disagree. If the record contains no contradiction, say exactly that.`
    return toResult(await perplexity(q, ctx.budget))
  })
}

/** 3. BASE RATES. The cheap kill: is the number remarkable against its own
 *  history, or is it just this year's version of a number that is always true. */
export function harnessBaseRate(ref: string, subject: string, ctx: HarnessContext): Promise<HarnessResult> {
  return runProbe('base_rate', ref, ctx, async () => {
    const q = `What is the historical base rate or prior-year comparison for this, with URLs and dates: "${subject.slice(0, 250)}". I want the denominator and the trend, not the headline. If the same claim has been made in earlier years, list those years and sources.`
    return toResult(await perplexity(q, ctx.budget))
  })
}

/** 4. PRIMARY SOURCE RETRIEVAL. Filings, dockets, regulator pages, changelogs. */
export function harnessPrimarySource(ref: string, subject: string, ctx: HarnessContext): Promise<HarnessResult> {
  return runProbe('primary_source', ref, ctx, async () => {
    const q = `Find the PRIMARY source document behind this, with direct URLs: "${subject.slice(0, 250)}". Acceptable: an SEC filing (10-K, 10-Q, 8-K, S-1), an earnings call transcript, a court docket, a regulator publication, a standards body document, an official pricing page or changelog, a paper on arXiv or with a DOI. Do not return news coverage. If no primary source exists, say so plainly.`
    return toResult(await perplexity(q, ctx.budget))
  })
}

/** 5. PROVENANCE CHAIN. Circular-reporting detection: who published the number
 *  FIRST, and is everyone else citing that one document. This is the probe that
 *  turns a blocked vendor anchor into a publishable circulation thesis. */
export function harnessProvenanceChain(ref: string, claim: string, ctx: HarnessContext): Promise<HarnessResult> {
  return runProbe('provenance_chain', ref, ctx, async () => {
    const q = `Trace the provenance of this number or claim: "${claim.slice(0, 300)}". Who published it FIRST, on what date, and in what kind of document (press release, blog, filing, study)? Then list every outlet that has repeated it, with URLs and dates. State explicitly whether the later coverage cites the original document or performed its own measurement.`
    const s = await perplexity(q, ctx.budget)
    const r = toResult(s)
    const domains = [...new Set(s.citations.map(c => rootDomain(c)).filter(Boolean) as string[])]
    return { ...r, payload: { ...r.payload, distinct_domains: domains.length, domains } }
  })
}

/** 6. ADJACENT CATEGORY COMPARISON. Does the same mechanism show up in a
 *  neighbouring market, and did it resolve differently there. */
export function harnessAdjacentCategory(ref: string, mechanism: string, ctx: HarnessContext): Promise<HarnessResult> {
  return runProbe('adjacent_category', ref, ctx, async () => {
    const q = `Where else has this same mechanism appeared, in a DIFFERENT industry or asset class, with URLs and dates: "${mechanism.slice(0, 250)}". For each, state what the mechanism was, and how it resolved. I want a structural comparison with a citable record, not a metaphor.`
    return toResult(await perplexity(q, ctx.budget))
  })
}
