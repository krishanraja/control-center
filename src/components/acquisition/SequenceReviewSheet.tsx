import { useCallback, useEffect, useState } from 'react'
import { Layers, X } from 'lucide-react'
import { useToast } from '../shared/Toast'

/**
 * Sequence Review — the amend-then-rule surface for a proposed sequence
 * (deep-linked from the sequence_approval decision card via acquisition?seq=).
 * Krish can rewrite any touch's subject/body in place (audited amend), then
 * approve or reject. Amendments are the orchestration lever: the machine
 * proposes, Krish reshapes, the machine executes the reshaped version.
 */

interface SequenceRow {
  id: string
  lane: string
  name: string
  sequence_type: string
  frame_version: string
  touches: Array<{ touch_number?: number; delay_days?: number; subject?: string; body?: string }>
  rationale: string | null
  status: string
  proposed_by: string
}

export function SequenceReviewSheet({
  seqId,
  onClose,
  onChanged,
}: {
  seqId: string
  onClose: () => void
  onChanged?: () => void
}) {
  const { toast } = useToast()
  const [seq, setSeq] = useState<SequenceRow | null>(null)
  const [touches, setTouches] = useState<SequenceRow['touches']>([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/acquisition/sequences', { cache: 'no-store' })
      const json = await r.json().catch(() => null)
      const row = (json?.sequences || []).find((s: SequenceRow) => s.id === seqId) || null
      if (row) {
        setSeq(row)
        setTouches(Array.isArray(row.touches) ? row.touches : [])
      } else {
        setMissing(true)
      }
    } catch {
      setMissing(true)
    }
  }, [seqId])

  useEffect(() => { load() }, [load])

  const act = async (payload: Record<string, unknown>, okMsg: string, terminal = false) => {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch('/api/acquisition/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: seqId, ...payload }),
      })
      const json = await r.json().catch(() => null)
      if (!r.ok || !json || json.ok === false) throw new Error(json?.error || `HTTP ${r.status}`)
      toast(okMsg, 'success')
      setDirty(false)
      onChanged?.()
      if (terminal) onClose()
    } catch (e: any) {
      toast(e?.message || 'Action failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const updateTouch = (idx: number, field: 'subject' | 'body', value: string) => {
    setTouches(prev => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)))
    setDirty(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#101014] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-[#101014] px-5 py-4 flex items-center gap-2 border-b border-white/[0.07]">
          <Layers size={14} className="text-violet-400" />
          <div className="flex-1 min-w-0">
            <h2 className="text-[14px] font-semibold text-white truncate">
              {seq?.name || 'Sequence review'}
            </h2>
            {seq && (
              <p className="text-[10.5px] text-white/40">
                {seq.lane} · {seq.sequence_type.replace(/_/g, ' ')} · {seq.frame_version} · proposed by {seq.proposed_by}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
            <X size={16} />
          </button>
        </header>

        {missing ? (
          <p className="px-5 py-8 text-center text-[12.5px] text-white/40">
            This sequence is gone or already ruled on.
          </p>
        ) : !seq ? (
          <p className="px-5 py-8 text-center text-[12.5px] text-white/40">Loading…</p>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {seq.rationale && (
              <p className="text-[12px] text-white/55 leading-snug rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                {seq.rationale}
              </p>
            )}

            {touches.map((t, idx) => (
              <div key={idx} className="rounded-xl border border-white/[0.07] overflow-hidden">
                <div className="px-3 py-2 bg-white/[0.02] border-b border-white/[0.05] flex items-center gap-2 text-[10.5px] text-white/40">
                  <span className="font-semibold text-white/60">Touch {t.touch_number ?? idx + 1}</span>
                  {t.delay_days != null && <span>· day {t.delay_days}</span>}
                </div>
                <div className="p-3 space-y-2">
                  <input
                    value={t.subject || ''}
                    onChange={e => updateTouch(idx, 'subject', e.target.value)}
                    placeholder="Subject"
                    className="w-full rounded-md bg-white/[0.04] border border-white/[0.08] px-2.5 py-1.5 text-[12.5px] text-white/90 focus:outline-none focus:border-violet-400/50"
                  />
                  <textarea
                    value={t.body || ''}
                    onChange={e => updateTouch(idx, 'body', e.target.value)}
                    rows={5}
                    placeholder="Body"
                    className="w-full rounded-md bg-white/[0.04] border border-white/[0.08] px-2.5 py-1.5 text-[12px] text-white/80 leading-snug focus:outline-none focus:border-violet-400/50 resize-y"
                  />
                </div>
              </div>
            ))}

            <div className="flex items-center gap-2 pb-1">
              {dirty && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act({ action: 'amend', touches }, 'Amendments saved.')}
                  className="rounded-lg bg-violet-500/15 border border-violet-400/30 px-3 py-1.5 text-[11.5px] font-medium text-violet-300 hover:bg-violet-500/25 transition-colors disabled:opacity-40"
                >
                  Save amendments
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (dirty) await act({ action: 'amend', touches }, 'Amendments saved.')
                  await act({ action: 'approve' }, 'Sequence approved — the scheduler can use it.', true)
                }}
                className="rounded-lg bg-emerald-500/15 border border-emerald-400/30 px-3 py-1.5 text-[11.5px] font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
              >
                {dirty ? 'Save & approve' : 'Approve'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => act({ action: 'reject', notes: 'rejected in sequence review' }, 'Sequence rejected.', true)}
                className="ml-auto rounded-lg border border-rose-400/25 px-3 py-1.5 text-[11.5px] font-medium text-rose-300/80 hover:text-rose-300 transition-colors disabled:opacity-40"
              >
                Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
