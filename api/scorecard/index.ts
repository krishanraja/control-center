import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { resolveTz, ymdIn } from '../_timezone.js'
import {
  WEEKS, TARGETS, STOP_RULE, DAY_90, COLUMNS, COLS,
  weekEndingFor, deriveWeek, mergeOverrides, loadRows, weekValues, sumValues, gapTo,
  overrideKey, type ScorecardCol, type ScorecardRow,
} from '../_scorecard.js'

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
    const today = ymdIn(new Date(), tz)
    const weekEnding = weekEndingFor(today)
    const rows = await loadRows()

    const current = mergeOverrides(await deriveWeek(weekEnding, tz), rows.get(weekEnding))

    // Weeks to date resolve in parallel: a frozen week is one row read, an open
    // week is six counts. Future weeks are empty and cost nothing.
    const weeks = await Promise.all(WEEKS.map(async (w) => {
      const row = rows.get(w)
      const future = w > weekEnding
      const values = future
        ? null
        : (w === weekEnding ? current : await weekValues(w, row, tz))
      const overrides: Partial<Record<`override_${ScorecardCol}`, number | null>> = {}
      for (const col of COLS) overrides[overrideKey(col)] = row ? row[overrideKey(col)] ?? null : null
      return {
        week_ending: w,
        frozen_at: row?.frozen_at ?? null,
        plan_sent: row?.plan_sent ?? null,
        variance_note: row?.variance_note ?? null,
        approaches_sent: values ? values.approaches_sent : null,
        calls_taken: values ? values.calls_taken : null,
        paid_rooms: values ? values.paid_rooms : null,
        cash_invoiced_gbp: values ? values.cash_invoiced_gbp : null,
        pieces_published: values ? values.pieces_published : null,
        unasked_hours: values ? values.unasked_hours : null,
        unasked_measured: values ? values.unasked_measured : false,
        ...overrides,
      }
    }))

    const toDate = weeks.filter(w => w.approaches_sent != null).map(w => ({
      approaches_sent: w.approaches_sent as number,
      calls_taken: w.calls_taken as number,
      paid_rooms: w.paid_rooms as number,
      cash_invoiced_gbp: w.cash_invoiced_gbp as number,
      pieces_published: w.pieces_published as number,
      unasked_hours: w.unasked_hours as number,
    }))
    const totals = sumValues(toDate)

    return res.status(200).json({
      ok: true,
      week_ending: weekEnding,
      current,
      weeks,
      targets: TARGETS,
      columns: COLUMNS,
      totals,
      gap: gapTo(totals),
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
