import { useEffect, useState } from 'react'
import { Eyebrow } from '../shared/Eyebrow'
import { useToast } from '../shared/Toast'
import {
  decideVideoStudioLearningProposal,
  listVideoStudioLearningProposals,
  videoEngineEnabled,
  type VideoStudioLearningProposal,
} from '../../lib/videoStudio'

// What the Studio has learned and wants confirmed.
//
// The learning spine has written proposals since the portable session gateway
// landed, and nothing read them back: the loop recorded and never closed. This
// is the read. Each row is one assertion with its evidence count; approve or
// reject is Krish's ruling and the row is the receipt. Approval changes no
// engine configuration by itself, because the activation boundary is a
// reviewed Git commit. It renders nothing when the engine is off or the list
// is empty: an empty learning shelf is not worth a card.

const CLASS_LABEL: Record<VideoStudioLearningProposal['proposal_class'], string> = {
  taste: 'Taste',
  performance: 'Performance',
  engine_quality: 'Engine quality',
}

export function LearningProposals() {
  const [rows, setRows] = useState<VideoStudioLearningProposal[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (!videoEngineEnabled()) return
    const controller = new AbortController()
    listVideoStudioLearningProposals(controller.signal)
      .then(setRows)
      .catch(() => setRows([]))
    return () => controller.abort()
  }, [])

  if (!rows?.length) return null

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    setBusy(id)
    try {
      await decideVideoStudioLearningProposal(id, decision)
      setRows(prev => (prev || []).filter(r => r.id !== id))
      toast(decision === 'approved' ? 'Approved. The rule can now be reviewed into configuration.' : 'Rejected. The Studio will not propose this again.', 'success')
    } catch (e) {
      toast(`Could not save that: ${(e as Error)?.message || 'try again'}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section data-testid="learning-proposals">
      <h3 className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Eyebrow>What the Studio learned</Eyebrow>
        <span className="text-micro text-white/40">Confirm or reject each rule it wants to keep</span>
      </h3>
      <div className="flex flex-col gap-2">
        {rows.map(r => (
          <article key={r.id} className="rounded-xl border border-violet-400/20 bg-violet-400/[0.04] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-micro font-semibold">
              <span className="rounded-full bg-violet-400/15 px-2.5 py-1 text-violet-200">{CLASS_LABEL[r.proposal_class] || r.proposal_class}</span>
              <span className="text-white/40 tabular-nums">
                {r.independent_session_count} session{r.independent_session_count === 1 ? '' : 's'}, {r.independent_job_count} job{r.independent_job_count === 1 ? '' : 's'}
              </span>
              {r.counterexamples.length ? <span className="text-amber-200/80">{r.counterexamples.length} counterexample{r.counterexamples.length === 1 ? '' : 's'}</span> : null}
            </div>
            <p className="mt-1.5 break-words text-body leading-relaxed text-white/85">{r.assertion}</p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => decide(r.id, 'approved')}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-label font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-40"
              >
                Keep this rule
              </button>
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => decide(r.id, 'rejected')}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-label font-medium text-white/65 hover:bg-white/[0.06] disabled:opacity-40"
              >
                Not a rule
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
