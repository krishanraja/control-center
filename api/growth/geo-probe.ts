import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

/**
 * /api/growth/geo-probe - the weekly GEO citation probe.
 *
 *   GET (cron)                        - Vercel cron Mondays 06:00 UTC, or
 *                                       Bearer CRON_SECRET. ?dry_run=1 plans the
 *                                       run and returns the question list
 *                                       WITHOUT calling Perplexity (a dry run
 *                                       must not burn credits).
 *   POST { action:'run', dry_run? }   - manual run.
 *
 * What it does: takes every live `channel='geo'` touchpoint off the growth map,
 * turns its icp_trigger into the literal questions a buyer would type, asks each
 * one through Perplexity, and records honestly whether any Mindmake property
 * came back in the answer or its citations. Every row is linked to the
 * touchpoint that produced it, so the Growth tab can say which map entry is
 * winning and which is invisible.
 *
 * Cost discipline: the probe is bounded at MAX_PROBES_PER_RUN questions per run,
 * highest cost-efficiency touchpoints first. Anything over the cap is reported
 * in `skipped` rather than silently dropped, so a map that grows to 200 rows
 * cannot quietly turn into a 200-call weekly bill.
 *
 * Never invents a citation: a failed Perplexity call writes NOTHING for that
 * question and is returned in `failed`. A miss is recorded as we_cited=false,
 * which is the actual finding, not an error.
 */

// Every Mindmake property. A hit on any of these in the answer text or the
// citation list is a citation for us.
const OUR_DOMAINS = [
  'circle.fractionl.ai',
  'pulse.fractionl.ai',
  'ctrl.mindmake.co',
  'mindmake.co',
  'fractionl.ai',
  'mindmakerlive.substack.com',
]

const ENGINE = 'perplexity'
const MODEL = 'sonar'
const MAX_PROBES_PER_RUN = 12
const MAX_COMPETITORS = 8
const ANSWER_SNAPSHOT_CHARS = 1800

interface Touchpoint {
  id: string
  product_slug: string
  icp_trigger: string
  coverage_status: string
  cost_efficiency_score: number | null
}

interface PlannedProbe {
  touchpoint_id: string
  product_slug: string
  question: string
  score: number
}

/** Turn one clause of an icp_trigger into the question a buyer would actually type. */
function toQuestion(raw: string): string {
  const s = raw.trim().replace(/\s+/g, ' ')
  if (!s) return ''
  const capped = s.charAt(0).toUpperCase() + s.slice(1)
  return /[?]$/.test(capped) ? capped : `${capped}?`
}

/**
 * icp_trigger on the map is written as one or more buyer questions separated by
 * " / " (e.g. "How do I get my first fractional clients / should I go
 * fractional"). Split on that separator, drop fragments too short to be a real
 * query, and cap the fan-out per touchpoint so one verbose row cannot eat the
 * whole run budget.
 */
function questionsFrom(icpTrigger: string): string[] {
  const parts = String(icpTrigger || '')
    .split('/')
    .map(p => p.trim())
    .filter(p => p.length >= 12)
  const source = parts.length ? parts : [String(icpTrigger || '').trim()]
  const out: string[] = []
  for (const p of source) {
    const q = toQuestion(p)
    if (q && !out.includes(q)) out.push(q)
    if (out.length >= 4) break
  }
  return out
}

/** Plan the run: which touchpoint questions get asked, in which order, and what falls off the cap. */
function planProbes(touchpoints: Touchpoint[]): { planned: PlannedProbe[]; skipped: PlannedProbe[] } {
  const all: PlannedProbe[] = []
  const ordered = [...touchpoints].sort(
    (a, b) =>
      (b.cost_efficiency_score ?? 0) - (a.cost_efficiency_score ?? 0) ||
      a.product_slug.localeCompare(b.product_slug),
  )
  for (const t of ordered) {
    for (const question of questionsFrom(t.icp_trigger)) {
      all.push({
        touchpoint_id: t.id,
        product_slug: t.product_slug,
        question,
        score: t.cost_efficiency_score ?? 0,
      })
    }
  }
  return { planned: all.slice(0, MAX_PROBES_PER_RUN), skipped: all.slice(MAX_PROBES_PER_RUN) }
}

interface ProbeAnswer { text: string; citations: string[] }

async function askPerplexity(question: string, apiKey: string): Promise<ProbeAnswer> {
  const r = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: question }] }),
  })
  if (!r.ok) throw new Error(`perplexity_${r.status}: ${(await r.text().catch(() => '')).slice(0, 160)}`)
  const j: any = await r.json()
  const text: string = j?.choices?.[0]?.message?.content ?? ''
  const citations: string[] = Array.isArray(j?.citations)
    ? j.citations.filter((c: unknown) => typeof c === 'string')
    : Array.isArray(j?.search_results)
      ? j.search_results.map((s: any) => s?.url).filter((u: unknown) => typeof u === 'string')
      : []
  return { text, citations }
}

/** Which of our domains the answer or its citations actually mention. */
function ourHits(answer: ProbeAnswer): string[] {
  const blob = `${answer.text} ${answer.citations.join(' ')}`.toLowerCase()
  return OUR_DOMAINS.filter(d => blob.includes(d))
}

async function auditLog(display_message: string, details: unknown) {
  const { error } = await supabase.from('audit_log').insert({
    event_type: 'growth_geo_probe',
    actor: 'growth-geo-probe-cron',
    target: 'growth_geo_probes',
    display_message,
    details: JSON.stringify(details),
  })
  if (error) console.warn('[growth/geo-probe] audit_log failed:', error.message)
}

async function runProbe(dryRun: boolean) {
  const { data, error } = await supabase
    .from('growth_touchpoints')
    .select('id, product_slug, icp_trigger, coverage_status, cost_efficiency_score')
    .eq('channel', 'geo')
    .neq('coverage_status', 'retired')
  if (error) throw new Error(error.message)

  const touchpoints = (data || []) as Touchpoint[]
  const { planned, skipped } = planProbes(touchpoints)

  const skippedReport = skipped.map(s => ({
    product_slug: s.product_slug,
    question: s.question,
    reason: `over the ${MAX_PROBES_PER_RUN}-probe per-run cap`,
  }))

  if (dryRun) {
    return {
      dry_run: true,
      touchpoints: touchpoints.length,
      planned: planned.map(p => ({ product_slug: p.product_slug, question: p.question, touchpoint_id: p.touchpoint_id })),
      skipped: skippedReport,
      note: 'dry run makes no Perplexity calls and writes nothing',
    }
  }

  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY not configured')

  const rows: Record<string, unknown>[] = []
  const failed: Array<{ product_slug: string; question: string; error: string }> = []
  const results: Array<{ product_slug: string; question: string; we_cited: boolean; hits: string[] }> = []

  for (const p of planned) {
    try {
      const answer = await askPerplexity(p.question, apiKey)
      const hits = ourHits(answer)
      rows.push({
        product_slug: p.product_slug,
        question: p.question,
        engine: ENGINE,
        answer_snapshot: answer.text.slice(0, ANSWER_SNAPSHOT_CHARS),
        we_cited: hits.length > 0,
        competitors_cited: answer.citations.slice(0, MAX_COMPETITORS),
        touchpoint_id: p.touchpoint_id,
      })
      results.push({ product_slug: p.product_slug, question: p.question, we_cited: hits.length > 0, hits })
    } catch (e: any) {
      failed.push({ product_slug: p.product_slug, question: p.question, error: String(e?.message || e) })
    }
  }

  let inserted = 0
  if (rows.length) {
    const { error: insErr, count } = await supabase
      .from('growth_geo_probes')
      .insert(rows, { count: 'exact' })
      .select('id')
    if (insErr) throw new Error(`insert: ${insErr.message}`)
    inserted = count ?? rows.length
  }

  const cited = results.filter(r => r.we_cited).length
  const citationRate = results.length ? cited / results.length : null

  await auditLog(
    `GEO probe: ${inserted} recorded, ${cited} cited (${citationRate == null ? 'n/a' : `${Math.round(citationRate * 100)}%`}), ${failed.length} failed, ${skippedReport.length} skipped.`,
    { inserted, cited, citation_rate: citationRate, failed, skipped: skippedReport },
  )

  return {
    dry_run: false,
    touchpoints: touchpoints.length,
    probed: results.length,
    inserted,
    cited,
    citation_rate: citationRate,
    failed,
    skipped: skippedReport,
    results,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    if (req.method === 'GET') {
      const secret = process.env.CRON_SECRET || ''
      const auth = req.headers.authorization || ''
      // NOTE: x-vercel-cron is NOT stripped by Vercel on inbound external
      // requests (verified 2026-08-05: a spoofed header returned 200 and ran
      // the job), so it is not proof of anything. Vercel sends
      // `Authorization: Bearer $CRON_SECRET` on cron invocations whenever
      // CRON_SECRET is set, which it is. Bearer-only matches the proven
      // pattern in api/feed/ingest.ts.
      if (!secret || auth !== `Bearer ${secret}`) {
        return res.status(401).json({ ok: false, error: 'unauthorized' })
      }
      const result = await runProbe(req.query.dry_run === '1')
      return res.json({ ok: true, ...result })
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'GET (cron) or POST only' })

    const body = (req.body || {}) as { action?: string; dry_run?: boolean }
    // Manual POST must prove the same credential the cron path proves. These
    // routes spend real money (Perplexity, Anthropic), and `/api/*` is
    // deliberately ungated by middleware, so an unauthenticated POST was a
    // free way for anyone who guessed the URL to burn credits on demand.
    const secret = process.env.CRON_SECRET || ''
    const auth = req.headers.authorization || ''
    if (!secret || auth !== `Bearer ${secret}`) {
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }
    if (body.action !== 'run') return res.status(400).json({ ok: false, error: "action must be 'run'" })
    const result = await runProbe(!!body.dry_run)
    return res.json({ ok: true, ...result })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}

export const config = { maxDuration: 300 }
