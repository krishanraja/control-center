import { useCallback, useEffect, useState } from 'react'
import { getZone } from '../lib/civilDate'

// The twelve week scorecard, read through /api/scorecard. The tables behind it
// are service-role only, so nothing here touches PostgREST. One module-level
// cache shared by every mount (the Home line and the panel both read it), the
// same shape as useCriticalAlerts: a 60s poll, a refresh after a write, and
// listeners so a PATCH from the panel updates the line in the same tick.

export type ScorecardCol =
  | 'approaches_sent' | 'calls_taken' | 'paid_rooms'
  | 'cash_invoiced_gbp' | 'pieces_published' | 'unasked_hours'

export const SCORECARD_COLS: ScorecardCol[] = [
  'approaches_sent', 'calls_taken', 'paid_rooms', 'cash_invoiced_gbp', 'pieces_published', 'unasked_hours',
]

export type ScorecardValues = Record<ScorecardCol, number>

export interface ScorecardWeek {
  week_ending: string
  frozen_at: string | null
  plan_sent: number | null
  variance_note: string | null
  approaches_sent: number | null
  calls_taken: number | null
  paid_rooms: number | null
  cash_invoiced_gbp: number | null
  pieces_published: number | null
  unasked_hours: number | null
  unasked_measured: boolean
  override_approaches_sent: number | null
  override_calls_taken: number | null
  override_paid_rooms: number | null
  override_cash_invoiced_gbp: number | null
  override_pieces_published: number | null
  override_unasked_hours: number | null
}

export interface ScorecardCurrent extends ScorecardValues {
  week_ending: string
  unasked_measured: boolean
  commits: number
}

export interface StopRule { on: string; reads: string }

export interface Scorecard {
  weekEnding: string
  current: ScorecardCurrent
  weeks: ScorecardWeek[]
  targets: ScorecardValues
  totals: ScorecardValues
  gap: ScorecardValues
  stopRule: StopRule
  day90: string
  unaskedMeasured: boolean
}

const API = import.meta.env.VITE_API_URL ?? ''
const withTz = (path: string) => `${API}${path}${path.includes('?') ? '&' : '?'}tz=${encodeURIComponent(getZone())}`

const ZERO: ScorecardValues = {
  approaches_sent: 0, calls_taken: 0, paid_rooms: 0, cash_invoiced_gbp: 0, pieces_published: 0, unasked_hours: 0,
}

function values(src: unknown): ScorecardValues {
  const o = (src && typeof src === 'object' ? src : {}) as Record<string, unknown>
  const out = { ...ZERO }
  for (const col of SCORECARD_COLS) {
    const n = Number(o[col])
    out[col] = Number.isFinite(n) ? n : 0
  }
  return out
}

/** Shape whatever the route returned into a full scorecard. A catch-all mock
 *  answering `{ ok: true }` renders as an empty card, not a crash. */
function shape(j: Record<string, unknown>): Scorecard {
  const cur = (j.current && typeof j.current === 'object' ? j.current : {}) as Record<string, unknown>
  return {
    weekEnding: typeof j.week_ending === 'string' ? j.week_ending : '',
    current: {
      ...values(cur),
      week_ending: typeof cur.week_ending === 'string' ? cur.week_ending : '',
      unasked_measured: Boolean(cur.unasked_measured),
      commits: Number(cur.commits) || 0,
    },
    weeks: Array.isArray(j.weeks) ? (j.weeks as ScorecardWeek[]) : [],
    targets: values(j.targets),
    totals: values(j.totals),
    gap: values(j.gap),
    stopRule: (j.stop_rule && typeof j.stop_rule === 'object')
      ? (j.stop_rule as StopRule)
      : { on: '', reads: '' },
    day90: typeof j.day_90 === 'string' ? j.day_90 : '',
    unaskedMeasured: Boolean(j.unasked_measured),
  }
}

let cache: Scorecard | null = null
let loaded = false
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

async function fetchAll(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const r = await fetch(withTz('/api/scorecard'))
      const j = await r.json().catch(() => null)
      if (r.ok && j && j.ok) cache = shape(j as Record<string, unknown>)
    } catch {
      // keep the last good card; the next poll retries
    }
    loaded = true
    inflight = null
    notify()
  })()
  return inflight
}

/** Operator override for one cell. null clears it. Refreshes the cache. */
export async function overrideScorecard(weekEnding: string, col: ScorecardCol, value: number | null): Promise<void> {
  const r = await fetch(`${API}/api/scorecard`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ week_ending: weekEnding, [`override_${col}`]: value }),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`)
  await fetchAll()
}

export function useScorecard() {
  const [, setVersion] = useState(0)

  useEffect(() => {
    const listener = () => setVersion(v => v + 1)
    listeners.add(listener)
    if (!loaded) fetchAll()
    const interval = window.setInterval(fetchAll, 60_000)
    return () => {
      listeners.delete(listener)
      window.clearInterval(interval)
    }
  }, [])

  const refresh = useCallback(() => fetchAll(), [])
  const override = useCallback(
    (weekEnding: string, col: ScorecardCol, value: number | null) => overrideScorecard(weekEnding, col, value),
    [],
  )

  return {
    scorecard: cache,
    current: cache?.current ?? null,
    weeks: cache?.weeks ?? [],
    targets: cache?.targets ?? ZERO,
    totals: cache?.totals ?? ZERO,
    gap: cache?.gap ?? ZERO,
    stopRule: cache?.stopRule ?? null,
    day90: cache?.day90 ?? '',
    unaskedMeasured: cache?.unaskedMeasured ?? false,
    loading: !loaded,
    refresh,
    override,
  }
}
