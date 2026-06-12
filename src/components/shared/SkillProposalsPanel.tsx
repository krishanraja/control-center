import { useState } from 'react'
import { Sparkles, ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useSkillProposals } from '../../hooks/useSkillProposals'

/**
 * Generative twin of the "Pending corrections from Vera" panel. Surfaces
 * skill_proposals (status='proposed') drafted by the Sunday Success Induction
 * Sweep. Approve appends the induced skill to the target agent's brief_content
 * (the same render path corrections use); reject discards it. Self-hides when
 * there is nothing pending, so it costs nothing until the loop produces signal.
 */
export function SkillProposalsPanel() {
  const { data: proposals, loading, refetch } = useSkillProposals()
  const [busy, setBusy] = useState<Record<string, 'idle' | 'approving' | 'rejecting' | 'ok' | 'err'>>({})
  const [errMsg, setErrMsg] = useState<Record<string, string>>({})

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusy(prev => ({ ...prev, [id]: action === 'approve' ? 'approving' : 'rejecting' }))
    setErrMsg(prev => ({ ...prev, [id]: '' }))
    try {
      const r = await fetch(`/api/skill-proposals/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_proposal_id: id }),
      })
      const payload = await r.json().catch(() => ({}))
      if (!r.ok || !payload.ok) throw new Error(payload.error || `HTTP ${r.status}`)
      setBusy(prev => ({ ...prev, [id]: 'ok' }))
      await refetch()
    } catch (e) {
      setBusy(prev => ({ ...prev, [id]: 'err' }))
      setErrMsg(prev => ({ ...prev, [id]: (e as Error).message }))
    }
  }

  if (!loading && proposals.length === 0) return null

  return (
    <section className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/[0.06] to-transparent p-3 md:p-4">
      <header className="flex items-center gap-2 mb-3 px-0.5">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-300">
          <Sparkles size={13} />
        </span>
        <h3 className="text-[11px] md:text-[12px] font-semibold uppercase tracking-[0.18em] text-violet-300">
          Skills Vera wants to teach
        </h3>
        <span className="text-[10px] font-mono tabular-nums text-white/30 ml-auto">
          {loading ? '…' : proposals.length}
        </span>
      </header>
      <p className="text-[10.5px] md:text-[11px] text-white/45 leading-snug mb-3 px-0.5">
        Vera clustered repeated wins and drafted reusable plays. Approve to append the play to the agent's identity, reject to dismiss.
      </p>
      <div className="space-y-2">
        {proposals.map(p => {
          const state = busy[p.id] || 'idle'
          const confColor = p.confidence === 'high'
            ? 'text-emerald-300'
            : p.confidence === 'medium' ? 'text-amber-300' : 'text-white/40'
          return (
            <div key={p.id} data-skill-proposal-id={p.id} className="rounded-lg border border-violet-500/20 bg-white/[0.02] p-3">
              <div className="flex items-start gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-white">{p.skill_title}</p>
                  <p className="text-[10px] text-violet-200/80 mt-0.5">
                    <span className="capitalize">{p.target_agent_id || 'fleet'}</span>
                    <span className="text-white/30"> · </span>
                    <span className={confColor}>{p.confidence} confidence</span>
                    {p.evidence_count != null && (
                      <span className="text-white/40"> · {p.evidence_count} wins</span>
                    )}
                  </p>
                </div>
                <span className="text-[10px] text-white/30 tabular-nums flex-shrink-0">
                  {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                </span>
              </div>
              {p.skill_body && (
                <pre className="text-[11px] text-white/70 leading-relaxed whitespace-pre-wrap bg-black/30 border border-white/[0.06] rounded p-2 max-h-40 overflow-auto font-mono">
                  {p.skill_body}
                </pre>
              )}
              {errMsg[p.id] && (
                <p className="text-[10px] text-rose-400 mt-1.5">{errMsg[p.id]}</p>
              )}
              <div className="flex items-center gap-1.5 mt-2.5">
                <button
                  onClick={() => act(p.id, 'approve')}
                  disabled={state === 'approving' || state === 'rejecting' || state === 'ok'}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                >
                  {state === 'approving' ? <Loader2 size={11} className="animate-spin" /> : <ThumbsUp size={11} />}
                  Approve
                </button>
                <button
                  onClick={() => act(p.id, 'reject')}
                  disabled={state === 'approving' || state === 'rejecting' || state === 'ok'}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-white/[0.04] text-white/60 border border-white/[0.08] hover:bg-white/[0.08] transition-colors disabled:opacity-50"
                >
                  {state === 'rejecting' ? <Loader2 size={11} className="animate-spin" /> : <ThumbsDown size={11} />}
                  Reject
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
