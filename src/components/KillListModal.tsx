import React, { useEffect, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'

interface StaleTask {
  id: string
  title: string
  agent?: string | null
  workstream?: string | null
  updated_at: string
  lever_score?: number | null
}

const MS_PER_DAY = 86_400_000
const KILL_LIST_DISMISSED_KEY = 'kill_list_dismissed_until_iso'

/**
 * Pillar 5 — weekly kill list. Surfaces once per week (Sunday or first
 * load of the week) listing tasks untouched >21 days. Krish must
 * explicitly pick 3+ to kill. Killed tasks → status='superseded'.
 *
 * Storage: localStorage.kill_list_dismissed_until_iso — the modal won't
 * re-appear before that date.
 */
export function KillListModal() {
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<StaleTask[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()
  const h = useHaptics()

  useEffect(() => {
    const dismissedUntil = localStorage.getItem(KILL_LIST_DISMISSED_KEY)
    if (dismissedUntil && new Date(dismissedUntil).getTime() > Date.now()) return

    const since = new Date(Date.now() - 21 * MS_PER_DAY).toISOString()
    supabase
      .from('tasks')
      .select('id, title, agent, workstream, updated_at, lever_score')
      .lt('updated_at', since)
      .not('status', 'in', '("done","superseded")')
      .order('updated_at', { ascending: true })
      .limit(20)
      .then(({ data }) => {
        if ((data || []).length >= 5) {
          setTasks(data as StaleTask[])
          setOpen(true)
        }
      })
  }, [])

  const toggle = (id: string) => {
    h.tap()
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const kill = async () => {
    if (selected.size < 3) {
      toast('Pick at least 3 to kill — that’s the discipline.', 'error')
      h.error()
      return
    }
    h.heavy()
    setBusy(true)
    const ids = Array.from(selected)
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .in('id', ids)
    if (error) {
      h.error()
      toast('Could not kill — try again.', 'error')
    } else {
      h.success()
      toast(`${ids.length} tasks killed. Good.`, 'success')
      // Dismiss for 7 days.
      const until = new Date(Date.now() + 7 * MS_PER_DAY).toISOString()
      localStorage.setItem(KILL_LIST_DISMISSED_KEY, until)
      setOpen(false)
    }
    setBusy(false)
  }

  const snooze = () => {
    h.tap()
    const until = new Date(Date.now() + 7 * MS_PER_DAY).toISOString()
    localStorage.setItem(KILL_LIST_DISMISSED_KEY, until)
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/[0.12] bg-[#111113] shadow-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-white/[0.06] flex items-start gap-3">
          <Trash2 size={18} className="text-red-300 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h2 className="text-[15px] font-semibold text-white">Kill list — pick 3</h2>
            <p className="text-[11px] text-white/55 mt-1">
              {tasks.length} tasks haven’t moved in 21+ days. Killing them clears head-space.
              You can always re-create. Pick at least 3.
            </p>
          </div>
        </header>
        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-1.5">
          {tasks.map(t => {
            const days = Math.floor((Date.now() - new Date(t.updated_at).getTime()) / MS_PER_DAY)
            const isSel = selected.has(t.id)
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  isSel
                    ? 'border-red-500/40 bg-red-500/[0.08]'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className={`w-4 h-4 rounded border ${isSel ? 'bg-red-400 border-red-400' : 'border-white/30'} flex-shrink-0 mt-0.5 flex items-center justify-center`}>
                    {isSel && <X size={10} className="text-[#111113]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-white truncate">{t.title}</p>
                    <p className="text-[10px] text-white/45 mt-0.5">
                      {t.agent || 'unassigned'}
                      {t.workstream ? ` · ${t.workstream}` : ''}
                      {` · stale ${days}d`}
                      {typeof t.lever_score === 'number' ? ` · lever ${t.lever_score}/10` : ''}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        <footer className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={snooze}
            disabled={busy}
            className="px-3 py-2 rounded-md text-[12px] font-medium text-white/55 hover:text-white/80 disabled:opacity-40"
          >
            Snooze 7d
          </button>
          <button
            type="button"
            onClick={kill}
            disabled={busy || selected.size < 3}
            className="px-4 py-2 rounded-md text-[12px] font-semibold bg-red-500/25 border border-red-500/40 text-red-100 hover:bg-red-500/35 disabled:opacity-40"
          >
            <Trash2 size={11} className="inline mr-1" />
            {busy ? 'Killing…' : `Kill ${selected.size}`}
          </button>
        </footer>
      </div>
    </div>
  )
}
