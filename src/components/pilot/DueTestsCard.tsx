import React, { useCallback, useEffect, useState } from 'react'
import { FoldToggle } from '../shared/FoldToggle'
import { BottomSheet } from '../mobile/BottomSheet'
import {
  CALIBRATION_MIN_CLOSED,
  formatDue,
  OUTCOME_LABEL,
  type DueResponse,
  type TestOutcome,
} from '../../lib/worryStates'
import { getZone } from '../../lib/civilDate'
import { useHaptics } from '../../hooks/useHaptics'

// Tests whose due date has arrived, and a calibration line once there is enough
// history for it to mean anything.
//
// This card renders NOTHING when nothing is due and calibration is not yet
// earned. It never nags, never shows a backlog, and never lists worries that
// are not due today. Styling is neutral regardless of the numbers: a run of
// disconfirmed predictions looks exactly like a run of confirmed ones.

const API = import.meta.env.VITE_API_URL ?? ''
const tzq = () => `?tz=${encodeURIComponent(getZone())}`

export function DueTestsCard({ variant = 'desktop', fold = false, open = false, onPin }: {
  variant?: 'desktop' | 'mobile'
  /** Home never scrolls (src/lib/homeFolds.ts): folded, a due test is one
   *  line that says so, and Show opens it. */
  fold?: boolean
  /** Opened in place by hand from the fold (the desk), which offers Hide. */
  open?: boolean
  onPin?: (open: boolean) => void
} = {}) {
  // On a phone a folded due test opens in the house sheet, never in place: it
  // is about 260px with its note and its three answers, which a 360x640 screen
  // cannot lend the stage even with everything else folded (DESIGN_SYSTEM.md:
  // a stage's unbounded fold opens in a drawer). On the desk it opens in place.
  // One instance either way, so an answer given in the sheet is the answer
  // the folded line shows.
  const [sheet, setSheet] = useState(false)
  const [data, setData] = useState<DueResponse | null>(null)
  const [note, setNote] = useState<Record<string, string>>({})
  const h = useHaptics()

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/pilot/worries${tzq()}`)
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'failed')
      setData({
        due: json.due || [],
        calibration: json.calibration,
        open_test_count: json.open_test_count,
        cap: json.cap,
        today: json.today,
      })
    } catch {
      setData(null)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const close = async (id: string, outcome: TestOutcome) => {
    h.notifySuccess()
    await fetch(`${API}/api/pilot/worries${tzq()}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, outcome, outcome_note: note[id] || undefined }),
    })
    load()
  }

  if (!data) return null

  // Fail open: a worries response without a calibration block must render as
  // "nothing due", never crash the Home error boundary (the pilot layer's
  // failure posture — a broken pilot read never degrades the app).
  const showCalibration = (data.calibration?.total_closed ?? 0) >= CALIBRATION_MIN_CLOSED
  if (data.due.length === 0 && !showCalibration) return null

  const compact = variant === 'mobile'
  const dueLabel = data.due.length === 1 ? 'A test is due' : `${data.due.length} tests are due`

  // Folded: what is owed, in one line. The calibration line is history, not a
  // thing owed today, so a fold with nothing due shows nothing.
  if (fold && !open) {
    if (data.due.length === 0) return null
    const show = compact ? () => setSheet(true) : onPin ? () => onPin(true) : null
    return (
      <>
        <div className="flex items-baseline gap-2" data-testid="due-tests" data-folded="true">
          <span className="text-micro uppercase tracking-[0.14em] text-ink-faint">{dueLabel}</span>
          {show && <FoldToggle open={false} onToggle={show} what="the tests that are due" testId="due-tests-fold" />}
        </div>
        {compact && (
          <BottomSheet open={sheet} onClose={() => setSheet(false)} fullHeight={false} ariaLabel="Tests that are due">
            <div className="pb-2">{full(false)}</div>
          </BottomSheet>
        )}
      </>
    )
  }

  return full(open && Boolean(onPin))

  function full(hideToggle: boolean) {
    return (
      <div data-testid="due-tests" data-folded="false" className={`rounded-2xl bg-white/[0.03] border border-white/[0.08] ${compact ? 'p-4' : 'p-5'} flex flex-col gap-4`}>
        {data!.due.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <span className="text-micro uppercase tracking-[0.14em] text-ink-faint">{dueLabel}</span>
              {hideToggle && onPin && <FoldToggle open onToggle={() => onPin(false)} what="the tests that are due" testId="due-tests-fold" />}
            </div>
            {data!.due.map(t => (
              <div key={t.id} className="flex flex-col gap-2">
                <p className="text-body leading-relaxed text-ink">{t.prediction}</p>
                <input
                  value={note[t.id] || ''}
                  onChange={e => setNote(prev => ({ ...prev, [t.id]: e.target.value }))}
                  placeholder="One line, optional"
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-lg bg-white/[0.03] border border-white/10 text-lede text-ink placeholder:text-ink-faint outline-none focus:border-white/25"
                />
                <div className="flex gap-1.5">
                  {(['confirmed', 'disconfirmed', 'partial'] as TestOutcome[]).map(o => (
                    <button
                      key={o}
                      type="button"
                      onPointerDown={() => h.select()}
                      onClick={() => close(t.id, o)}
                      className="min-h-[44px] px-3.5 rounded-xl text-body bg-white/[0.05] border border-white/10 text-ink-muted hover:bg-white/[0.10] hover:text-ink transition-all active:scale-95 touch-manipulation"
                    >
                      {OUTCOME_LABEL[o]}
                    </button>
                  ))}
                  <span className="ml-auto self-center text-micro text-ink-faint">Due {formatDue(t.test_due_date)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {showCalibration && (
          <p className="text-label text-ink-faint">
            Of your last {data!.calibration.total_closed} predictions, {data!.calibration.pct_confirmed}% came true.
          </p>
        )}
      </div>
    )
  }
}
