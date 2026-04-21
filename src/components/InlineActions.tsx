import React, { useState } from 'react'
import { Check, ThumbsUp, X, MessageSquarePlus } from 'lucide-react'
import { supabase, logKrishAction } from '../lib/supabase'

interface Props {
  taskId: string
  currentStatus?: string
  onSuccess?: () => void
  compact?: boolean
  agent?: string
}

type ActionState = null | 'done' | 'approve' | 'reject' | 'note'

export function InlineActions({ taskId, onSuccess, compact, agent }: Props) {
  const [busy, setBusy] = useState<ActionState>(null)
  const [flash, setFlash] = useState<ActionState>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')

  const patch = async (action: ActionState, payload: Record<string, any>, notes?: string) => {
    setBusy(action)
    const { error } = await supabase.from('tasks').update({
      ...payload,
      updated_at: new Date().toISOString(),
    }).eq('id', taskId)
    setBusy(null)
    if (!error) {
      setFlash(action)
      setTimeout(() => setFlash(null), 1200)
      if (action) await logKrishAction(taskId, action, agent, notes)
      onSuccess?.()
    }
  }

  const markDone   = () => patch('done',    { status: 'done',    krish_reviewed: true, completed_at: new Date().toISOString() })
  const approve    = () => patch('approve', { status: 'active',  krish_reviewed: true })
  const reject     = () => patch('reject',  { status: 'blocked', krish_reviewed: true })
  const submitNote = async () => {
    if (!noteText.trim()) { setNoteOpen(false); return }
    await patch('note', { krish_notes: noteText.trim(), krish_reviewed: true }, noteText.trim())
    setNoteText('')
    setNoteOpen(false)
  }

  const btn = (action: ActionState, label: string, Icon: any, accent: string, onClick: () => void) => (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      disabled={busy !== null}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-40 ${accent}`}
    >
      <Icon size={11} />
      {!compact && (flash === action ? 'Done' : label)}
    </button>
  )

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {btn('done',    'Done',    Check,             'border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/10', markDone)}
      {btn('approve', 'Approve', ThumbsUp,          'border-violet-500/25 text-violet-400 hover:bg-violet-500/10',   approve)}
      {btn('reject',  'Reject',  X,                 'border-rose-500/25 text-rose-400 hover:bg-rose-500/10',         reject)}
      {btn('note',    'Note',    MessageSquarePlus, 'border-white/10 text-white/60 hover:bg-white/[0.06]',           () => setNoteOpen(o => !o))}

      {noteOpen && (
        <div className="w-full mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitNote()}
            placeholder="Note for the team..."
            className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-1.5 text-[12px] text-white placeholder-white/25 focus:outline-none focus:border-violet-500/40"
          />
          <button
            onClick={submitNote}
            className="px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30 text-[11px] text-violet-300 hover:bg-violet-500/30"
          >Save</button>
        </div>
      )}
    </div>
  )
}
