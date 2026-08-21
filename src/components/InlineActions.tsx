import React, { useState } from 'react'
import { ThumbsUp, X } from 'lucide-react'
import { useHaptics } from '../hooks/useHaptics'
import { useToast } from './shared/Toast'

interface Props {
  taskId: string
  currentStatus?: string
  onSuccess?: () => void
  compact?: boolean
  agent?: string
}

type ActionState = null | 'approve' | 'reject'

// Approve/Reject for agent tasks. Writes go through service-role APIs —
// the anon client cannot update tasks under RLS (0 rows, no error), which
// used to flash success while the item stayed in the queue.
export function InlineActions({ taskId, onSuccess, compact, agent }: Props) {
  const h = useHaptics()
  const { toast } = useToast()
  const [busy, setBusy] = useState<ActionState>(null)
  const [flash, setFlash] = useState<ActionState>(null)

  const call = async (action: ActionState, url: string, payload: Record<string, any>) => {
    h.heavy()
    setBusy(action)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`)
      h.success()
      setFlash(action)
      setTimeout(() => setFlash(null), 1200)
      onSuccess?.()
    } catch (err) {
      h.error()
      toast(`Could not ${action} — ${err instanceof Error ? err.message : 'try again'}.`, 'error')
    } finally {
      setBusy(null)
    }
  }

  const approve = () => call('approve', '/api/tasks/update', { id: taskId, action: 'approve', agent })
  const reject = () => call('reject', '/api/triage/reject', { source_table: 'tasks', source_id: taskId, agent })

  const btn = (action: ActionState, label: string, Icon: any, accent: string, onClick: () => void) => (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      disabled={busy !== null}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-micro font-medium border transition-all disabled:opacity-40 ${accent}`}
    >
      <Icon size={11} />
      {!compact && (flash === action ? 'Done' : label)}
    </button>
  )

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {btn('approve', 'Approve', ThumbsUp, 'border-violet-500/25 text-violet-400 hover:bg-violet-500/10', approve)}
      {btn('reject', 'Reject', X, 'border-rose-500/25 text-rose-400 hover:bg-rose-500/10', reject)}
    </div>
  )
}
