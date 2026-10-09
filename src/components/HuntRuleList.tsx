import { useState } from 'react'
import { Check, ExternalLink, X } from '@/lib/icons'
import { Eyebrow } from './shared/Eyebrow'
import { OptionChips } from './goals/GoalPickers'
import { useToast } from './shared/Toast'
import { DECLINE_REASONS } from '../lib/hunterActions'
import type { PendingPress, RuleRole } from '../hooks/useHuntReview'

// The roles hunter put on his list that he has not ruled on, each with the
// case for it, ruled here instead of in column A. A press is queued and hunter
// writes column A with exactly the words he would have typed, then records and
// archives it as it always has. The sheet stays the record.

type Act = (a: { kind: 'verdict'; job_id: string; payload: unknown }) => Promise<string | null>

function waitingLine(p: PendingPress): string {
  const v = String((p.payload || {}).verdict || '')
  if (p.kind !== 'verdict') return 'Sent to hunter. It applies this within a few minutes.'
  if (v === 'yes') return 'Yes. Hunter writes it to the sheet within a few minutes and builds the package on the next Process.'
  if (v === 'declined') return `Declined, ${String((p.payload || {}).reason || '')}. Hunter records it within a few minutes.`
  return 'Recorded. Hunter writes it to the sheet within a few minutes.'
}

function RuleCard({ r, pending, act }: { r: RuleRole; pending: PendingPress | undefined; act: Act }) {
  const { toast } = useToast()
  const [declining, setDeclining] = useState(false)
  const [busy, setBusy] = useState(false)

  const press = async (payload: Record<string, string>) => {
    setBusy(true)
    const err = await act({ kind: 'verdict', job_id: r.job_id, payload })
    setBusy(false)
    if (err) toast(err)
    else setDeclining(false)
  }

  return (
    <li className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3" data-testid="hunt-rule">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ui font-semibold text-ink">
            {r.title}
            <span className="text-ink-faint font-normal"> at {r.company}</span>
          </p>
          <p className="text-label text-ink-faint mt-0.5">
            {[r.fit != null ? `fit ${r.fit}` : null, r.score != null ? `score ${r.score}` : null, r.location, r.comp]
              .filter(Boolean).join(' | ')}
          </p>
        </div>
        {r.url && (
          <a href={r.url} target="_blank" rel="noreferrer" className="shrink-0 text-label text-violet-300 hover:text-violet-200 flex items-center gap-1">
            posting <ExternalLink size={10} />
          </a>
        )}
      </div>
      {r.why_it_fits && <p className="text-label text-ink-muted mt-2">{r.why_it_fits}</p>}
      {pending ? (
        <p className="text-label text-emerald-300 mt-2" data-testid="hunt-rule-pending">{waitingLine(pending)}</p>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button" disabled={busy} onClick={() => press({ verdict: 'yes' })} data-testid="hunt-rule-yes"
              className="tap-44 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-label font-medium bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              <Check size={12} /> Yes, go for it
            </button>
            <button
              type="button" disabled={busy} onClick={() => setDeclining(d => !d)} data-testid="hunt-rule-no"
              className="tap-44 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-label font-medium bg-white/[0.05] text-ink-muted hover:bg-white/[0.09] disabled:opacity-50"
            >
              <X size={12} /> No
            </button>
          </div>
          {declining && (
            <OptionChips
              label="Why not? Hunter learns from this."
              options={DECLINE_REASONS.map(x => ({ value: x, label: x }))}
              value=""
              disabled={busy}
              onChange={reason => { void press({ verdict: 'declined', reason }) }}
            />
          )}
        </div>
      )}
    </li>
  )
}

export function HuntRuleList({ roles, pending, act, narrow }: {
  roles: RuleRole[]
  pending: Record<string, PendingPress>
  act: Act
  narrow: boolean
}) {
  if (!roles.length) return null
  const open = roles.filter(r => !pending[r.job_id]).length
  return (
    <section data-testid="hunt-rule-list" id="hunt-rule-list">
      <Eyebrow>{open ? `Roles to rule on (${open})` : 'Roles to rule on'}</Eyebrow>
      <ul className={narrow ? 'space-y-3 mt-2' : 'grid grid-cols-1 xl:grid-cols-2 gap-3 mt-2'}>
        {roles.map(r => <RuleCard key={r.job_id} r={r} pending={pending[r.job_id]} act={act} />)}
      </ul>
    </section>
  )
}
