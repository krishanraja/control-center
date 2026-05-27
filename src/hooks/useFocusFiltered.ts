import { useMemo } from 'react'
import { useDailyFocus } from './useDailyFocus'

// useFocusFiltered tags any list of rows with lane membership derived
// from the calibrated daily_focus.relevance_index. Critical alerts are
// never muted regardless of relevance. Caller passes the source table
// name plus the rows themselves; we look up <table>:<id> in the index.

export interface FocusFiltered<T> {
  row: T
  focus_target: 1 | 2 | 3 | null
  focus_score: number
  muted: boolean
}

interface MinimalRow {
  id: string | number
  severity?: string | null
}

export function useFocusFiltered<T extends MinimalRow>(
  rows: T[],
  table: string,
): { items: FocusFiltered<T>[]; active: boolean } {
  const { today } = useDailyFocus()

  return useMemo(() => {
    const calibrated = today && today.status === 'calibrated' || today?.status === 'complete'
    const idx = today?.relevance_index || {}
    return {
      active: !!calibrated,
      items: rows.map((r) => {
        const key = `${table}:${r.id}`
        const hit = idx[key]
        const focus_target = (hit && (hit.target === 1 || hit.target === 2 || hit.target === 3)) ? hit.target : null
        const focus_score = hit ? hit.score : 0
        const isCritical = (r.severity || '').toLowerCase() === 'critical'
        const muted = !!calibrated && !isCritical && (!hit || focus_target === null)
        return { row: r, focus_target, focus_score, muted }
      }),
    }
  }, [rows, table, today])
}
