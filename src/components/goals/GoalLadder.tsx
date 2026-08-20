import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Plus, Target, X } from 'lucide-react'
import { useHaptics } from '../../hooks/useHaptics'
import { Working } from '../shared/Working'
import { createGoal, patchGoal, type GateVerdictWire } from '../../lib/goalsApi'

const API = import.meta.env.VITE_API_URL ?? ''

// GoalLadder — ONE place to enter a goal, at any altitude (canon §0a.2).
//
// Krish: "There should be only one place to enter one goal and it is the one
// source of truth... allow me to enter my OS goals, mid term goals and weekly
// goals, from which the objectives per lane/venture should be sharpened. Its
// all part of one system and staleness should be flagged as urgent."
//
// This replaces WeeklyGoals + ObjectivesPanel on Home. Those were two
// different-looking editors over the SAME table, which is why it never felt
// like one source of truth even after the data was fixed.
//
// The ladder is the interface: a goal is entered in the same way at every rung,
// and a non-OS goal must name its parent, so "what does this serve?" is asked
// at creation instead of being audited later.

export type Horizon = 'os' | 'weekly'

/**
 * The gate's verdict, as it comes back from the API (wire format lives in
 * src/lib/goalsApi.ts, the one goal wire path).
 */
export type GateVerdict = GateVerdictWire

export interface LadderGoal {
  id: string
  title: string
  horizon: Horizon
  parent_id: string | null
  venture: string | null
  status: string
  priority: number | null
  progress: number | null
  current: string | null
  notes: string | null
  is_stale: boolean
  orphaned: boolean
  days_since_touch: number | null
  stale_after_days: number | null
}

interface LadderData {
  by_horizon: Record<Horizon, LadderGoal[]>
  goals: LadderGoal[]
  stale_count: number
  orphan_count: number
  ventures: string[]
  team_focus: string
  week_of: string
}

// `noun` is the singular, article included, because it is interpolated into
// button labels and empty states. Deriving it from `label` produced "Add a os
// goals goal", which is how it read in production.
// Two rungs since the 2026-08-20 recompose: the canon is OS goals → this
// week's objectives → today's 3, and today's 3 live in daily_focus rather
// than here. A weekly goal serves an OS goal directly and may carry an
// optional venture tag.
const RUNGS: Array<{ id: Horizon; label: string; noun: string; blurb: string }> = [
  { id: 'os', label: 'OS goals', noun: 'an OS goal', blurb: 'What the whole system is for. Rarely changes.' },
  { id: 'weekly', label: 'This week', noun: 'a weekly goal', blurb: 'What moves an OS goal this week.' },
]

// The venture list arrives from venture_registry via the ladder read. It used
// to be a hand-maintained literal here whose own comment said it mirrored
// `venture_registry where active=true`, which is a copy that goes stale rather
// than a mirror. FALLBACK only covers a cold read.
const FALLBACK_VENTURES = ['mindmaker', 'mindmaker_live', 'mm_ctrl', 'full_time', 'fractionl_circle', 'fractionl_pulse']

export function GoalLadder({ variant = 'desktop', showFocus = true, onDataLoaded }: {
  variant?: 'desktop' | 'mobile'
  /**
   * The weekly focus line. Exactly one editor per surface, never two.
   * Desktop passes false because OsMissionHero sits beside the ladder and owns
   * it there, and its editor is the richer one (it offers Marcus's recommended
   * focus). Mobile has no hero, so the ladder owns it.
   */
  showFocus?: boolean
  /**
   * Home's hero renders the OS rung and the focus line, so it needs the
   * resolved OS goals rather than a separate mission string: one store, two
   * views. The API still returns the derived north_star mirror for readers
   * outside this repo; nothing in src/ may consume it.
   */
  onDataLoaded?: (d: {
    os_goals: LadderGoal[]
    team_focus: string
    week_of: string
  }) => void
}) {
  const h = useHaptics()
  const [data, setData] = useState<LadderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<Horizon | null>(null)
  const [title, setTitle] = useState('')
  const [parentId, setParentId] = useState('')
  const [venture, setVenture] = useState('')
  const [saving, setSaving] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<Horizon>>(new Set())
  // Carried over from WeeklyGoals so nothing he could do before is lost:
  // inline edit of a goal, a done toggle, and the team focus line.
  const [editing, setEditing] = useState<string | null>(null)
  const [edit, setEdit] = useState({ title: '', current: '', progress: '0', notes: '' })
  const [editingFocus, setEditingFocus] = useState(false)
  const [focusText, setFocusText] = useState('')
  // The gate's verdict on the goal currently being typed. Held rather than
  // thrown, because the whole point is that the form stays open with the
  // specific failures attached to it.
  const [gate, setGate] = useState<GateVerdict | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/goals/ladder`, { cache: 'no-cache' })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setData(j)
      onDataLoaded?.({
        os_goals: j.by_horizon?.os ?? [],
        team_focus: j.team_focus,
        week_of: j.week_of,
      })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load goals')
    } finally {
      setLoading(false)
    }
  }, [onDataLoaded])

  useEffect(() => { void load() }, [load])

  // A non-OS rung must pick a parent, so the ladder can never be entered
  // sideways. A weekly goal serves an OS goal directly.
  const parentRung = (hz: Horizon): Horizon | null =>
    hz === 'os' ? null : 'os'

  const parentOptions = useMemo(() => {
    if (!adding || !data) return []
    const pr = parentRung(adding)
    return pr ? (data.by_horizon[pr] || []) : []
  }, [adding, data])

  const openAdd = (hz: Horizon) => {
    h.select()
    setAdding(hz); setTitle(''); setVenture(''); setGate(null)
    const pr = parentRung(hz)
    const opts = pr && data ? (data.by_horizon[pr] || []) : []
    setParentId(opts.length === 1 ? opts[0].id : '')
  }

  const save = async (opts: { override?: boolean; horizon?: Horizon; text?: string } = {}) => {
    const hz = opts.horizon ?? adding
    const raw = (opts.text ?? title).trim()
    if (!hz || !raw || saving) return
    const needsParent = hz !== 'os'
    if (needsParent && !parentId) return
    setSaving(true)
    try {
      const result = await createGoal({
        title: raw,
        horizon: hz,
        parentId: needsParent ? parentId : null,
        venture: hz === 'weekly' ? (venture || null) : null,
        override: opts.override === true,
      })
      // A held gate is not a failure. Keep the form open and attach the
      // verdict to it so the fix is one edit away. (`=== false`, not `!`:
      // strict is off, so only the literal comparison narrows the union.)
      if (result.ok === false) {
        setGate(result.gate)
        h.error()
        return
      }
      h.success()
      setAdding(null); setTitle(''); setParentId(''); setVenture(''); setGate(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      h.error()
    } finally {
      setSaving(false)
    }
  }

  // PATCH /api/goals is horizon-agnostic (it keys off goalId), so the same
  // three mutations work at every rung of the ladder.
  const patch = async (body: Record<string, unknown>) => {
    setSaving(true)
    try {
      await patchGoal(body)
      await load()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      h.error()
      return false
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (g: LadderGoal) => {
    h.select()
    setAdding(null)
    setEditing(g.id)
    setEdit({
      title: g.title,
      current: g.current || '',
      progress: String(g.progress ?? 0),
      notes: g.notes || '',
    })
  }

  const saveEdit = async (id: string) => {
    const ok = await patch({
      goalId: id,
      title: edit.title,
      current: edit.current,
      progress: Number(edit.progress) || 0,
      notes: edit.notes,
    })
    if (ok) { h.success(); setEditing(null) }
  }

  const toggleDone = async (g: LadderGoal) => {
    h.tap()
    await patch({ goalId: g.id, progress: (g.progress ?? 0) >= 100 ? 0 : 100 })
  }

  // Retiring a goal. Status, never DELETE: canon Rule A wants decay to be
  // reversible, and the row still carries the history that learning signals and
  // the chronicle hang off. The ladder read filters archived rows out, so it
  // leaves the surface immediately without anything being destroyed.
  const archive = async (g: LadderGoal) => {
    // 'dropped', not 'archived': goals_status_objective_check allows
    // proposed / active / paused / done / dropped and nothing else. The ladder
    // read already filters dropped rows out, so the goal leaves the surface
    // while the row and its history stay put.
    const ok = await patch({ goalId: g.id, status: 'dropped' })
    if (ok) { h.success(); setEditing(null) }
  }

  const saveFocus = async () => {
    const ok = await patch({ team_focus: focusText })
    if (ok) setEditingFocus(false)
  }

  const toggle = (hz: Horizon) => {
    h.tap()
    setCollapsed(c => {
      const n = new Set(c)
      if (n.has(hz)) n.delete(hz); else n.add(hz)
      return n
    })
  }

  if (loading) {
    return (
      <div className="glass-card p-5 flex items-center gap-2 text-white/45 text-[13px]">
        <Working size={14} /> Loading the ladder…
      </div>
    )
  }

  const empty = (data?.goals.length ?? 0) === 0
  const compact = variant === 'mobile'

  return (
    <div className="glass-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Target size={15} className="text-violet-300" />
          <h2 className="text-[14px] font-semibold text-white/90">Goals</h2>
        </div>
        {/* Staleness is URGENT, not a footnote (canon §0a.2). It sits in the
            header because a stale goal silently misaligns event and content
            ranking, both of which hang off live goals. */}
        {!!data && (data.stale_count > 0 || data.orphan_count > 0) && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-400/15 text-amber-300 text-[11px] font-semibold">
            <AlertTriangle size={11} />
            {data.stale_count > 0 && <span>{data.stale_count} stale</span>}
            {data.stale_count > 0 && data.orphan_count > 0 && <span>·</span>}
            {data.orphan_count > 0 && <span>{data.orphan_count} unparented</span>}
          </div>
        )}
      </div>

      {error && <p className="mb-3 text-[12px] text-rose-300">{error}</p>}

      {empty && (
        <p className="mb-3 text-[12.5px] text-white/50 leading-relaxed">
          Nothing set yet. Start with an OS goal: what the whole system is for.
          Everything below hangs off it.
        </p>
      )}

      {/* The focus line. It was only editable from WeeklyGoals, which no longer
          renders, so it lives here on any surface that has no hero. */}
      {showFocus && <div className="mb-3">
        {editingFocus ? (
          <div className="space-y-1.5">
            <textarea
              autoFocus
              rows={2}
              value={focusText}
              onChange={e => setFocusText(e.target.value)}
              placeholder="What the whole week is pointed at"
              className="w-full px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-[12.5px] text-white/85 placeholder:text-white/25 outline-none focus:border-violet-400/40 resize-none"
            />
            <div className="flex items-center gap-2 justify-end">
              <button type="button" onClick={() => setEditingFocus(false)} className="px-2 py-1 text-[11.5px] text-white/45 hover:text-white/80">Cancel</button>
              <button type="button" onClick={() => void saveFocus()} disabled={saving} className="px-3 py-1 rounded-lg btn-contrast text-[11.5px] font-semibold disabled:opacity-40">
                {saving ? 'Saving…' : 'Save focus'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setFocusText(data?.team_focus ?? ''); setEditingFocus(true) }}
            className="w-full text-left px-2.5 py-2 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:border-white/15"
          >
            <span className="block text-[10.5px] uppercase tracking-wide text-white/30 mb-0.5">Focus</span>
            <span className={`text-[12.5px] leading-snug ${data?.team_focus ? 'text-white/75' : 'text-white/30'}`}>
              {data?.team_focus || 'Set the focus for this week'}
            </span>
          </button>
        )}
      </div>}

      <div className="space-y-3">
        {RUNGS.map(rung => {
          const rows = data?.by_horizon[rung.id] || []
          const isCollapsed = collapsed.has(rung.id)
          const parentPool = rung.id === 'os' ? 1 : (data?.by_horizon[parentRung(rung.id) as Horizon] || []).length
          const parentNoun = RUNGS.find(r => r.id === parentRung(rung.id))?.noun
          const blockedReason = rung.id !== 'os' && parentPool === 0
            ? `Add ${parentNoun} first`
            : null

          return (
            <section key={rung.id} className="rounded-xl border border-white/[0.07] bg-white/[0.015]">
              <div className="flex items-center justify-between px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggle(rung.id)}
                  className="flex items-center gap-1.5 text-left min-h-[32px]"
                >
                  {isCollapsed ? <ChevronRight size={13} className="text-white/35" /> : <ChevronDown size={13} className="text-white/35" />}
                  <span className="text-[12.5px] font-semibold text-white/80">{rung.label}</span>
                  <span className="text-[11px] text-white/35 tabular-nums">{rows.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openAdd(rung.id)}
                  disabled={!!blockedReason}
                  title={blockedReason || `Add ${rung.noun}`}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-violet-300 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Plus size={11} /> Add
                </button>
              </div>

              {!isCollapsed && (
                <div className="px-3 pb-2.5">
                  {!compact && <p className="text-[11px] text-white/35 mb-2">{rung.blurb}</p>}
                  {rows.length === 0 ? (
                    <p className="text-[12px] text-white/30 py-1">
                      {blockedReason || 'None yet.'}
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {rows.map(g => {
                        const pct = Math.max(0, Math.min(100, g.progress ?? 0))
                        const isEditing = editing === g.id
                        return (
                          <li key={g.id} className="py-1.5 border-t border-white/[0.05] first:border-t-0">
                            {isEditing ? (
                              <div className="space-y-1.5">
                                <input
                                  value={edit.title}
                                  onChange={e => setEdit(v => ({ ...v, title: e.target.value }))}
                                  className="w-full min-h-[36px] px-2 rounded-lg bg-white/[0.04] border border-white/10 text-[13px] text-white/90 outline-none focus:border-violet-400/40"
                                />
                                <input
                                  value={edit.current}
                                  onChange={e => setEdit(v => ({ ...v, current: e.target.value }))}
                                  placeholder="Where it stands right now"
                                  className="w-full min-h-[34px] px-2 rounded-lg bg-white/[0.04] border border-white/10 text-[12px] text-white/75 placeholder:text-white/25 outline-none focus:border-violet-400/40"
                                />
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number" min={0} max={100}
                                    value={edit.progress}
                                    onChange={e => setEdit(v => ({ ...v, progress: e.target.value }))}
                                    className="w-20 min-h-[34px] px-2 rounded-lg bg-white/[0.04] border border-white/10 text-[12px] text-white/85 outline-none focus:border-violet-400/40"
                                  />
                                  <span className="text-[11px] text-white/35">% done</span>
                                  <button
                                    type="button"
                                    onClick={() => void archive(g)}
                                    disabled={saving}
                                    title="Retire this goal. Reversible: it is archived, not deleted."
                                    className="px-2 py-1 text-[11.5px] text-white/40 hover:text-rose-300 disabled:opacity-40"
                                  >
                                    Retire
                                  </button>
                                  <div className="flex-1" />
                                  <button type="button" onClick={() => setEditing(null)} className="px-2 py-1 text-[11.5px] text-white/45 hover:text-white/80">Cancel</button>
                                  <button
                                    type="button"
                                    onClick={() => void saveEdit(g.id)}
                                    disabled={saving || !edit.title.trim()}
                                    className="px-3 py-1 rounded-lg btn-contrast text-[11.5px] font-semibold disabled:opacity-40"
                                  >
                                    {saving ? 'Saving…' : 'Save'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-start gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void toggleDone(g)}
                                    aria-label={pct >= 100 ? 'Mark not done' : 'Mark done'}
                                    className={`mt-[3px] w-3.5 h-3.5 shrink-0 rounded-[4px] border ${pct >= 100 ? 'bg-emerald-400/80 border-emerald-300/60' : 'border-white/25 hover:border-white/50'}`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => startEdit(g)}
                                    className={`flex-1 text-left text-[13px] leading-snug ${pct >= 100 ? 'text-white/40 line-through' : 'text-white/85'}`}
                                  >
                                    {g.title}
                                  </button>
                                  {g.venture && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/45 whitespace-nowrap">
                                      {g.venture}
                                    </span>
                                  )}
                                  {g.orphaned && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-400/15 text-rose-300 whitespace-nowrap">
                                      unparented
                                    </span>
                                  )}
                                  {g.is_stale && (
                                    <span
                                      className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 whitespace-nowrap"
                                      title={`Untouched ${g.days_since_touch}d, stale after ${g.stale_after_days}d`}
                                    >
                                      stale {g.days_since_touch}d
                                    </span>
                                  )}
                                </div>
                                {(g.current || pct > 0) && (
                                  <div className="pl-[22px] mt-1 flex items-center gap-2">
                                    <div className="flex-1 h-[3px] rounded-full bg-white/[0.07] overflow-hidden">
                                      <div className="h-full rounded-full bg-violet-400/70" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-[10px] text-white/35 tabular-nums w-8 text-right">{pct}%</span>
                                  </div>
                                )}
                                {g.current && (
                                  <p className="pl-[22px] mt-1 text-[11.5px] text-white/45 leading-snug">{g.current}</p>
                                )}
                              </>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {/* ONE editor, reused at every rung. The only thing that changes per rung
          is which parents are offered and whether a venture applies. */}
      {adding && (
        <div className="mt-3 rounded-xl border border-violet-400/25 bg-violet-500/[0.06] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-semibold text-violet-200">
              New {RUNGS.find(r => r.id === adding)?.noun.replace(/^an? /, '')}
            </span>
            <button type="button" onClick={() => { setAdding(null); setGate(null) }} aria-label="Cancel" className="text-white/35 hover:text-white/70">
              <X size={14} />
            </button>
          </div>

          <input
            autoFocus
            value={title}
            onChange={e => { setTitle(e.target.value); if (gate) setGate(null) }}
            onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { setAdding(null); setGate(null) } }}
            placeholder={adding === 'os' ? 'What is the whole system for?' : 'What is the goal?'}
            className="w-full min-h-[40px] px-3 rounded-lg bg-white/[0.04] border border-white/10 text-[13px] text-white/90 placeholder:text-white/25 outline-none focus:border-violet-400/40"
          />

          {adding !== 'os' && (
            <div className="mt-2">
              <label className="block text-[11px] text-white/40 mb-1">
                What does it serve? (required)
              </label>
              <select
                value={parentId}
                onChange={e => setParentId(e.target.value)}
                className="w-full min-h-[38px] px-2 rounded-lg bg-white/[0.04] border border-white/10 text-[12.5px] text-white/85 outline-none focus:border-violet-400/40"
              >
                <option value="">Choose a parent…</option>
                {parentOptions.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
          )}

          {adding === 'weekly' && (
            <div className="mt-2">
              <label className="block text-[11px] text-white/40 mb-1">Venture (optional)</label>
              <select
                value={venture}
                onChange={e => setVenture(e.target.value)}
                className="w-full min-h-[38px] px-2 rounded-lg bg-white/[0.04] border border-white/10 text-[12.5px] text-white/85 outline-none focus:border-violet-400/40"
              >
                <option value="">No single venture</option>
                {(data?.ventures?.length ? data.ventures : FALLBACK_VENTURES).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          )}

          {/* The gate did not pass. The form stays open with the specific
              failures attached, a one-click fix where the gate could suggest
              one, and an explicit way through that gets recorded. */}
          {gate && (
            <div className="mt-2.5 rounded-lg border border-amber-400/25 bg-amber-500/[0.07] p-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-amber-200/85">
                {gate.verdict === 'wrong_tier' ? 'Wrong rung' : 'Not saved yet'}
              </p>
              {gate.reasoning && (
                <p className="mt-1 text-[12px] text-white/70 leading-snug">{gate.reasoning}</p>
              )}

              {gate.issues.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {gate.issues.map((it, i) => (
                    <li key={i} className="text-[12px] leading-snug">
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
                    onClick={() => { const t = gate.suggested_tier!; setGate(null); setAdding(t); }}
                    className="min-h-[30px] px-2.5 rounded-md bg-amber-400/15 border border-amber-300/30 text-[12px] text-amber-100 hover:bg-amber-400/25 disabled:opacity-50"
                  >
                    Move to {RUNGS.find(r => r.id === gate.suggested_tier)?.label ?? gate.suggested_tier}
                  </button>
                )}
                {gate.suggested_rewrite && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => { setTitle(gate.suggested_rewrite!); setGate(null) }}
                    className="min-h-[30px] px-2.5 rounded-md bg-white/[0.07] border border-white/15 text-[12px] text-white/85 hover:bg-white/[0.12] disabled:opacity-50"
                  >
                    Use the suggested wording
                  </button>
                )}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save({ override: true })}
                  className="min-h-[30px] px-2.5 rounded-md text-[12px] text-white/45 hover:text-white/80 underline underline-offset-2 disabled:opacity-50"
                >
                  Save as written
                </button>
              </div>

              {gate.suggested_rewrite && (
                <p className="mt-2 text-[11.5px] text-white/45 leading-snug italic">{gate.suggested_rewrite}</p>
              )}
              {!gate.model_used && (
                <p className="mt-2 text-[11px] text-white/35 leading-snug">
                  Structural checks only. The judgment pass did not run, so this goal was not fully assessed.
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !title.trim() || (adding !== 'os' && !parentId)}
            className="mt-3 w-full min-h-[38px] rounded-lg btn-contrast text-[12.5px] font-semibold disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Add goal'}
          </button>
        </div>
      )}
    </div>
  )
}
