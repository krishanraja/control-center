import React, { useCallback, useEffect, useState } from 'react'
import {
  CALIBRATION_MIN_CLOSED,
  formatDue,
  OUTCOME_LABEL,
  type DueResponse,
  type TestOutcome,
} from '../../lib/worryStates'

// Tests whose due date has arrived, and a calibration line once there is enough
// history for it to mean anything.
//
// This card renders NOTHING when nothing is due and calibration is not yet
// earned. It never nags, never shows a backlog, and never lists worries that
// are not due today. Styling is neutral regardless of the numbers: a run of
// disconfirmed predictions looks exactly like a run of confirmed ones.

const API = import.meta.env.VITE_API_URL ?? ''

export function DueTestsCard({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const [data, setData] = useState<DueResponse | null>(null)
  const [note, setNote] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/pilot/worries`)
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
    await fetch(`${API}/api/pilot/worries`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, outcome, outcome_note: note[id] || undefined }),
    })
    load()
  }

  if (!data) return null

  const showCalibration = data.calibration.total_closed >= CALIBRATION_MIN_CLOSED
  if (data.due.length === 0 && !showCalibration) return null

  const compact = variant === 'mobile'

  return (
    <div className={`rounded-2xl bg-white/[0.03] border border-white/[0.08] ${compact ? 'p-4' : 'p-5'} flex flex-col gap-4`}>
      {data.due.length > 0 && (
        <div className="flex flex-col gap-3">
          <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">
            {data.due.length === 1 ? 'A test is due' : `${data.due.length} tests are due`}
          </span>
          {data.due.map(t => (
            <div key={t.id} className="flex flex-col gap-2">
              <p className="text-[13px] leading-relaxed text-ink">{t.prediction}</p>
              <input
                value={note[t.id] || ''}
                onChange={e => setNote(prev => ({ ...prev, [t.id]: e.target.value }))}
                placeholder="One line, optional"
                className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.03] border border-white/10 text-[12px] text-ink placeholder:text-ink-faint outline-none focus:border-white/25"
              />
              <div className="flex gap-1.5">
                {(['confirmed', 'disconfirmed', 'partial'] as TestOutcome[]).map(o => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => close(t.id, o)}
                    className="px-2.5 py-1 rounded-md text-[11px] bg-white/[0.05] border border-white/10 text-ink-muted hover:bg-white/[0.10] hover:text-ink transition-colors"
                  >
                    {OUTCOME_LABEL[o]}
                  </button>
                ))}
                <span className="ml-auto self-center text-[11px] text-ink-faint">Due {formatDue(t.test_due_date)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCalibration && (
        <p className="text-[12px] text-ink-faint">
          Of your last {data.calibration.total_closed} predictions, {data.calibration.pct_confirmed}% came true.
        </p>
      )}
    </div>
  )
}
