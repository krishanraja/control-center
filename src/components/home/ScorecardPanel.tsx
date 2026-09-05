import React, { useState } from 'react'
import { Eyebrow } from '../shared/Eyebrow'
import { Skeleton } from '../shared/Skeleton'
import { useDeferredPending } from '../shared/useDeferredPending'
import { useScorecard, SCORECARD_COLS, type ScorecardCol, type ScorecardWeek } from '../../hooks/useScorecard'

/**
 * The twelve week scorecard, opened from any cell of the Home line.
 *
 * Weeks as rows, six columns, the targets row and the totals row, the stop
 * rule with its date, day 90. Rendering is NEUTRAL: no colour, weight or copy
 * changes with how a number looks. A week behind plan renders exactly as
 * calmly as a week ahead of it. The numbers are the judgment; the table is
 * not allowed to have one.
 *
 * Tapping a cell of a week that has values opens a small numeric input for an
 * operator override. The override is stored beside the derived value, never
 * over it, so the table shows both (the derived number sits under the input
 * while it is open).
 */

const LABELS: Record<ScorecardCol, string> = {
  approaches_sent: 'Sent',
  calls_taken: 'Calls',
  paid_rooms: 'Paid',
  cash_invoiced_gbp: 'Cash GBP',
  pieces_published: 'Published',
  unasked_hours: 'Unasked',
}

function fmtNum(col: ScorecardCol, v: number | null | undefined): string {
  if (v == null) return ''
  if (col === 'cash_invoiced_gbp') return Math.round(v).toLocaleString('en-GB')
  if (col === 'unasked_hours') return `${v}h`
  return String(v)
}

function fmtDay(ymd: string): string {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)))
}

function fmtLong(ymd: string): string {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)))
}

const cell = 'px-2 py-1.5 text-right font-mono tabular-nums text-label text-white/85 whitespace-nowrap'
const head = 'px-2 py-1.5 text-right whitespace-nowrap'

export function ScorecardPanel() {
  const { weeks, targets, totals, stopRule, day90, unaskedMeasured, loading, override } = useScorecard()
  const showBars = useDeferredPending(loading)
  const [editing, setEditing] = useState<{ week: string; col: ScorecardCol } | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = (w: ScorecardWeek, col: ScorecardCol) => {
    if (w[col] == null) return
    const current = w[`override_${col}`]
    setEditing({ week: w.week_ending, col })
    setDraft(current == null ? '' : String(current))
    setError(null)
  }

  const commit = async () => {
    if (!editing || saving) return
    const trimmed = draft.trim()
    const value = trimmed === '' ? null : Number(trimmed)
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      setError('A number of zero or more, or empty to clear.')
      return
    }
    setSaving(true)
    try {
      await override(editing.week, editing.col, value)
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Eyebrow>Twelve week scorecard</Eyebrow>
        <p className="mt-1 text-label text-white/50">
          Weeks end on Fridays. Tap a number to set an override; leave it empty to clear one.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton quiet={!showBars} h={14} />
          <Skeleton quiet={!showBars} h={14} />
          <Skeleton quiet={!showBars} h={14} />
        </div>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="px-2 py-1.5 text-left whitespace-nowrap"><Eyebrow>Week</Eyebrow></th>
                {SCORECARD_COLS.map(col => (
                  <th key={col} className={head}>
                    <Eyebrow>{LABELS[col]}</Eyebrow>
                    {col === 'unasked_hours' && (
                      <span className="block font-sans text-micro normal-case tracking-normal text-white/40">
                        {unaskedMeasured ? 'estimate from commits' : 'not measured yet'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map(w => (
                <tr key={w.week_ending} className="border-b border-white/[0.05]">
                  <td className="px-2 py-1.5 text-left font-mono tabular-nums text-label text-white/60 whitespace-nowrap">
                    {fmtDay(w.week_ending)}
                  </td>
                  {SCORECARD_COLS.map(col => {
                    const isEditing = editing?.week === w.week_ending && editing.col === col
                    const overridden = w[`override_${col}`] != null
                    return (
                      <td key={col} className={cell}>
                        {isEditing ? (
                          <span className="inline-flex flex-col items-end gap-0.5">
                            <input
                              autoFocus
                              inputMode="decimal"
                              value={draft}
                              onChange={e => setDraft(e.target.value)}
                              onBlur={commit}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); commit() }
                                if (e.key === 'Escape') { e.preventDefault(); setEditing(null) }
                              }}
                              disabled={saving}
                              aria-label={`Override ${LABELS[col]} for the week ending ${fmtLong(w.week_ending)}`}
                              className="w-16 rounded-md border border-white/20 bg-white/[0.06] px-1.5 py-0.5 text-right font-mono tabular-nums text-label text-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
                            />
                            <span className="text-micro text-white/40">derived {fmtNum(col, w[col])}</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => open(w, col)}
                            disabled={w[col] == null}
                            title={overridden ? `Override set. Derived ${fmtNum(col, w[col])}.` : undefined}
                            className="min-h-[24px] rounded px-1 font-mono tabular-nums disabled:cursor-default"
                          >
                            {w[col] == null
                              ? <span className="text-white/25" aria-label="Not yet">&middot;</span>
                              : fmtNum(col, w[col])}
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr className="border-t border-white/[0.12]">
                <td className="px-2 py-1.5 text-left whitespace-nowrap"><Eyebrow>Total</Eyebrow></td>
                {SCORECARD_COLS.map(col => (
                  <td key={col} className={cell}>{fmtNum(col, totals[col])}</td>
                ))}
              </tr>
              <tr>
                <td className="px-2 py-1.5 text-left whitespace-nowrap"><Eyebrow>Target</Eyebrow></td>
                {SCORECARD_COLS.map(col => (
                  <td key={col} className={cell}>{fmtNum(col, targets[col])}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="text-label text-white/60">{error}</p>}

      <div className="flex flex-col gap-2 border-t border-white/[0.06] pt-3">
        {stopRule?.on && (
          <p className="text-label text-white/60">
            <span className="text-white/85">Stop rule, read on {fmtLong(stopRule.on)}.</span>{' '}
            {stopRule.reads}
          </p>
        )}
        {day90 && (
          <p className="text-label text-white/60">
            <span className="text-white/85">Day 90 is {fmtLong(day90)}.</span>{' '}
            Targets: {targets.approaches_sent} sent, {targets.calls_taken} calls, {targets.paid_rooms} paid {targets.paid_rooms === 1 ? 'room' : 'rooms'},{' '}
            {Math.round(targets.cash_invoiced_gbp).toLocaleString('en-GB')} GBP invoiced, {targets.pieces_published} pieces published,{' '}
            {targets.unasked_hours} hours building unasked.
          </p>
        )}
      </div>
    </div>
  )
}
