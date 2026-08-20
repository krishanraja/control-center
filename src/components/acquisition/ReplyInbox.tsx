import { useCallback, useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { MessageSquare } from 'lucide-react'
import { useToast } from '../shared/Toast'
import { SkeletonList } from '../shared/Skeleton'
import { useDeferredPending } from '../shared/useDeferredPending'

/**
 * Reply Inbox — inbound replies to nurture sends. A reply always halts the
 * lead's sequence (the intake workflow suppresses pending sends); what's left
 * is a human moment: draft a product-brand reply (never the personal brand)
 * or close it.
 */

interface ReplyRow {
  id: string
  lane: string | null
  from_email: string | null
  subject: string | null
  body: string | null
  classification: string
  status: string
  created_at: string
}

const CLASS_TONE: Record<string, string> = {
  positive_intent: 'text-emerald-300',
  question: 'text-cyan-300',
  unsubscribe: 'text-white/40',
  auto_reply: 'text-white/30',
  unclassified: 'text-white/40',
}

export function ReplyInbox({ lane, onChanged }: { lane: string; onChanged?: () => void }) {
  const { toast } = useToast()
  const [rows, setRows] = useState<ReplyRow[]>([])
  const [loaded, setLoaded] = useState(false)
  // Reserve the rows immediately, shimmer only once the wait has earned it.
  const waiting = useDeferredPending(!loaded)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/acquisition/replies?lane=${encodeURIComponent(lane)}`, { cache: 'no-store' })
      const json = await r.json().catch(() => null)
      if (r.ok && json?.ok !== false) setRows(Array.isArray(json.replies) ? json.replies : [])
    } catch { /* transient */ } finally {
      setLoaded(true)
    }
  }, [lane])

  useEffect(() => { setLoaded(false); load() }, [load])

  const act = async (id: string, action: 'draft_reply' | 'close') => {
    if (busy) return
    setBusy(id)
    try {
      const r = await fetch('/api/acquisition/replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      const json = await r.json().catch(() => null)
      if (!r.ok || !json || json.ok === false) throw new Error(json?.error || `HTTP ${r.status}`)
      if (action === 'draft_reply') {
        toast('Product-brand reply drafted — review before sending.', 'success')
        if (json.draft_url) {
          try { window.open(json.draft_url, '_blank', 'noreferrer,noopener') } catch { /* blocked */ }
        }
      } else {
        toast('Reply closed.', 'success')
      }
      await load()
      onChanged?.()
    } catch (e: any) {
      toast(e?.message || 'Action failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  const open = rows.filter(r => r.status === 'new' || r.status === 'triaged')

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <MessageSquare size={13} className="text-emerald-400" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Reply inbox
        </h2>
        <span className="ml-auto text-[10px] text-white/30 tabular-nums">{open.length} open</span>
      </header>

      {!loaded ? (
        <SkeletonList rows={3} card={false} quiet={!waiting} />
      ) : open.length === 0 ? (
        <div className="px-4 py-5 text-center text-[12px] text-white/35">
          No open replies. Replies pause the sender's sequence automatically.
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {open.slice(0, 6).map(r => (
            <div key={r.id} className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-white truncate">{r.from_email || '(unknown)'}</span>
                <span className={`text-[10px] uppercase tracking-wide flex-shrink-0 ${CLASS_TONE[r.classification] || 'text-white/40'}`}>
                  {r.classification.replace(/_/g, ' ')}
                </span>
                <span className="ml-auto text-[10px] text-white/25 flex-shrink-0">
                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </span>
              </div>
              {(r.subject || r.body) && (
                <p className="text-[11px] text-white/45 truncate mt-0.5">{r.subject || r.body}</p>
              )}
              <div className="flex gap-2 mt-1.5">
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => act(r.id, 'draft_reply')}
                  className="rounded-lg bg-emerald-500/15 border border-emerald-400/30 px-2.5 py-1 text-[10.5px] font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
                >
                  Draft product reply
                </button>
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => act(r.id, 'close')}
                  className="rounded-lg border border-white/[0.1] px-2.5 py-1 text-[10.5px] font-medium text-white/50 hover:text-white/80 transition-colors disabled:opacity-40"
                >
                  Close
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
