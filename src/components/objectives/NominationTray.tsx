import React, { useState } from 'react'
import { Check, ThumbsDown, X, Sparkles } from 'lucide-react'
import { useObjectives, type Objective } from '../../hooks/useObjectives'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { Working } from '../shared/Working'

// Marcus-nominated objectives awaiting Krish accept/reject.
// Source = marcus_nominated, status = proposed.
// Accept promotes to active. Reject drops and posts marcus_objective_nomination_rejected
// to Vera (the objective altitude in the three-altitude feedback model).
export function NominationTray() {
  const { nominations, refresh } = useObjectives()

  if (nominations.length === 0) return null

  return (
    <section className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.05] to-transparent p-4">
      <header className="flex items-center gap-2 mb-3">
        <Sparkles size={13} className="text-amber-300" />
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-200">
          Marcus nominates
        </h2>
        <span className="text-[10px] text-amber-200/55 tabular-nums">{nominations.length}</span>
        <span className="ml-auto text-[10px] text-white/40 italic">
          Cluster of unparented tasks suggests these objectives
        </span>
      </header>
      <ul className="space-y-2">
        {nominations.map(n => (
          <NominationRow key={n.id} objective={n} onChanged={refresh} />
        ))}
      </ul>
    </section>
  )
}

function NominationRow({ objective, onChanged }: { objective: Objective; onChanged: () => void }) {
  const h = useHaptics()
  const { toast } = useToast()
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [busy, setBusy] = useState(false)

  const accept = async () => {
    setBusy(true)
    h.tap()
    try {
      const r = await fetch(`/api/objectives/${encodeURIComponent(objective.id)}/nominate-accept`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      h.success()
      toast('Promoted to active', 'success')
      onChanged()
    } catch (e) {
      h.error()
      toast(`Accept failed: ${(e as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const reject = async () => {
    if (!rejectReason.trim()) {
      toast('Reason required so Marcus learns the cluster bar', 'error')
      return
    }
    setBusy(true)
    h.tap()
    try {
      const r = await fetch(`/api/objectives/${encodeURIComponent(objective.id)}/nominate-reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason_text: rejectReason.trim() }),
      })
      const j = await r.json().catch(() => ({}))
      if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      h.success()
      toast('Rejected. Marcus will tighten the cluster bar.', 'success')
      setRejecting(false)
      setRejectReason('')
      onChanged()
    } catch (e) {
      h.error()
      toast(`Reject failed: ${(e as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-md border border-white/[0.06] bg-white/[0.02]">
      <div className="flex items-start gap-2 px-3 py-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white leading-snug break-words">{objective.title}</p>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-white/45">
            {objective.venture && <span className="uppercase tracking-[0.12em]">{objective.venture}</span>}
            {objective.objective_kind && <span>· {objective.objective_kind}</span>}
            {objective.why_now && <span className="italic">· {objective.why_now}</span>}
          </div>
        </div>
        {!rejecting && (
          <div className="flex-shrink-0 flex items-center gap-1">
            <button
              type="button"
              onClick={accept}
              disabled={busy}
              title="Accept and promote to active"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-200 bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-400/30 rounded px-2 py-1 disabled:opacity-50"
            >
              {busy ? <Working size={10} /> : <Check size={10} />}
              Accept
            </button>
            <button
              type="button"
              onClick={() => { h.tap(); setRejecting(true) }}
              title="Reject nomination"
              className="inline-flex items-center gap-1 text-[11px] text-rose-300/80 hover:text-rose-200 px-2 py-1"
            >
              <ThumbsDown size={10} />
            </button>
          </div>
        )}
      </div>

      {rejecting && (
        <div className="border-t border-rose-400/20 bg-rose-500/[0.04] px-3 py-2 space-y-2">
          <label className="block text-[10px] uppercase tracking-[0.14em] text-rose-200/80">
            Why is this not a real objective?
          </label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={2}
            autoFocus
            placeholder="e.g. these tasks are unrelated, the venture inference is wrong, this is one-off work"
            className="w-full bg-black/30 border border-white/[0.08] rounded px-2 py-1.5 text-[11px] text-white placeholder:text-white/25 focus:border-rose-400/40 focus:outline-none resize-none"
          />
          <p className="text-[10px] text-rose-200/55 italic">
            Posts `marcus_objective_nomination_rejected` to Vera (objective altitude). Teaches Marcus to tighten cluster detection.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setRejecting(false); setRejectReason('') }} className="text-[11px] text-white/45 hover:text-white/75 px-2 py-1">
              <X size={11} className="inline mr-0.5" /> Cancel
            </button>
            <button
              type="button"
              onClick={reject}
              disabled={busy || !rejectReason.trim()}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-100 bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/40 rounded px-2.5 py-1 disabled:opacity-50"
            >
              <ThumbsDown size={11} />
              Reject nomination
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
