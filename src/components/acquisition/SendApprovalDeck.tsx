import { useCallback, useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ChevronDown, ChevronRight, MailCheck, RefreshCw } from 'lucide-react'
import { useToast } from '../shared/Toast'
import { SkeletonList } from '../shared/Skeleton'
import { useDeferredPending } from '../shared/useDeferredPending'

/**
 * Send Approval Deck — the batch surface for queued nurture sends.
 * L1: every send is here. L2: only the 1-in-10 samples are (the header says
 * so, keeping the sampling contract visible). Approve fires the dispatcher
 * through /api/acquisition/sends; reject feeds the autonomy ladder's
 * rejection-rate signal via feedback_queue.
 */

interface DeckSend {
  id: string
  lane: string
  frame_version: string
  touch_number: number
  rendered_subject: string | null
  rendered_body: string | null
  queued_at: string | null
}

export function SendApprovalDeck({
  lane,
  autonomyLevel,
  focusSendId,
  onChanged,
}: {
  lane: string
  autonomyLevel: 'L1' | 'L2' | 'L3'
  /** Deep-linked send (acquisition?send=...) opens pre-expanded. */
  focusSendId?: string | null
  onChanged?: () => void
}) {
  const { toast } = useToast()
  const [sends, setSends] = useState<DeckSend[]>([])
  const [loading, setLoading] = useState(true)
  // Reserve the rows immediately, shimmer only once the wait has earned it.
  const waiting = useDeferredPending(loading)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string | null>(focusSendId || null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/acquisition/sends?lane=${encodeURIComponent(lane)}&status=queued`, { cache: 'no-store' })
      const json = await r.json().catch(() => null)
      if (!r.ok || !json || json.ok === false) throw new Error(json?.error || `HTTP ${r.status}`)
      setSends(Array.isArray(json.sends) ? json.sends : [])
    } catch {
      setSends([])
    } finally {
      setLoading(false)
    }
  }, [lane])

  useEffect(() => { setLoading(true); load() }, [load])

  const act = async (action: 'approve' | 'reject', ids: string[]) => {
    if (!ids.length || busy) return
    setBusy(true)
    try {
      const r = await fetch('/api/acquisition/sends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids,
          action,
          ...(action === 'reject' ? { reason: 'krish_rejected_in_deck' } : {}),
        }),
      })
      const json = await r.json().catch(() => null)
      if (!r.ok || !json || json.ok === false) throw new Error(json?.error || `HTTP ${r.status}`)
      toast(
        action === 'approve'
          ? `${json.affected} send${json.affected === 1 ? '' : 's'} approved — dispatching.`
          : `${json.affected} send${json.affected === 1 ? '' : 's'} rejected.`,
        'success',
      )
      setSelected(new Set())
      await load()
      onChanged?.()
    } catch (e: any) {
      toast(`${action === 'approve' ? 'Approve' : 'Reject'} failed: ${e?.message || 'try again'}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allIds = sends.map(s => s.id)
  const selectedIds = Array.from(selected)

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <MailCheck size={13} className="text-amber-400" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Send approvals
        </h2>
        <span className="ml-auto flex items-center gap-3">
          <span className="text-[10px] text-white/30 tabular-nums">{sends.length} queued</span>
          <button
            type="button"
            onClick={() => { setLoading(true); load() }}
            disabled={loading}
            title="Refresh"
            className="text-white/35 hover:text-white/70 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </span>
      </header>

      {autonomyLevel === 'L2' && (
        <div className="px-4 py-2 text-[10.5px] text-cyan-300/80 border-b border-white/[0.04] bg-cyan-400/[0.04]">
          L2 lane — these are the 1-in-10 samples. Unsampled sends go out automatically.
        </div>
      )}
      {autonomyLevel === 'L3' && sends.length === 0 && (
        <div className="px-4 py-2 text-[10.5px] text-emerald-300/80 border-b border-white/[0.04] bg-emerald-400/[0.04]">
          L3 lane — sends run unattended; only exceptions land here.
        </div>
      )}

      {loading ? (
        <SkeletonList rows={3} card={false} quiet={!waiting} />
      ) : sends.length === 0 ? (
        <div className="px-4 py-5 text-center text-[12px] text-white/35">
          Queue is clear — nothing waiting on you.
        </div>
      ) : (
        <>
          <div className="divide-y divide-white/[0.04]">
            {sends.map(s => {
              const isOpen = expanded === s.id
              return (
                <div key={s.id} className={`px-4 py-2.5 ${focusSendId === s.id ? 'bg-violet-500/[0.06]' : ''}`}>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                      className="accent-violet-500 flex-shrink-0"
                      aria-label={`Select send ${s.rendered_subject || s.id}`}
                    />
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : s.id)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      {isOpen
                        ? <ChevronDown size={12} className="text-white/30 flex-shrink-0" />
                        : <ChevronRight size={12} className="text-white/30 flex-shrink-0" />}
                      <span className="text-[10px] font-semibold text-white/40 uppercase flex-shrink-0">T{s.touch_number}</span>
                      <span className="text-[12px] text-white/85 truncate">{s.rendered_subject || '(no subject)'}</span>
                    </button>
                    {s.queued_at && (
                      <span className="text-[10px] text-white/25 flex-shrink-0">
                        {formatDistanceToNow(new Date(s.queued_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                  {isOpen && (
                    <div className="mt-2 ml-6 space-y-2">
                      <p className="text-[10px] text-white/30">{s.frame_version}</p>
                      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-[11.5px] text-white/70 whitespace-pre-wrap max-h-56 overflow-y-auto">
                        {s.rendered_body || '(empty body)'}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => act('approve', [s.id])}
                          className="rounded-lg bg-emerald-500/15 border border-emerald-400/30 px-3 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
                        >
                          Approve & send
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => act('reject', [s.id])}
                          className="rounded-lg bg-rose-500/10 border border-rose-400/25 px-3 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/20 transition-colors disabled:opacity-40"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="px-4 py-3 border-t border-white/[0.06] flex items-center gap-2">
            <button
              type="button"
              disabled={busy || selectedIds.length === 0}
              onClick={() => act('approve', selectedIds)}
              className="rounded-lg bg-emerald-500/15 border border-emerald-400/30 px-3 py-1.5 text-[11.5px] font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
            >
              Approve selected ({selectedIds.length})
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => act('approve', allIds)}
              className="rounded-lg border border-white/[0.1] px-3 py-1.5 text-[11.5px] font-medium text-white/70 hover:text-white hover:border-white/25 transition-colors disabled:opacity-40"
            >
              Approve all {allIds.length}
            </button>
            <button
              type="button"
              disabled={busy || selectedIds.length === 0}
              onClick={() => act('reject', selectedIds)}
              className="ml-auto rounded-lg border border-rose-400/25 px-3 py-1.5 text-[11.5px] font-medium text-rose-300/80 hover:text-rose-300 transition-colors disabled:opacity-40"
            >
              Reject selected
            </button>
          </div>
        </>
      )}
    </section>
  )
}
