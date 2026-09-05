import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { isJob } from '../_mission.js'

// POST /api/daily-focus/calibrate
//   Body: { date, targets: [{ text, source, replaced_marcus_pick? }] }
//   Upserts daily_focus on focus_date, fires calibrator webhook async,
//   returns { ok, row_id } immediately. Also double-writes a feedback_queue
//   row per swap so Vera's weekly aggregation sees the override.

// n8n webhook origin is constant (per-instance, not per-environment).
// N8N_API_BASE_URL in Vercel includes /api/v1 for management calls;
// webhooks live at /webhook/<path> on the same host.
const N8N_WEBHOOK_ORIGIN = 'https://krishraja10101.app.n8n.cloud'
const CALIBRATE_WEBHOOK = `${N8N_WEBHOOK_ORIGIN}/webhook/focus-calibrate`

type Source = 'marcus_nominated' | 'krish_swapped' | 'krish_added'

interface InputTarget {
  text: string
  source: Source
  concept_id?: string | null
  /** Optional canon link: the weekly goal this pick serves (goals.id). */
  goal_id?: string | null
  /** Which of the five jobs of the OS this pick serves (api/_mission.ts). */
  job?: string | null
  replaced_marcus_pick?: Record<string, unknown> | null
}

interface Body {
  date?: string
  targets?: InputTarget[]
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as Body
  if (!body.date || !isYmd(body.date)) return res.status(400).json({ ok: false, error: 'date must be YYYY-MM-DD' })
  if (!Array.isArray(body.targets) || body.targets.length !== 3) {
    return res.status(400).json({ ok: false, error: 'targets must be exactly 3 entries' })
  }
  for (let i = 0; i < 3; i++) {
    const t = body.targets[i]
    if (!t || typeof t.text !== 'string' || t.text.trim().length === 0) {
      return res.status(400).json({ ok: false, error: `targets[${i}].text required` })
    }
    if (!['marcus_nominated', 'krish_swapped', 'krish_added'].includes(t.source)) {
      return res.status(400).json({ ok: false, error: `targets[${i}].source invalid` })
    }
    if (t.job != null && !isJob(t.job)) {
      return res.status(400).json({ ok: false, error: `targets[${i}].job invalid` })
    }
  }

  const row: Record<string, unknown> = {
    focus_date: body.date,
    status: 'pending',
    relevance_index: {},
    marcus_suggestions: [],
  }
  body.targets.forEach((t, i) => {
    const n = i + 1
    row[`target_${n}_text`] = t.text.trim()
    row[`target_${n}_source`] = t.source
    row[`target_${n}_concept_id`] = t.concept_id || null
    // The canon chain, OS -> week -> today, made explicit per pick. The
    // column lands with the home-canon migration; a bad id resolves to null
    // via the FK's ON DELETE rather than failing the lock.
    row[`target_${n}_goal_id`] = t.goal_id || null
    row[`target_${n}_job`] = t.job || null
    row[`target_${n}_replaced_marcus_pick`] = t.replaced_marcus_pick || null
  })

  const { data, error } = await supabase
    .from('daily_focus')
    .upsert(row, { onConflict: 'focus_date' })
    .select('id')
    .single()
  if (error) return res.status(500).json({ ok: false, error: error.message })
  const row_id = data.id as string

  // Double-write feedback rows for swaps + added picks. Mirrors the
  // Phase 0 marcus_priority_override shape so Vera's weekly aggregation
  // picks them up alongside the Home swap affordance.
  const overrideRows = body.targets
    .map((t, i) => ({ t, slot: i }))
    .filter(({ t }) => t.source === 'krish_swapped' || t.source === 'krish_added')
    .map(({ t, slot }) => ({
      source_table: 'home_intelligence',
      source_id: String(slot),
      agent_id: 'marcus',
      original_agent: 'marcus',
      original_item_id: String(slot),
      vote: -1,
      reason_code: 'marcus_priority_override',
      reason_text: t.text,
      meta: {
        original_pick_title: (t.replaced_marcus_pick as { title?: string } | null)?.title || null,
        original_pick_meta: t.replaced_marcus_pick || null,
        replaced_with_text: t.text,
        captured_at: new Date().toISOString(),
        source_phase: 'phase1_calibrate',
      },
      status: 'pending',
    }))
  if (overrideRows.length > 0) {
    await supabase.from('feedback_queue').insert(overrideRows)
  }

  // Await the calibrator webhook so the row is calibrated by the time
  // the UI's spinner clears. Vercel functions can't fire-and-forget
  // without waitUntil; awaiting is simpler and the webhook usually
  // returns inside 15s (Sonnet 4.6 call dominates the wall time).
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort('calibrate_timeout'), 90_000)
  let webhook_ok = false
  let webhook_detail: string | null = null
  try {
    const r = await fetch(CALIBRATE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: body.date,
        row_id,
        targets: body.targets.map((t, i) => ({
          text: t.text.trim(),
          slot: i + 1,
          source: t.source,
          concept_id: t.concept_id || null,
          replaced_marcus_pick: t.replaced_marcus_pick || null,
        })),
      }),
      signal: ctrl.signal,
    })
    webhook_ok = r.ok
    webhook_detail = r.ok ? null : `webhook ${r.status}`
  } catch (e) {
    webhook_detail = (e as Error).message || 'webhook_error'
  } finally {
    clearTimeout(tid)
  }

  return res.json({ ok: true, row_id, webhook_ok, webhook_detail })
}
