import React, { useState, useEffect, useRef } from 'react'
import {
  UserCheck, CheckCircle, MessageCircle, Send, Clock, ArrowRight,
  Hourglass, Pencil, Check, X, ExternalLink, ChevronDown, ChevronUp, Loader2, Copy
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlockItem {
  id: string
  title: string
  description?: string
  nextStep?: string
  blockedBy?: 'krish' | 'agatha'
  status: string
  urgency?: 'high' | 'medium' | 'low'
  priority?: string
  agent?: string
  daysOld?: number
  feedbackText?: string
  comments?: { text: string; ts: string; from: string }[]
  updatedAt?: string
}

interface Goal {
  id: string
  title: string
  target: string
  current: string
  owner: string
  progress: number
  notes?: string
}

interface GoalsData {
  week_of: string
  north_star: string
  team_focus?: string
  goals: Goal[]
}

interface TodayItem {
  id: string
  title: string
  detail?: string
  owner?: string
  status?: string
  priority?: number
  est?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const urgencyStyle: Record<string, string> = {
  high:   'bg-red-500/10 border-red-500/30 text-red-400',
  medium: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  low:    'bg-blue-500/10 border-blue-500/30 text-blue-400',
}

const urgencyOf = (item: BlockItem): 'high' | 'medium' | 'low' => {
  if (item.urgency) return item.urgency
  if (item.priority === 'pri-0' || item.priority === 'outstanding') return 'high'
  if (item.priority === 'pri-1') return 'medium'
  return 'low'
}

const ageLabel = (d?: number) => {
  if (d === undefined) return ''
  if (d === 0) return 'today'
  return `${d}d`
}

// ─── Blocked Item ─────────────────────────────────────────────────────────────

function BlockedItem({ item, onRefresh }: { item: BlockItem; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  // Build a structured message Krish can paste to Agatha in Telegram.
  // Agatha processes it, updates tasks.json, and the 5-min sync commits it.
  const buildAgathaMessage = (decision: string) =>
    `DECISION | task:${item.id} | agent:${item.agent ?? 'unknown'} | ${decision} | ${new Date().toISOString()}`

  const copyAndSend = () => {
    const msg = buildAgathaMessage(feedbackText.trim() || 'approved')
    navigator.clipboard.writeText(msg).then(() => {
      setCopied(true)
      setConfirmed(true)
      setTimeout(() => setCopied(false), 3000)
    })
  }

  const urgency = urgencyOf(item)

  return (
    <div className={`border rounded-xl p-4 space-y-3 transition-colors
      ${confirmed
        ? 'border-emerald-500/20 bg-emerald-500/[0.02]'
        : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]'
      }`}
    >
      <div className="flex items-start gap-2 flex-wrap">
        <UserCheck size={13} className="text-amber-400 shrink-0 mt-0.5" />
        <span className="text-[13px] font-semibold text-white flex-1">{item.title}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded border ${urgencyStyle[urgency]}`}>{urgency}</span>
        {item.daysOld !== undefined && (
          <span className="text-[10px] text-white/25">{ageLabel(item.daysOld)}</span>
        )}
      </div>

      {(item.description || item.nextStep) && (
        <p className="text-[12px] text-white/50 leading-relaxed pl-5">{item.description || item.nextStep}</p>
      )}

      {(item as any).workstream && (
        <div className="pl-5">
          <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-300 font-semibold tracking-wide">
            {(item as any).workstream}
          </span>
        </div>
      )}

      {item.agent && (
        <div className="flex items-center gap-1 text-[11px] text-white/30 pl-5">
          <span>from</span>
          <span className="font-medium text-white/50">{item.agent}</span>
          <ArrowRight size={9} />
          <span className="text-amber-400/70">Needs your input</span>
        </div>
      )}

      {item.feedbackText && (
        <div className="ml-5 bg-purple-900/20 border border-purple-700/20 rounded-lg px-3 py-2">
          <p className="text-[11px] text-white/40">
            <span className="text-purple-400">Your feedback: </span>{item.feedbackText}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pl-5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/50 hover:bg-white/[0.08] transition-colors"
        >
          <MessageCircle size={11} /> {expanded ? 'Cancel' : 'Decide'}
        </button>
        <button
          onClick={() => {
            const msg = buildAgathaMessage('approved — mark as done')
            navigator.clipboard.writeText(msg).then(() => { setConfirmed(true); setCopied(true); setTimeout(() => setCopied(false), 3000) })
          }}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
        >
          <CheckCircle size={11} /> Approve
        </button>
      </div>

      {expanded && (
        <div className="pl-5 space-y-2">
          <textarea
            className="w-full bg-white/[0.04] border border-white/[0.10] rounded-lg p-2.5 text-[12px] text-white placeholder-white/20 resize-none focus:outline-none focus:border-amber-500/40"
            rows={3}
            placeholder="Your decision or feedback (e.g. 'approved with changes', 'reject — try again with…')"
            value={feedbackText}
            onChange={e => setFeedbackText(e.target.value)}
          />
          <button
            onClick={copyAndSend}
            disabled={!feedbackText.trim()}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-amber-500/10 border border-amber-500/25 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied! Paste to Agatha in Telegram →' : 'Copy Decision → Paste to Agatha'}
          </button>
          <p className="text-[10px] text-white/25 leading-relaxed">
            Paste this in Telegram to Agatha. She'll update the task and notify {item.agent ?? 'the agent'} within the next sync cycle.
          </p>
        </div>
      )}

      {confirmed && !expanded && (
        <p className="pl-5 text-[11px] text-emerald-400/60 flex items-center gap-1.5">
          <Check size={10} /> Decision copied — paste to Agatha in Telegram to route it
        </p>
      )}
    </div>
  )
}

// ─── Goal Item (editable) ─────────────────────────────────────────────────────

function GoalItem({ goal, onSaved }: { goal: Goal; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ current: goal.current, progress: String(goal.progress), notes: goal.notes || '' })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    await fetch('/api/goals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalId: goal.id, ...form, progress: Number(form.progress) })
    })
    setSaving(false)
    setEditing(false)
    onSaved()
  }

  const p = Math.max(0, Math.min(100, Number(form.progress)))
  const barColor = p >= 80 ? 'bg-emerald-500' : p >= 40 ? 'bg-violet-500' : 'bg-amber-500'

  return (
    <div className="group/goal bg-white/[0.02] border border-white/[0.07] rounded-xl p-3 hover:border-white/[0.12] transition-colors">
      <div className="flex items-start gap-2">
        {/* Progress dot */}
        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${p >= 100 ? 'bg-emerald-400' : p > 0 ? barColor : 'bg-white/[0.15]'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-[13px] font-medium ${p >= 100 ? 'text-white/40 line-through' : 'text-white'}`}>{goal.title}</p>
            {!editing && (
              <button
                onClick={() => { setForm({ current: goal.current, progress: String(goal.progress), notes: goal.notes || '' }); setEditing(true) }}
                className="opacity-0 group-hover/goal:opacity-100 transition-opacity text-white/25 hover:text-white/60"
              >
                <Pencil size={11} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-white/35">{goal.owner}</span>
            <span className="text-[11px] text-white/20">·</span>
            <span className="text-[11px] text-white/35 font-mono">{goal.current}</span>
            {p > 0 && !editing && <span className="text-[10px] text-white/25">{p}%</span>}
          </div>
          {!editing && p < 100 && (
            <div className="mt-1.5 h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${p}%` }} />
            </div>
          )}
          {editing && (
            <div className="mt-2 space-y-2">
              <input
                className="w-full bg-white/[0.05] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-[12px] text-white placeholder-white/20 focus:outline-none focus:border-violet-500/40"
                placeholder="Current status"
                value={form.current}
                onChange={e => setForm(s => ({ ...s, current: e.target.value }))}
              />
              <div className="flex gap-2">
                <input
                  type="number" min={0} max={100}
                  className="w-20 bg-white/[0.05] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-[12px] text-white focus:outline-none focus:border-violet-500/40"
                  placeholder="0–100"
                  value={form.progress}
                  onChange={e => setForm(s => ({ ...s, progress: e.target.value }))}
                />
                <input
                  className="flex-1 bg-white/[0.05] border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-[12px] text-white placeholder-white/20 focus:outline-none focus:border-violet-500/40"
                  placeholder="Notes for agents (optional)"
                  value={form.notes}
                  onChange={e => setForm(s => ({ ...s, notes: e.target.value }))}
                />
              </div>
              <div className="flex gap-1.5">
                <button onClick={save} disabled={saving} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] bg-violet-500/15 border border-violet-500/25 text-violet-400 hover:bg-violet-500/25 disabled:opacity-50">
                  <Check size={10} /> {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditing(false)} className="px-2.5 py-1.5 rounded-lg text-[11px] bg-white/[0.04] border border-white/[0.08] text-white/40 hover:text-white/60">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TodayTabContent() {
  const [blocked, setBlocked] = useState<BlockItem[]>([])
  const [goals, setGoals] = useState<GoalsData | null>(null)
  const [todayItems, setTodayItems] = useState<TodayItem[]>([])
  const [doneItems, setDoneItems] = useState<TodayItem[]>([])
  const [loading, setLoading] = useState(true)

  // Team focus editing
  const [editingFocus, setEditingFocus] = useState(false)
  const [focusText, setFocusText] = useState('')

  const fetchAll = async () => {
    const [blockedRes, goalsRes, todayRes] = await Promise.allSettled([
      fetch('/api/data', { cache: 'no-cache' }).then(r => r.json()),
      fetch('/api/goals', { cache: 'no-cache' }).then(r => r.json()),
      fetch('/api/today', { cache: 'no-cache' }).then(r => r.json()),
    ])

    if (blockedRes.status === 'fulfilled') {
      const tasks = (blockedRes.value.tasks || []) as BlockItem[]
      setBlocked(tasks.filter(t => t.blockedBy === 'krish' && t.status !== 'done' && t.status !== 'feedback'))
    }
    if (goalsRes.status === 'fulfilled') setGoals(goalsRes.value)
    if (todayRes.status === 'fulfilled') {
      const items = (todayRes.value.items || []) as TodayItem[]
      setTodayItems(items.filter(i => i.status !== 'done'))
      setDoneItems(items.filter(i => i.status === 'done'))
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 30000)
    return () => clearInterval(iv)
  }, [])

  const saveFocus = async () => {
    await fetch('/api/goals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_focus: focusText })
    })
    setEditingFocus(false)
    fetchAll()
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-white/30 py-8 justify-center">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-sm">Loading today's queue…</span>
    </div>
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* ── LEFT: Blocked + Approvals ───────────────────────── */}
      <div className="space-y-6">

        {/* Blocked on Krish */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
              Blocked on You {blocked.length > 0 && `(${blocked.length})`}
            </h2>
          </div>
          {blocked.length === 0 ? (
            <div className="text-center py-6 text-white/25 text-[12px] border border-dashed border-white/[0.08] rounded-xl">
              Nothing waiting on you.
            </div>
          ) : (
            <div className="space-y-2">
              {blocked.map(item => (
                <BlockedItem key={item.id} item={item} onRefresh={fetchAll} />
              ))}
            </div>
          )}
        </section>

        {/* Today's queue */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-blue-400">
              Today's Queue {todayItems.length > 0 && `(${todayItems.length})`}
            </h2>
          </div>
          {todayItems.length === 0 ? (
            <div className="text-center py-6 text-white/25 text-[12px] border border-dashed border-white/[0.08] rounded-xl">All clear.</div>
          ) : (
            <div className="space-y-2">
              {todayItems.map(item => (
                <div key={item.id} className="flex items-start gap-3 bg-white/[0.02] border border-white/[0.07] rounded-xl p-3 hover:border-white/[0.12] transition-colors">
                  <div className="flex-1">
                    <p className="text-[13px] font-medium text-white">{item.title}</p>
                    {item.detail && <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">{item.detail}</p>}
                    {item.est && <p className="text-[10px] text-white/25 mt-1 font-mono">Est. {item.est}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── RIGHT: Goals ────────────────────────────────────── */}
      <div className="space-y-6">
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-violet-400" />
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-violet-400">Weekly Goals</h2>
            {goals?.week_of && <span className="text-[10px] text-white/25 ml-auto">{goals.week_of}</span>}
          </div>

          {/* Team focus */}
          {goals && (
            <div className="mb-4 bg-white/[0.02] border border-white/[0.07] rounded-xl p-3">
              <p className="text-[10px] text-white/25 uppercase tracking-wider mb-1.5">Team Focus</p>
              {editingFocus ? (
                <div className="flex gap-2">
                  <textarea
                    className="flex-1 bg-white/[0.05] border border-violet-500/30 rounded-lg px-2.5 py-1.5 text-[12px] text-white resize-none focus:outline-none"
                    rows={2}
                    autoFocus
                    value={focusText}
                    onChange={e => setFocusText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) saveFocus() }}
                  />
                  <div className="flex flex-col gap-1">
                    <button onClick={saveFocus} className="text-violet-400 hover:text-violet-300 p-1"><Check size={13} /></button>
                    <button onClick={() => setEditingFocus(false)} className="text-white/25 hover:text-white/50 p-1"><X size={13} /></button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 group/focus">
                  <p className="text-[12px] text-violet-300/70 flex-1 leading-relaxed">
                    {goals.team_focus || 'Set team focus…'}
                  </p>
                  <button
                    onClick={() => { setFocusText(goals.team_focus || ''); setEditingFocus(true) }}
                    className="opacity-0 group-hover/focus:opacity-100 transition-opacity text-white/25 hover:text-white/60 flex-shrink-0"
                  ><Pencil size={11} /></button>
                </div>
              )}
            </div>
          )}

          {goals?.goals?.length ? (
            <div className="space-y-2">
              {goals.goals.map(goal => (
                <GoalItem key={goal.id} goal={goal} onSaved={fetchAll} />
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-white/25 text-[12px] border border-dashed border-white/[0.08] rounded-xl">No goals set.</div>
          )}
        </section>
      </div>
    </div>
  )
}
