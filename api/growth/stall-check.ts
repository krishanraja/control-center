import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { webResearch } from '../_enrich.js'
import { callClaude, robustJson, loadVoiceBlock, VOICE_GUARDRAILS } from '../_content.js'

/**
 * /api/growth/stall-check — the stall detector + 3-moves playbook.
 *
 *   GET (cron)                         — daily 07:00 UTC (after the 05:30
 *                                        snapshot). Bearer CRON_SECRET or the
 *                                        Bearer CRON_SECRET.
 *   POST { action:'run', dry_run? }    — manual evaluation pass.
 *   POST { action:'adopt', id, move_index } — turn one drafted move into a
 *                                        task for the right agent; stall ->
 *                                        acknowledged.
 *   POST { action:'dismiss', id }      — dismiss the episode.
 *   POST { action:'redraft', id }      — re-run drafting on an open stall.
 *
 * Evaluation, per metric key:
 *   1. Freshness gate: newest snapshot older than 3 days is a DATA problem,
 *      not a stall — skip and audit_log it (never fire off a dead feed).
 *   2. Stalled = latest value <= the value `window` days earlier (flat or
 *      down). Window: system_config.growth_stall_days {default, overrides}.
 *   3. One open episode per key (partial unique index) — fires once, like the
 *      acquisition governor's per-month dedupe.
 *   4. On a new stall: insert the row, then draft ~3 concrete moves (Claude +
 *      web research, grounded in Krish's voice). Drafts only. Nothing sends.
 *   5. Auto-resolve: an open/acknowledged episode whose metric now exceeds its
 *      baseline resolves itself.
 */

// substack_tech0nomic_total is deliberately NOT watched. The publication was
// retired on 2026-08-06 and folded into Mindmaker LIVE, so it is flat by design
// and stall-detecting it would draft growth moves for a channel nobody publishes
// to. Its label stays below so historical episodes still render.
const WATCHED_KEYS = [
  'substack_mindmakerlive_total',
  'maven_students',
  'app_paid_subs',
  'app_mrr_usd',
  'guests_confirmed_30d',
  'visibility_accepted_30d',
] as const

const KEY_LABEL: Record<string, string> = {
  substack_mindmakerlive_total: 'Mindmaker Live Substack subscribers',
  substack_tech0nomic_total: 'Techonomic Substack subscribers (retired)',
  maven_students: 'Maven students',
  app_paid_subs: 'paid app subscribers',
  app_mrr_usd: 'app MRR',
  guests_confirmed_30d: 'podcast guests confirmed (30d)',
  visibility_accepted_30d: 'visibility wins (30d)',
}

// Which engine a key belongs to decides who executes an adopted move.
const KEY_CHANNEL: Record<string, { channel: string; agent: string }> = {
  substack_mindmakerlive_total: { channel: 'content', agent: 'cleo' },
  substack_tech0nomic_total: { channel: 'content', agent: 'cleo' },
  maven_students: { channel: 'content', agent: 'cleo' },
  app_paid_subs: { channel: 'app', agent: 'maya' },
  app_mrr_usd: { channel: 'app', agent: 'maya' },
  guests_confirmed_30d: { channel: 'network', agent: 'nell' },
  visibility_accepted_30d: { channel: 'network', agent: 'nova' },
}

const FRESHNESS_MAX_DAYS = 3

interface Move { title: string; rationale: string; first_step: string; channel: string; agent: string }

async function readStallConfig(): Promise<{ default: number; overrides: Record<string, number> }> {
  const { data } = await supabase.from('system_config').select('value').eq('key', 'growth_stall_days').maybeSingle()
  try {
    const v = JSON.parse(data?.value || 'null')
    if (v && typeof v.default === 'number') return { default: v.default, overrides: v.overrides || {} }
  } catch { /* fall through */ }
  return { default: 14, overrides: {} }
}

async function auditLog(event_type: string, target: string, display_message: string, details: unknown) {
  const { error } = await supabase.from('audit_log').insert({
    event_type,
    actor: 'growth-stall-cron',
    target,
    display_message,
    details: JSON.stringify(details),
  })
  if (error) console.warn('[growth/stall-check] audit_log failed:', error.message)
}

async function draftMoves(metricKey: string, baseline: number, latest: number, windowDays: number): Promise<Move[]> {
  const label = KEY_LABEL[metricKey] || metricKey
  const { channel, agent } = KEY_CHANNEL[metricKey] || { channel: 'content', agent: 'cleo' }

  let research = ''
  try {
    const q = channel === 'content'
      ? `Concrete, currently-working tactics (mid-2026) to grow ${label.includes('Maven') ? 'Maven course enrollments' : 'Substack newsletter subscribers'} for a solo B2B thought leader: cross-posts, recommendations, collabs, distribution moves. Name specific mechanisms.`
      : channel === 'app'
        ? 'Concrete, currently-working tactics (mid-2026) for a solo founder to grow paid subscriptions for a small B2B SaaS product portfolio without paid ads. Name specific mechanisms.'
        : 'Concrete, currently-working tactics (mid-2026) to get booked as a podcast guest and land speaking slots for a B2B AI advisor. Name specific mechanisms.'
    const r = await webResearch(q)
    research = r.text.slice(0, 4000)
  } catch { /* research is best-effort; the draft still grounds in context */ }

  let voice = ''
  try { voice = await loadVoiceBlock() } catch { /* optional */ }

  const system = [
    'You are Marcus, the COO-synthesis agent in Krish Raja\'s Mindmaker OS.',
    `A growth line has stalled and your job is to hand Krish exactly 3 concrete moves he can approve in one tap. He runs: Mindmaker (AI advisory + Maven courses under the profile maven.com/mindmaker), two Substacks (mindmakerlive, tech0nomic), a small portfolio of B2B apps, and two podcasts (The Builder Economy, Signal & Noise).`,
    'Each move must be a specific, executable play (a named cross-post pitch, a specific piece to publish, a specific outreach), never generic advice like "post more consistently".',
    voice ? `Krish voice rules:\n${voice.slice(0, 2000)}` : '',
    VOICE_GUARDRAILS,
    'Respond with ONLY a JSON array of exactly 3 objects: [{"title": string (<=80 chars), "rationale": string (<=200 chars, why this move for this stall), "first_step": string (<=160 chars, the literal first action)}]. No prose around the JSON. No em dashes anywhere in any string.',
  ].filter(Boolean).join('\n\n')

  const user = [
    `Stalled metric: ${label} (${metricKey}).`,
    `It was ${baseline} ${windowDays} days ago and is ${latest} now (flat or down across the whole window).`,
    research ? `Current-tactics research:\n${research}` : '',
    'Draft the 3 moves.',
  ].filter(Boolean).join('\n\n')

  const raw = await callClaude({ system, user, maxTokens: 1200, temperature: 0.6 })
  const parsed = robustJson(raw)
  if (!Array.isArray(parsed)) throw new Error('drafting returned non-array')
  return parsed.slice(0, 3).map((m: any) => ({
    title: String(m.title || '').replace(/—|―/g, ',').slice(0, 120),
    rationale: String(m.rationale || '').replace(/—|―/g, ',').slice(0, 300),
    first_step: String(m.first_step || '').replace(/—|―/g, ',').slice(0, 240),
    channel,
    agent,
  })).filter(m => m.title)
}

async function runCheck(dryRun: boolean) {
  const cfg = await readStallConfig()
  const results: Array<Record<string, unknown>> = []
  const today = new Date().toISOString().slice(0, 10)

  // One fetch of the whole watched series set for the widest window in play.
  const maxWindow = Math.max(cfg.default, ...Object.values(cfg.overrides), 14)
  const since = new Date(Date.now() - (maxWindow + 7) * 86_400_000).toISOString().slice(0, 10)
  const { data: rows, error } = await supabase
    .from('growth_metrics')
    .select('metric_key, metric_date, value')
    .gte('metric_date', since)
    .order('metric_date', { ascending: true })
    .limit(2000)
  if (error) throw new Error(error.message)

  const { data: openStalls } = await supabase
    .from('growth_stalls')
    .select('*')
    .in('status', ['open', 'acknowledged'])

  for (const key of WATCHED_KEYS) {
    const windowDays = cfg.overrides[key] ?? cfg.default
    const series = (rows || []).filter(r => r.metric_key === key)
    const existing = (openStalls || []).find(s => s.metric_key === key)

    if (!series.length) { results.push({ key, outcome: 'no_data' }); continue }
    const latest = series[series.length - 1]
    const latestValue = Number(latest.value)

    // Auto-resolve first: movement above baseline closes the episode even if
    // the feed later goes stale.
    if (existing && Number.isFinite(latestValue) && latestValue > Number(existing.baseline_value)) {
      if (!dryRun) {
        await supabase.from('growth_stalls')
          .update({ status: 'resolved', resolved_at: new Date().toISOString(), latest_value: latestValue, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        await auditLog('growth_stall_resolved', key, `${KEY_LABEL[key] || key} moved again (${existing.baseline_value} -> ${latestValue}).`, { id: existing.id })
      }
      results.push({ key, outcome: 'resolved' })
      continue
    }

    // Freshness gate: a dead feed is a data problem, not a stall.
    const staleDays = Math.floor((Date.parse(today) - Date.parse(latest.metric_date)) / 86_400_000)
    if (staleDays > FRESHNESS_MAX_DAYS) {
      if (!dryRun) await auditLog('growth_stall_skipped_stale_feed', key, `Feed ${staleDays}d stale, stall check skipped.`, { staleDays })
      results.push({ key, outcome: 'stale_feed', staleDays })
      continue
    }

    if (existing) { results.push({ key, outcome: 'already_open' }); continue }

    // Baseline = value at (latest date - window). Requires history spanning
    // the window; a brand-new series cannot stall.
    const cutoff = Date.parse(latest.metric_date) - windowDays * 86_400_000
    let baseline: number | null = null
    for (const p of series) {
      if (Date.parse(p.metric_date) <= cutoff) baseline = Number(p.value)
      else break
    }
    if (baseline == null || !Number.isFinite(baseline)) { results.push({ key, outcome: 'insufficient_history' }); continue }

    const stalled = latestValue <= baseline
    if (!stalled) { results.push({ key, outcome: 'moving' }); continue }
    if (dryRun) { results.push({ key, outcome: 'would_fire', baseline, latest: latestValue }); continue }

    // Fire: open the episode, then draft the moves. The insert races safely
    // against a concurrent run via the partial unique index.
    const { data: inserted, error: insErr } = await supabase
      .from('growth_stalls')
      .insert({ metric_key: key, window_days: windowDays, baseline_value: baseline, latest_value: latestValue })
      .select('id')
      .maybeSingle()
    if (insErr || !inserted) { results.push({ key, outcome: 'insert_failed', error: insErr?.message }); continue }

    let moves: Move[] = []
    try {
      moves = await draftMoves(key, baseline, latestValue, windowDays)
      await supabase.from('growth_stalls')
        .update({ moves, moves_drafted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', inserted.id)
    } catch (e: any) {
      // The stall still surfaces without moves; redraft can fill them in.
      await supabase.from('growth_stalls')
        .update({ meta: { draft_error: String(e?.message || e) }, updated_at: new Date().toISOString() })
        .eq('id', inserted.id)
    }
    await auditLog('growth_stall_fired', key,
      `${KEY_LABEL[key] || key} flat for ${windowDays}d (${baseline} -> ${latestValue}). ${moves.length} moves drafted.`,
      { id: inserted.id, baseline, latest: latestValue, moves_count: moves.length })
    results.push({ key, outcome: 'fired', baseline, latest: latestValue, moves: moves.length })
  }

  return { results, dry_run: dryRun }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Cache-Control', 'no-store')
  if (guardCronRoute(req, res)) return

  try {
    if (req.method === 'GET') {
      const result = await runCheck(req.query.dry_run === '1')
      return res.json({ ok: true, ...result })
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'GET (cron) or POST only' })

    const body = (req.body || {}) as { action?: string; id?: string; move_index?: number; dry_run?: boolean }

    if (body.action === 'run') {
      // The cron-equivalent run must prove the same credential the GET path does.
      // The stall-move branches below stay open: they are UI-driven and already
      // require a valid existing stall id.
      const secret = process.env.CRON_SECRET || ''
      const auth = req.headers.authorization || ''
      if (!secret || auth !== `Bearer ${secret}`) {
        return res.status(401).json({ ok: false, error: 'unauthorized' })
      }
      const result = await runCheck(!!body.dry_run)
      return res.json({ ok: true, ...result })
    }

    if (!body.id) return res.status(400).json({ ok: false, error: 'id is required' })
    const { data: stall, error: sErr } = await supabase.from('growth_stalls').select('*').eq('id', body.id).maybeSingle()
    if (sErr || !stall) return res.status(404).json({ ok: false, error: 'stall not found' })

    if (body.action === 'adopt') {
      const idx = Number(body.move_index)
      const moves = (stall.moves || []) as Move[]
      const move = moves[idx]
      if (!move) return res.status(400).json({ ok: false, error: 'move_index out of range' })
      const taskId = `growth-move-${stall.id}-${idx}`
      const { data: existingTask } = await supabase.from('tasks').select('id').eq('id', taskId).maybeSingle()
      if (!existingTask) {
        const { error: tErr } = await supabase.from('tasks').insert({
          id: taskId,
          title: move.title,
          description: `${move.rationale}\n\nFirst step: ${move.first_step}\n\n(Adopted from the ${KEY_LABEL[stall.metric_key] || stall.metric_key} stall.)`,
          agent: move.agent || 'cleo',
          status: 'waiting',
          priority: 'high',
          workstream: 'growth_stall',
          created: new Date().toISOString(),
        })
        if (tErr) return res.status(502).json({ ok: false, error: tErr.message })
      }
      await supabase.from('growth_stalls')
        .update({ status: 'acknowledged', updated_at: new Date().toISOString() })
        .eq('id', stall.id)
      await auditLog('growth_stall_adopted', stall.metric_key, `Adopted move: ${move.title}`, { stall_id: stall.id, move_index: idx, task_id: taskId })
      return res.json({ ok: true, task_id: taskId })
    }

    if (body.action === 'dismiss') {
      await supabase.from('growth_stalls')
        .update({ status: 'dismissed', updated_at: new Date().toISOString() })
        .eq('id', stall.id)
      await auditLog('growth_stall_dismissed', stall.metric_key, 'Stall dismissed by Krish.', { stall_id: stall.id })
      return res.json({ ok: true })
    }

    if (body.action === 'redraft') {
      const moves = await draftMoves(stall.metric_key, Number(stall.baseline_value), Number(stall.latest_value), stall.window_days)
      await supabase.from('growth_stalls')
        .update({ moves, moves_drafted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', stall.id)
      return res.json({ ok: true, moves })
    }

    return res.status(400).json({ ok: false, error: "action must be 'run', 'adopt', 'dismiss', or 'redraft'" })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
