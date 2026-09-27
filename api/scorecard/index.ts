import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { resolveTz } from '../_timezone.js'
import {
  TARGETS, STOP_RULE, DAY_90, COLUMNS, COLS,
  weekEndingFor, scorecardToDate, overrideKey, type ScorecardRow,
} from '../_scorecard.js'
import { guard } from '../_auth.js'

/**
 * /api/scorecard
 *
 * GET   the twelve week scorecard the Home line and the panel render. Public
 *       read, matching api/pilot/ships.ts: the edge gate in middleware.ts
 *       already keeps /api/* behind the dashboard curtain. The current week is
 *       derived live; frozen weeks come from scorecard_weeks; operator
 *       overrides win either way; future weeks are empty.
 *
 * PATCH { week_ending, override_<col>: number | null } an operator override.
 *       Unauthenticated for the same reason the manual ship POST is: this is
 *       Krish tapping a cell in his own browser, and the browser cannot hold a
 *       secret. The blast radius is one corrected number on a table only he
 *       reads, and every override is visible beside the derived value it
 *       replaced. Nothing here sends anything.
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && guard(req, res, ['PATCH'])) return

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') return get(req, res)
  if (req.method === 'PATCH') return patch(req, res)
  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}

async function get(req: VercelRequest, res: VercelResponse) {
  try {
    const tz = await resolveTz(req)
    // The week loop lives in api/_scorecard.ts (scorecardToDate), the one copy
    // the strategist's grounding reads too.
    const { week_ending, current, weeks, totals, gap } = await scorecardToDate(tz)

    return res.status(200).json({
      ok: true,
      week_ending,
      current,
      weeks,
      targets: TARGETS,
      columns: COLUMNS,
      totals,
      gap,
      stop_rule: STOP_RULE,
      day_90: DAY_90,
      unasked_measured: current.unasked_measured,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ ok: false, error: msg })
  }
}

async function patch(req: VercelRequest, res: VercelResponse) {
  const body = (req.body || {}) as Record<string, unknown>
  const weekEnding = typeof body.week_ending === 'string' ? body.week_ending.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekEnding)) {
    return res.status(400).json({ ok: false, error: '"week_ending" must be YYYY-MM-DD' })
  }
  if (weekEndingFor(weekEnding) !== weekEnding) {
    return res.status(400).json({ ok: false, error: '"week_ending" must be a Friday' })
  }

  const patchRow: Record<string, unknown> = { week_ending: weekEnding, updated_at: new Date().toISOString() }
  let touched = 0
  for (const col of COLS) {
    const key = overrideKey(col)
    if (!(key in body)) continue
    const v = body[key]
    if (v === null) { patchRow[key] = null; touched += 1; continue }
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ ok: false, error: `"${key}" must be a number of zero or more, or null` })
    }
    patchRow[key] = col === 'cash_invoiced_gbp' || col === 'unasked_hours' ? n : Math.round(n)
    touched += 1
  }
  if (!touched) {
    return res.status(400).json({ ok: false, error: 'Send at least one override_<column>' })
  }

  const { data, error } = await supabase
    .from('scorecard_weeks')
    .upsert(patchRow, { onConflict: 'week_ending' })
    .select('*')
    .single()
  if (error) return res.status(500).json({ ok: false, error: error.message })
  return res.status(200).json({ ok: true, row: data as ScorecardRow })
}
