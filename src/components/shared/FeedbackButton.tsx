import React, { useState } from 'react'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { useToast } from './Toast'
import { useHaptics } from '../../hooks/useHaptics'
import { reasonsFor, defaultReasonFor, surfaceFor, type ServedTable } from '../../lib/servedSurfaces'

// The surface list and the reason chips both come from the registry now. This
// component used to carry its own third copy of the taxonomy, and it had
// drifted: 26 of its codes disagreed with src/lib/triageReasons.ts, and 18 of
// them were absent from the API's allow-list entirely, so a thumbs-down on a
// task or a bet reached Vera with no usable reason on it.
export type FeedbackSurface = ServedTable

/**
 * What actually happens next, in Krish's words rather than the system's.
 * `pattern` comes back from /api/feedback, which counts the live cluster this
 * rejection just joined against the threshold Vera really uses.
 */
function receiptFor(pattern?: { count: number; threshold: number; remaining: number } | null): string {
  if (!pattern) return 'Got it. Vera will learn from this.'
  if (pattern.remaining <= 0) return `Got it. That is ${pattern.count} like this - Vera rewrites the brief on Sunday.`
  if (pattern.remaining === 1) return 'Got it. One more like this and Vera rewrites the brief.'
  return `Got it. ${pattern.remaining} more like this and Vera rewrites the brief.`
}

interface Props {
  sourceTable: FeedbackSurface
  sourceId: string
  agentId?: string | null
  compact?: boolean
}

export function FeedbackButton({ sourceTable, sourceId, agentId, compact }: Props) {
  const { toast } = useToast()
  const h = useHaptics()
  const [showReasons, setShowReasons] = useState(false)
  const [vote, setVote] = useState<1 | -1 | null>(null)
  const [busy, setBusy] = useState(false)
  const [reasonText, setReasonText] = useState('')

  const submit = async (v: 1 | -1, reasonCode?: string) => {
    if (busy) return
    setBusy(true)
    h.tap()
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_table: sourceTable,
          source_id: sourceId,
          agent_id: agentId || null,
          vote: v,
          reason_code: reasonCode || null,
          reason_text: reasonText.trim() || null,
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const payload = await r.json().catch(() => ({}))
      if (!payload.ok) throw new Error(payload.error || 'unknown error')
      setVote(v)
      setShowReasons(false)
      h.success()
      toast(v === 1 ? 'Thanks. Logged.' : receiptFor(payload?.pattern), 'success')
    } catch (e) {
      h.error()
      toast(`Could not save feedback: ${(e as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const size = compact ? 'w-3.5 h-3.5' : 'w-4 h-4'
  const reasons = reasonsFor(sourceTable)
  const label = surfaceFor(sourceTable)?.label ?? 'item'

  return (
    <div className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => submit(1)}
        disabled={busy || vote !== null}
        aria-label="Thumbs up"
        title="Useful"
        className={`p-1 rounded transition-colors ${
          vote === 1 ? 'text-emerald-300' : 'text-white/30 hover:text-white/70'
        } disabled:opacity-60`}
      >
        <ThumbsUp className={size} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={() => { h.tap(); setShowReasons(true) }}
        disabled={busy || vote !== null}
        aria-label="Thumbs down"
        title="Not useful"
        className={`p-1 rounded transition-colors ${
          vote === -1 ? 'text-rose-300' : 'text-white/30 hover:text-white/70'
        } disabled:opacity-60`}
      >
        <ThumbsDown className={size} strokeWidth={2} />
      </button>
      {showReasons && (
        <div
          className="absolute right-0 top-full mt-1 z-30 bg-base border border-white/[0.08] rounded-lg shadow-2xl py-1 min-w-[240px]"
          onMouseLeave={() => setShowReasons(false)}
        >
          <div className="px-3 py-2 text-micro uppercase tracking-wider text-white/40 border-b border-white/[0.06]">
            Why? (optional)
          </div>
          <div className="px-2 pt-2">
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="Add a short reason…"
              rows={2}
              className="w-full resize-none rounded-md border border-white/[0.1] bg-white/[0.03] px-2 py-1.5 text-label text-white/85 placeholder:text-white/30 focus:border-violet-400/40 focus:outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          {reasons.map(r => (
            <button
              key={r.code}
              onClick={() => submit(-1, r.code)}
              className="w-full text-left px-3 py-2 text-label text-white/80 hover:bg-white/5"
            >
              {r.label}
            </button>
          ))}
          <div className="border-t border-white/[0.06] mt-1 pt-1">
            <button
              onClick={() => submit(-1, defaultReasonFor(sourceTable))}
              className="w-full text-left px-3 py-2 text-label text-white/55 hover:bg-white/5"
            >
              {reasonText.trim() ? 'Submit reason' : 'Skip and just downvote'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
