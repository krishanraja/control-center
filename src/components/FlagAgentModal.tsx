import React, { useState } from 'react'
import { Zap, X, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { AgentAvatar } from './shared/AgentAvatar'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'

interface Props {
  agentId: string
  agentDisplayName: string
  onClose: () => void
}

export function FlagAgentModal({ agentId, agentDisplayName, onClose }: Props) {
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()
  const h = useHaptics()

  const handleSubmit = async () => {
    const trimmed = note.trim()
    if (!trimmed) return
    h.heavy()
    setSubmitting(true)

    try {
      const now = new Date().toISOString()

      const { data: existing, error: fetchErr } = await supabase
        .from('pending_flags')
        .select('id, notes, fires_at')
        .eq('agent', agentId)
        .eq('fired', false)
        .gt('fires_at', now)
        .limit(1)
        .maybeSingle()

      if (fetchErr) throw fetchErr

      if (existing) {
        const { error: updateErr } = await supabase
          .from('pending_flags')
          .update({ notes: [...(existing.notes || []), trimmed] })
          .eq('id', existing.id)
        if (updateErr) throw updateErr

        const minsLeft = Math.max(1, Math.round((new Date(existing.fires_at).getTime() - Date.now()) / 60000))
        h.success()
        toast(`Note added to existing flag — fires in ${minsLeft} min`, 'success')
      } else {
        const firesAt = new Date(Date.now() + 20 * 60 * 1000).toISOString()
        const { error: insertErr } = await supabase
          .from('pending_flags')
          .insert({ agent: agentId, notes: [trimmed], fires_at: firesAt })
        if (insertErr) throw insertErr

        h.success()
        toast(`Agent flagged — task fires in 20 minutes`, 'success')
      }

      onClose()
    } catch (err) {
      console.error('FlagAgentModal submit error:', err)
      h.error()
      toast('Failed to flag agent — try again', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[420px] rounded-xl border border-white/[0.08] bg-[#141416] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <AgentAvatar agent={agentId} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-amber-400" />
              <h2 className="text-[14px] font-semibold text-white">Flag {agentDisplayName}</h2>
            </div>
            <p className="text-[11px] text-white/35 mt-0.5">Send a note — fires as a task in 20 min</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-3">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={`What do you want ${agentDisplayName} to do?`}
            rows={4}
            autoFocus
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[13px] text-white/90 placeholder-white/25 resize-none focus:outline-none focus:border-amber-500/40 transition-colors"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 pb-5 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[12px] text-white/50 hover:text-white/70 hover:bg-white/[0.04] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!note.trim() || submitting}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/25 hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            {submitting ? 'Flagging…' : 'Flag Agent'}
          </button>
        </div>
      </div>
    </div>
  )
}
