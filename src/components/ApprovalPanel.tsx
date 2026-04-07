import React, { useState, useEffect } from 'react'
import { CheckCircle, XCircle, MessageSquare, ExternalLink, ClipboardList, Loader2 } from 'lucide-react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

interface ApprovalItem {
  id: string
  agent_id: string
  agent_name: string
  type: string
  title: string
  doc_url: string
  status: 'pending' | 'approved' | 'rejected' | 'needs-revision'
  submitted_at: string
  feedback: string | null
  approved_at: string | null
}

export function ApprovalPanel() {
  const [items, setItems] = useState<ApprovalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [feedbackId, setFeedbackId] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [acting, setActing] = useState<string | null>(null)

  const load = () => {
    fetch(`${API}/api/approvals`)
      .then(r => r.json())
      .then(d => { setItems(d.items ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const pending = items.filter(i => i.status === 'pending')
  const done = items.filter(i => i.status !== 'pending')

  const act = async (id: string, action: 'approve' | 'reject' | 'feedback', feedback = '') => {
    setActing(id)
    await fetch(`${API}/api/approvals/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, feedback })
    })
    setFeedbackId(null)
    setFeedbackText('')
    setActing(null)
    load()
  }

  if (loading) return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 flex items-center gap-2 text-white/40">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-sm">Loading approvals...</span>
    </div>
  )

  if (pending.length === 0 && done.length === 0) return null

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-amber-400" />
          <span className="text-[13px] font-semibold text-white">Pending Approvals</span>
        </div>
        <div className="flex items-center gap-2">
          {pending.length > 0 && (
            <span className="text-[11px] font-semibold bg-amber-400/15 text-amber-400 border border-amber-400/25 rounded-full px-2 py-0.5">
              {pending.length} waiting
            </span>
          )}
          {done.length > 0 && (
            <span className="text-[11px] text-white/25">{done.length} done</span>
          )}
        </div>
      </div>

      {/* Pending items */}
      {pending.length > 0 && (
        <div className="divide-y divide-white/[0.04]">
          {pending.map(item => (
            <div key={item.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white truncate">{item.agent_name}</p>
                  <p className="text-[11px] text-white/40 mt-0.5">{item.title}</p>
                </div>
                <a
                  href={item.doc_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300 transition-colors flex-shrink-0"
                >
                  <span>Read plan</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Feedback input */}
              {feedbackId === item.id && (
                <div className="mb-2">
                  <textarea
                    className="w-full bg-white/[0.06] border border-white/[0.12] rounded-xl px-3 py-2 text-[12px] text-white placeholder-white/30 resize-none focus:outline-none focus:border-violet-500/50"
                    rows={2}
                    placeholder="What needs to change? (optional — leave blank to send as-is)"
                    value={feedbackText}
                    onChange={e => setFeedbackText(e.target.value)}
                    autoFocus
                  />
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => act(item.id, 'approve')}
                  disabled={!!acting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-[11px] font-semibold rounded-lg hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
                >
                  <CheckCircle className="w-3 h-3" />
                  Approve
                </button>
                <button
                  onClick={() => {
                    if (feedbackId === item.id) {
                      act(item.id, feedbackText ? 'feedback' : 'reject', feedbackText)
                    } else {
                      setFeedbackId(item.id)
                    }
                  }}
                  disabled={!!acting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-semibold rounded-lg hover:bg-amber-500/20 transition-colors disabled:opacity-40"
                >
                  <MessageSquare className="w-3 h-3" />
                  {feedbackId === item.id ? 'Send feedback' : 'Give feedback'}
                </button>
                {feedbackId === item.id && (
                  <button
                    onClick={() => { setFeedbackId(null); setFeedbackText('') }}
                    className="text-[11px] text-white/30 hover:text-white/50 transition-colors px-2"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={() => act(item.id, 'reject')}
                  disabled={!!acting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-semibold rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-40 ml-auto"
                >
                  <XCircle className="w-3 h-3" />
                  Reject
                </button>
              </div>

              {acting === item.id && (
                <p className="text-[11px] text-white/30 mt-2 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving...
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Done items (collapsed) */}
      {done.length > 0 && (
        <div className="px-4 py-2 border-t border-white/[0.04]">
          <div className="flex flex-wrap gap-2">
            {done.map(item => (
              <div key={item.id} className="flex items-center gap-1.5">
                {item.status === 'approved' && <CheckCircle className="w-3 h-3 text-emerald-400" />}
                {item.status === 'rejected' && <XCircle className="w-3 h-3 text-red-400" />}
                {item.status === 'needs-revision' && <MessageSquare className="w-3 h-3 text-amber-400" />}
                <span className="text-[11px] text-white/30">{item.agent_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
