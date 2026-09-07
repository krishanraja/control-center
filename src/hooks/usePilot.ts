import { useCallback, useEffect, useState } from 'react'
import type { LogShipInput, PilotMode, PilotState, ShipSummary, TomorrowSlot } from '../types/pilot'
import { syncZoneToServer, getZone } from '../lib/civilDate'
import { requestJson, requestOk, ApiError } from '../lib/apiFetch'

// Single reader of pilot state. Deliberately thin: no realtime channel, no
// shared cache across mounts. The gate reads once on load and the widget reads
// once per mount, because a live-updating ship count would turn the ledger into
// the ambient dashboard the whole layer exists to avoid.

// Every day-scoped call carries the operator's zone, so switching zones takes
// effect on the very next request rather than waiting out the server's cache,
// and two lambda instances can never serve two different days to one session.
const withTz = (path: string) => `${path}${path.includes('?') ? '&' : '?'}tz=${encodeURIComponent(getZone())}`
const tzBody = (o: Record<string, unknown>) => ({ ...o, tz: getZone() })

/**
 * How long the boot read may take before the gate stops waiting. The gate
 * fails open on error, so past this the dashboard renders rather than a
 * held splash. Long enough for a poor mobile link, short enough that "is it
 * broken" never has to be asked.
 */
export const PILOT_BOOT_TIMEOUT_MS = 12_000

interface PilotStateResult {
  state: PilotState | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function usePilotState(): PilotStateResult {
  const [state, setState] = useState<PilotState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const json = await requestOk<Record<string, any>>(withTz('/api/pilot/checkin'), { timeoutMs: PILOT_BOOT_TIMEOUT_MS })
      // The device is the authority on what day it is. Push, never adopt: the
      // old call did the reverse and let a zone stored from the laptop overrule
      // a phone that had physically moved.
      syncZoneToServer(json.timezone)
      setState({
        morning: json.morning,
        last_evening: json.last_evening,
        evening_done_today: json.evening_done_today,
        yesterday: json.yesterday ?? null,
        today: json.today,
      })
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Could not reach the pilot layer')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { state, loading, error, refresh }
}

/** energy <= 2 or anxiety >= 4 routes to red. Everything else is green. */
export function computeMode(energy: number, anxiety: number): PilotMode {
  return energy <= 2 || anxiety >= 4 ? 'red' : 'green'
}

/** The one-line reason shown beside the computed mode, so the routing is legible. */
export function modeReason(energy: number, anxiety: number): string {
  if (energy <= 2 && anxiety >= 4) return `Energy ${energy}, anxiety ${anxiety}. Both point the same way.`
  if (energy <= 2) return `Energy ${energy}. Low enough that choosing is the hard part.`
  if (anxiety >= 4) return `Anxiety ${anxiety}. High enough that a list would become a loop.`
  return `Energy ${energy}, anxiety ${anxiety}. Nothing is in the way.`
}

export async function saveMorning(input: {
  energy: number | null
  anxiety: number | null
  one_word: string
  mode: PilotMode
  intent?: string
  /** Which venture today is for. Accountability, not scoping. */
  venture?: string | null
  /** Closes the day without a reading. Sends no energy or anxiety. */
  skipped?: boolean
}): Promise<void> {
  await requestOk('/api/pilot/checkin', { method: 'POST', body: tzBody({ kind: 'morning', ...input }), timeoutMs: 12_000 })
}

export async function saveEvening(input: {
  shipped_today?: string
  tomorrow_one: string
  tomorrow_one_url?: string
  /** Tomorrow's 3. Slot 1 mirrors tomorrow_one; 2 and 3 are optional. The
   *  route writes them onto tomorrow's daily_focus row. */
  tomorrow?: TomorrowSlot[]
}): Promise<void> {
  // Two writes behind this (the check-in row and tomorrow's Today), so a
  // little more room than a plain save before it is called hung.
  await requestOk('/api/pilot/checkin', { method: 'POST', body: tzBody({ kind: 'evening', ...input }), timeoutMs: 15_000 })
}

/**
 * Close tonight's shutdown prompt without choosing. Writes a skipped evening
 * row, so the prompt stays away until tomorrow on every device, the same way a
 * skipped morning closes the gate. Best effort: a failed write still leaves
 * the local day flag in place.
 */
export async function skipEvening(): Promise<void> {
  await requestJson('/api/pilot/checkin', { method: 'POST', body: tzBody({ kind: 'evening', skipped: true }), timeoutMs: 10_000 }).catch(() => {})
}

/** Records the red mode escape hatch on today's morning row. */
export async function logOverride(): Promise<void> {
  await requestJson(withTz('/api/pilot/checkin'), { method: 'PATCH', timeoutMs: 10_000 }).catch(() => {})
}

export async function logShip(input: LogShipInput): Promise<void> {
  await requestOk('/api/pilot/ships', { method: 'POST', body: tzBody({ source: 'manual', ...input }), timeoutMs: 12_000 })
}

interface ShipSummaryResult {
  summary: ShipSummary | null
  loading: boolean
  refresh: () => Promise<void>
}

export function useShipSummary(): ShipSummaryResult {
  const [summary, setSummary] = useState<ShipSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const json = await requestOk<Record<string, any>>(withTz('/api/pilot/ships'), { timeoutMs: 12_000 })
      setSummary({
        this_week: json.this_week,
        days_since_last: json.days_since_last,
        last_ten: json.last_ten || [],
        return_rate: json.return_rate,
      })
    } catch {
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { summary, loading, refresh }
}
