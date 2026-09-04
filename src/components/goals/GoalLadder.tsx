import React, { useEffect, useMemo, useState } from 'react'
import { Check, Plus, Target, X } from '@/lib/icons'
import { useHaptics } from '../../hooks/useHaptics'
import { useGoalCanon, type CanonGoal } from '../../hooks/useGoalCanon'
import { useQuickCreateListener } from '../../lib/quickCreate'
import { createGoal, patchGoal, type GateVerdictWire } from '../../lib/goalsApi'
import { Eyebrow } from '../shared/Eyebrow'
import { FocusedEditor } from '../shared/FocusedEditor'
import { ServesPicker, VentureChips } from './GoalPickers'
import { Skeleton } from '../shared/Skeleton'
import { Working } from '../shared/Working'

// GoalLadder — the canon on Home: OS goals → this week's objectives, ONE place
// to enter a goal at either rung (canon §0a.2), rebuilt as a display-grade
// surface in the 2026-08-20 recompose.
//
// Krish: "radically simplified to an overall OS objective: this week's
// objectives and today's objectives that should feed and be canon for
// everything." This surface is the top two layers; TodayList renders the
// third from daily_focus. Two rungs, one editor, one wire path
// (src/lib/goalsApi.ts), staleness flagged quietly but urgently.

export type Horizon = 'os' | 'weekly'

/** Kept for callers that type against the ladder's row shape. */
export type LadderGoal = CanonGoal
export type GateVerdict = GateVerdictWire

export function GoalLadder({ variant = 'desktop' }: {
  variant?: 'desktop' | 'mobile'
}) {
  const h = useHaptics()
  const { canon, loading, error: loadError, refresh } = useGoalCanon()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ── composer state (one editor, both rungs) ────────────────────────────────
  const [adding, setAdding] = useState<Horizon | null>(null)
  const [title, setTitle] = useState('')
  const [parentId, setParentId] = useState('')
  const [venture, setVenture] = useState('')
  const [gate, setGate] = useState<GateVerdict | null>(null)

  // ── inline edit (title + retire only; the legacy % / notes fields retired) ─
  const [editing, setEditing] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const os = canon?.os ?? []
  const weekly = canon?.weekly ?? []
  const ventures = canon?.ventures ?? []
  const compact = variant === 'mobile'
  const osTitle = useMemo(() => new Map(os.map(g => [g.id, g.title])), [os])
  const weeklyActive = weekly.filter(g => g.status === 'active').length
  const weeklyDone = weekly.length - weeklyActive

  const needsParent = (hz: Horizon) => hz !== 'os'

  const openAdd = (hz: Horizon) => {
    h.select()
    setEditing(null)
    setAdding(hz); setTitle(''); setVenture(''); setGate(null)
    setParentId(hz === 'weekly' && os.length >= 1 ? os[0].id : '')
  }

  // On a phone the create sheet (+) is the only way in; the inline "+ Add"
  // links render on desktop only. The sheet reaches the same composer here.
  useQuickCreateListener('goal:os', () => openAdd('os'))
  useQuickCreateListener('goal:weekly', () => openAdd('weekly'))

  const save = async (opts: { override?: boolean } = {}) => {
    const hz = adding
    const raw = title.trim()
    if (!hz || !raw || saving) return
    if (needsParent(hz) && !parentId) return
    setSaving(true)
    try {
      const result = await createGoal({
        title: raw,
        horizon: hz,
        parentId: needsParent(hz) ? parentId : null,
        venture: hz === 'weekly' ? (venture || null) : null,
        override: opts.override === true,
      })
      // A held gate is not a failure: the form stays open with the verdict
      // attached so the fix is one edit away. (`=== false` narrows; strict off.)
      if (result.ok === false) {
        setGate(result.gate)
        h.error()
        return
      }
      h.success()
      setAdding(null); setTitle(''); setParentId(''); setVenture(''); setGate(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      h.error()
    } finally {
      setSaving(false)
    }
  }

  const patch = async (body: Record<string, unknown>) => {
    if (saving) return false
    setSaving(true)
    try {
      await patchGoal(body)
      refresh()
      setError(null)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      h.error()
      return false
    } finally {
      setSaving(false)
    }
  }

  // On a phone the editor is a focused sheet (text shown whole, mic, Save
  // riding above the keyboard, Retire behind a confirm). The inline row that
  // used to appear here could not fit a phone: input, Retire, Cancel and Save
  // shared one row and Save rendered off the right edge of the screen.
  const [sheetGoal, setSheetGoal] = useState<CanonGoal | null>(null)

  const startEdit = (g: CanonGoal) => {
    h.select()
    setAdding(null)
    if (compact) { setSheetGoal(g); return }
    setEditing(g.id)
    setEditTitle(g.title)
  }

  const saveEdit = async (id: string) => {
    const ok = await patch({ goalId: id, title: editTitle.trim() })
    if (ok) { h.success(); setEditing(null) }
  }

  // Retiring is a status change, never a DELETE (canon Rule A: decay stays
  // reversible; the row keeps the history learning signals hang off).
  const retire = async (g: CanonGoal) => {
    const ok = await patch({ goalId: g.id, status: 'dropped' })
    if (ok) { h.success(); setEditing(null) }
  }

  const toggleDone = async (g: CanonGoal) => {
    h.tap()
    await patch({ goalId: g.id, status: g.status === 'done' ? 'active' : 'done' })
  }

  if (loading && !canon) {
    return (
      <div className="flex flex-col gap-5" aria-busy="true">
        <div>
          <Skeleton h={11} w={30} r={3} className="mb-3" />
          {[0, 1, 2].map(i => <Skeleton key={i} h={compact ? 18 : 22} w={`${78 - i * 9}%`} r={4} className="mb-2.5" />)}
        </div>
        <div>
          <Skeleton h={11} w={72} r={3} className="mb-3" />
          {[0, 1, 2].map(i => <Skeleton key={i} h={15} w={`${70 - i * 6}%`} r={4} className="mb-2" />)}
        </div>
      </div>
    )
  }

  const staleChip = (g: CanonGoal) => g.is_stale && (
    <span
      className="text-micro px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 whitespace-nowrap"
      title={`Untouched ${g.days_since_touch}d, stale after ${g.stale_after_days}d`}
    >
      stale {g.days_since_touch}d
    </span>
  )

  const composer = adding && (
    <div className="mt-2.5 rounded-xl border border-violet-400/25 bg-violet-500/[0.06] p-3">
      <div className="flex items-center justify-between mb-2">
        <Eyebrow tone="accent">{adding === 'os' ? 'New OS goal' : 'New weekly objective'}</Eyebrow>
        <button type="button" onClick={() => { setAdding(null); setGate(null) }} aria-label="Cancel" className="text-white/35 hover:text-white/70">
          <X size={14} />
        </button>
      </div>

      <input
        autoFocus
        value={title}
        onChange={e => { setTitle(e.target.value); if (gate) setGate(null) }}
        onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { setAdding(null); setGate(null) } }}
        placeholder={adding === 'os' ? 'What is the whole system for?' : 'What moves an OS goal this week?'}
        className="w-full min-h-[40px] px-3 rounded-lg bg-white/[0.04] border border-white/10 text-body text-white/90 placeholder:text-white/25 outline-none focus:border-violet-400/40"
      />

      {adding !== 'os' && (
        <div className="mt-2.5 space-y-2.5">
          <ServesPicker os={os} value={parentId} onChange={setParentId} disabled={saving} />
          <VentureChips ventures={ventures} value={venture} onChange={setVenture} disabled={saving} />
        </div>
      )}

      {/* The gate did not pass: the specific failures stay attached to the
          form, a one-click fix where the gate could suggest one, and an
          explicit recorded way through. */}
      {gate && (
        <div className="mt-2.5 rounded-lg border border-amber-400/25 bg-amber-500/[0.07] p-2.5">
          <Eyebrow className="!text-amber-200/85">{gate.verdict === 'wrong_tier' ? 'Wrong rung' : 'Not saved yet'}</Eyebrow>
          {gate.reasoning && <p className="mt-1 text-label text-white/70 leading-snug">{gate.reasoning}</p>}
          {gate.issues.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {gate.issues.map((it, i) => (
                <li key={i} className="text-label leading-snug">
                  <span className="text-amber-200/80 font-medium">{it.dimension}: </span>
                  <span className="text-white/70">{it.problem}</span>
                  {it.fix && <span className="text-white/45"> {it.fix}</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {gate.suggested_tier && gate.suggested_tier !== adding && (
              <button
                type="button"
                disabled={saving}
                onClick={() => { const t = gate.suggested_tier!; setGate(null); setAdding(t) }}
                className="min-h-[30px] px-2.5 rounded-md bg-amber-400/15 border border-amber-300/30 text-label text-amber-100 hover:bg-amber-400/25 disabled:opacity-50"
              >
                Move to {gate.suggested_tier === 'os' ? 'OS goals' : 'This week'}
              </button>
            )}
            {gate.suggested_rewrite && (
              <button
                type="button"
                disabled={saving}
                onClick={() => { setTitle(gate.suggested_rewrite!); setGate(null) }}
                className="min-h-[30px] px-2.5 rounded-md bg-white/[0.07] border border-white/15 text-label text-white/85 hover:bg-white/[0.12] disabled:opacity-50"
              >
                Use the suggested wording
              </button>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() => void save({ override: true })}
              className="min-h-[30px] px-2.5 rounded-md text-label text-white/45 hover:text-white/80 underline underline-offset-2 disabled:opacity-50"
            >
              Save as written
            </button>
          </div>
          {gate.suggested_rewrite && (
            <p className="mt-2 text-micro text-white/45 leading-snug italic">{gate.suggested_rewrite}</p>
          )}
          {!gate.model_used && (
            <p className="mt-2 text-micro text-white/35 leading-snug">
              Structural checks only. The judgment pass did not run, so this goal was not fully assessed.
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !title.trim() || (adding !== 'os' && !parentId)}
        className="mt-3 w-full min-h-[38px] rounded-lg btn-contrast text-label font-semibold disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Add'}
      </button>
    </div>
  )

  return (
    <div className={`flex flex-col min-w-0 ${compact ? 'gap-3' : 'gap-5'}`}>
      {(error || loadError) && <p className="text-label text-rose-300">{error || loadError}</p>}

      {/* ── OS: what the whole system is for ─────────────────────────────── */}
      <section aria-label="OS goals" className="min-w-0">
        <div className="flex items-baseline gap-2 mb-2">
          <Eyebrow>OS</Eyebrow>
          {!compact && (
            <button
              type="button"
              onClick={() => openAdd('os')}
              aria-label="Add an OS goal"
              className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-micro font-semibold text-ink-muted hover:text-violet-200 transition-colors"
            >
              <Plus size={10} /> Add
            </button>
          )}
        </div>
        {os.length === 0 ? (
          <div>
            <p className="text-body text-white/50 leading-relaxed">
              Nothing set yet. Start with an OS goal: what the whole system is for. Everything below hangs off it.
            </p>
            {!adding && (
              <button
                type="button"
                onClick={() => openAdd('os')}
                className="mt-2.5 min-h-[40px] px-4 rounded-xl border border-violet-400/40 bg-violet-500/25 hover:bg-violet-500/35 text-ui font-semibold text-violet-50 transition-colors"
              >
                Set your OS goals
              </button>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {os.map(g => (
              <li key={g.id} className="min-w-0">
                {editing === g.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void saveEdit(g.id); if (e.key === 'Escape') setEditing(null) }}
                      className="flex-1 min-h-[38px] px-2.5 rounded-lg bg-white/[0.04] border border-white/10 text-ui text-white/90 outline-none focus:border-violet-400/40"
                    />
                    <button type="button" onClick={() => void retire(g)} disabled={saving} title="Retire this goal (reversible)" className="px-2 py-1 text-micro text-white/40 hover:text-rose-300 disabled:opacity-40">Retire</button>
                    <button type="button" onClick={() => setEditing(null)} className="px-2 py-1 text-micro text-white/45 hover:text-white/80">Cancel</button>
                    <button type="button" onClick={() => void saveEdit(g.id)} disabled={saving || !editTitle.trim()} className="px-3 py-1.5 rounded-lg btn-contrast text-micro font-semibold disabled:opacity-40">
                      {saving ? <Working size={11} /> : 'Save'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(g)}
                    className="w-full text-left flex items-baseline gap-2 group min-w-0"
                  >
                    <span className={`font-display ${compact ? 'text-lede' : 'text-title'} text-white/90 group-hover:text-white leading-tight break-words min-w-0 line-clamp-1 [@media(max-height:820px)]:text-lede`}>
                      {g.title}
                    </span>
                    {staleChip(g)}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {adding === 'os' && composer}
      </section>

      {/* ── THIS WEEK: what moves an OS goal this week ────────────────────── */}
      <section aria-label="This week's objectives" className="min-w-0">
        <div className="flex items-baseline gap-2 mb-2">
          <Eyebrow>This week</Eyebrow>
          {weekly.length > 0 && (
            <span className="text-micro text-white/35 tabular-nums font-mono">{weeklyDone}/{weekly.length}</span>
          )}
          {!compact && os.length > 0 && weeklyActive < 3 && (
            <button
              type="button"
              onClick={() => openAdd('weekly')}
              aria-label="Add a weekly objective"
              className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-micro font-semibold text-ink-muted hover:text-violet-200 transition-colors"
            >
              <Plus size={10} /> Add
            </button>
          )}
        </div>
        {weekly.length === 0 ? (
          <p className="text-body text-white/40 leading-relaxed">
            {os.length === 0 ? 'Set an OS goal first.' : 'No objectives set for this week.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {weekly.map(g => {
              const done = g.status === 'done'
              return (
                <li key={g.id} className="flex items-start gap-3 min-w-0 group/row">
                  <button
                    type="button"
                    onClick={() => void toggleDone(g)}
                    aria-label={done ? 'Mark not done' : 'Mark done'}
                    className={`mt-[1px] w-[22px] h-[22px] shrink-0 rounded-[7px] border inline-flex items-center justify-center transition-colors ${done ? 'bg-emerald-400/80 border-emerald-300/60 text-emerald-950' : 'border-white/25 hover:border-white/50'}`}
                  >
                    {done && <Check size={12} />}
                  </button>
                  {editing === g.id ? (
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void saveEdit(g.id); if (e.key === 'Escape') setEditing(null) }}
                        className="flex-1 min-w-0 min-h-[34px] px-2 rounded-lg bg-white/[0.04] border border-white/10 text-body text-white/90 outline-none focus:border-violet-400/40"
                      />
                      <button type="button" onClick={() => void retire(g)} disabled={saving} title="Drop this objective (reversible)" className="px-1.5 text-micro text-white/40 hover:text-rose-300 disabled:opacity-40">Drop</button>
                      <button type="button" onClick={() => void saveEdit(g.id)} disabled={saving || !editTitle.trim()} className="px-2.5 py-1 rounded-lg btn-contrast text-micro font-semibold disabled:opacity-40">
                        {saving ? <Working size={11} /> : 'Save'}
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => startEdit(g)} className="flex-1 text-left min-w-0 pt-[1px]">
                      <span className="flex items-baseline gap-2 min-w-0">
                        <span className={`text-body leading-snug truncate ${done ? 'text-white/40 line-through' : 'text-white/90'}`}>
                          {g.title}
                        </span>
                        {g.venture && <span className="shrink-0 text-micro px-1 py-0.5 rounded bg-white/[0.06] text-white/40">{g.venture}</span>}
                        {staleChip(g)}
                      </span>
                      {/* The serves-chip is a second line on desktop only; on
                          mobile every row stays single-line so the canon fits. */}
                      {!compact && g.parent_id && osTitle.get(g.parent_id) && (
                        <span className="mt-0.5 flex items-center gap-1 text-micro text-white/40 min-w-0">
                          <Target size={9} className="opacity-60 flex-shrink-0" /><span className="truncate">{osTitle.get(g.parent_id)}</span>
                        </span>
                      )}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {adding === 'weekly' && composer}
      </section>

      {/* The phone's goal editor. Writes stay on the one wire path (patch →
          goalsApi); this sheet is only the hands. */}
      <FocusedEditor
        open={sheetGoal !== null}
        onClose={() => setSheetGoal(null)}
        label={sheetGoal?.horizon === 'os' ? 'OS goal' : 'Weekly objective'}
        value={sheetGoal?.title ?? ''}
        placeholder={sheetGoal?.horizon === 'os' ? 'What is the whole system for?' : 'What moves an OS goal this week?'}
        onSave={async text => sheetGoal ? await patch({ goalId: sheetGoal.id, title: text }) : false}
        danger={sheetGoal ? {
          label: sheetGoal.horizon === 'os' ? 'Retire this goal' : 'Drop this objective',
          confirmLabel: 'Tap again to confirm',
          run: async () => await patch({ goalId: sheetGoal.id, status: 'dropped' }),
        } : undefined}
      />
    </div>
  )
}
