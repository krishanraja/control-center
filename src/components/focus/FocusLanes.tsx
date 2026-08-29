import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from '@/lib/icons'
import { useFocusFiltered } from '../../hooks/useFocusFiltered'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import type { FocusMode } from '../../hooks/useFocusMode'

interface MinimalRow { id: string | number; severity?: string | null }

interface Props<T extends MinimalRow> {
  rows: T[]
  /**
   * The source table the calibrator keyed in daily_focus.relevance_index.
   * Must be one of the pooled tables for lanes to populate: 'tasks', 'leads',
   * 'visibility_targets', 'customers', 'bets', 'decisions_waiting' (and, once
   * the calibrator pool is extended, 'content_ideas' and 'guests').
   */
  table: string
  renderItem: (row: T) => React.ReactNode
  keyOf: (row: T) => string
  /** The caller's normal list, rendered when focus is not calibrated. */
  fallback: React.ReactNode
  mutedLabel?: string
}

// Generic focus-lane view, extracted from DecisionsWaitingPanel's lane logic so
// every work-item tab can adopt the same shape. When today's daily_focus is
// calibrated, groups rows into the 3 daily-target lanes (via relevance_index)
// plus a collapsed, dimmed Muted lane; otherwise renders `fallback`. Critical
// rows are never muted (enforced in useFocusFiltered).
export function FocusLanes<T extends MinimalRow>({
  rows, table, renderItem, keyOf, fallback, mutedLabel = 'Muted',
}: Props<T>) {
  const focused = useFocusFiltered(rows, table)
  const { today } = useDailyFocus()
  const [mutedOpen, setMutedOpen] = useState(false)

  if (!focused.active) return <>{fallback}</>

  const laneText = (n: number) =>
    today?.[`target_${n}_text` as 'target_1_text' | 'target_2_text' | 'target_3_text'] || `Target ${n}`
  const muted = focused.items.filter(it => it.muted).map(it => it.row)

  return (
    <div>
      {[1, 2, 3].map(n => {
        const laneRows = focused.items.filter(it => it.focus_target === n).map(it => it.row)
        return (
          <div key={`lane-${n}`} className="border-t border-white/[0.04] first:border-t-0">
            <div className="flex items-baseline gap-2 pt-2 pb-1.5 px-1">
              <span className="text-micro uppercase tracking-[0.14em] text-violet-300 font-semibold">Lane {n}</span>
              <span className="text-micro text-white/70 truncate">{laneText(n)}</span>
              <span className="ml-auto text-micro text-white/40 tabular-nums">{laneRows.length}</span>
            </div>
            {laneRows.length === 0 ? (
              <p className="text-micro text-white/40 py-1.5 px-1">Nothing in lane.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {laneRows.map(r => <React.Fragment key={keyOf(r)}>{renderItem(r)}</React.Fragment>)}
              </div>
            )}
          </div>
        )
      })}
      {muted.length > 0 && (
        <div className="border-t border-white/[0.04] mt-1">
          <button
            type="button"
            onClick={() => setMutedOpen(v => !v)}
            className="w-full flex items-center gap-2 py-2 px-1 text-micro text-white/45 hover:text-white/75"
          >
            {mutedOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <span>{mutedLabel}</span>
            <span className="tabular-nums">({muted.length})</span>
          </button>
          {mutedOpen && (
            <div className="opacity-60 flex flex-col gap-1.5">
              {muted.map(r => <React.Fragment key={`m-${keyOf(r)}`}>{renderItem(r)}</React.Fragment>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Segmented Focus / All control. Show it only when focus mode is enabled and a
// calibrated daily_focus exists (otherwise there is nothing to focus).
export function FocusModeToggle({ mode, onChange }: { mode: FocusMode; onChange: (m: FocusMode) => void }) {
  return (
    <div className="inline-flex items-center rounded-md border border-white/[0.10] overflow-hidden text-micro font-semibold">
      {(['focus', 'all'] as FocusMode[]).map(m => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={`px-2.5 py-1 uppercase tracking-[0.14em] transition-colors ${
            mode === m ? 'bg-violet-500/30 text-violet-100' : 'text-white/45 hover:text-white/75'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  )
}
