import React, { useState } from 'react'
import { Zap, X } from '@/lib/icons'
import { supabase } from '../lib/supabase'
import { AgentAvatar } from './shared/AgentAvatar'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import { Modal } from './shared/Modal'
import { Working } from './shared/Working'

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
        toast('Agent flagged. The task fires in 20 minutes.', 'success')
      }

      onClose()
    } catch (err) {
      console.error('FlagAgentModal submit error:', err)
      h.error()
      toast('Could not flag the agent. Try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      variant="center"
      title={`Flag ${agentDisplayName}`}
      hideTitle
      className="max-w-[420px] p-0"
    >
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <AgentAvatar agent={agentId} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-amber-200" />
              <h2 className="text-ui font-semibold text-white">Flag {agentDisplayName}</h2>
            </div>
            <p className="text-micro text-white/35 mt-0.5">Send a note. It fires as a task in 20 min.</p>
          </div>
        </div>
        <div className="px-5 py-3">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={`What do you want ${agentDisplayName} to do?`}
            rows={4}
            autoFocus
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-body text-white/90 placeholder-white/25 resize-none focus:outline-none focus:border-amber-500/40 transition-colors"
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 pb-5 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-label text-white/50 hover:text-white/70 hover:bg-white/[0.04] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!note.trim() || submitting}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-label font-medium bg-amber-500/15 text-amber-200 border border-amber-500/25 hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? <Working size={12} /> : <Zap size={12} />}
            {submitting ? 'Flagging…' : 'Flag Agent'}
          </button>
        </div>
    </Modal>
  )
}
