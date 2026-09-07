import { useMemo, useState } from 'react'
import { Check, ExternalLink, ShieldAlert } from '@/lib/icons'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import {
  EDITORIAL_SERIES,
  editorialOpportunityHref,
  publicKeyForEditorialSeries,
  readEditorialDecision,
  readEditorialOpportunity,
  type EditorialSeries,
} from '../../lib/editorialOpportunities'
import { publicSeriesLabel } from '../../lib/publicSeries'
import { useHaptics } from '../../hooks/useHaptics'
import { ComposerShell } from './ComposerShell'
import { SeriesIdentity } from '../shared/MindmakeIdentity'
import { SegmentedNav, type Segment } from '../shared/SegmentedNav'
import { useToast } from '../shared/Toast'
import { Working } from '../shared/Working'

interface RouteResponse {
  ok: boolean
  action?: 'approve' | 'pass'
  idea_id?: string
  error?: string
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null
  return (
    <div>
      <dt className="text-micro font-semibold uppercase tracking-[0.14em] text-white/38">{label}</dt>
      <dd className="mt-1 break-words text-body leading-relaxed text-white/76">{children}</dd>
    </div>
  )
}

export function EditorialOpportunityGate({
  idea,
  series,
  onClose,
}: {
  idea: ContentIdeaRow
  series: EditorialSeries
  onClose: () => void
}) {
  const { toast } = useToast()
  const h = useHaptics()
  const [busy, setBusy] = useState<'approve' | 'pass' | null>(null)
  const [overrideReason, setOverrideReason] = useState('')
  const opportunity = readEditorialOpportunity(idea, series)
  const publicKey = publicKeyForEditorialSeries(series)
  const decision = readEditorialDecision(idea, series)

  const available = useMemo(() => EDITORIAL_SERIES.filter(key => readEditorialOpportunity(idea, key)), [idea])
  const segments = available.map((key): Segment<EditorialSeries> => ({
    id: key,
    label: publicSeriesLabel(publicKeyForEditorialSeries(key)),
  }))

  const switchSeries = (next: EditorialSeries) => {
    h.tap()
    window.location.hash = editorialOpportunityHref(idea.id, next).slice(1)
  }

  const act = async (action: 'approve' | 'pass') => {
    if (action === 'approve' && opportunity?.status === 'near_miss' && overrideReason.trim().length < 8) {
      toast('Say why this is worth taking forward despite the warning.', 'error')
      return
    }
    setBusy(action)
    h.heavy()
    try {
      const response = await fetch(`/api/content-ideas/${idea.id}/editorial-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, series, override_reason: overrideReason.trim() || null }),
      })
      const body = await response.json().catch(() => ({})) as RouteResponse
      if (!response.ok || !body.ok) throw new Error(body.error || `HTTP ${response.status}`)
      h.success()
      if (action === 'approve' && body.idea_id) {
        toast('Angle approved. The story is ready to develop.', 'success')
        window.location.hash = `#/content?idea=${encodeURIComponent(body.idea_id)}`
      } else {
        toast('Passed. This source stays in the evidence record.', 'success')
        onClose()
      }
    } catch (error) {
      h.error()
      toast(`Could not save that decision: ${(error as Error).message}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  if (!opportunity) {
    return (
      <ComposerShell onClose={onClose} title={<span className="text-ui font-semibold text-white">Editorial route unavailable</span>}>
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="max-w-md text-center text-body leading-relaxed text-white/60">
            This source does not carry a supported assessment for that series. Return to Content and choose one of the routes shown there.
          </p>
        </div>
      </ComposerShell>
    )
  }

  const hardBlocked = opportunity.status === 'rejected' || opportunity.status === 'no_angle' || opportunity.hard_blocks.length > 0
  const needsReason = opportunity.status === 'near_miss'

  return (
    <ComposerShell
      onClose={onClose}
      eyebrow="Editorial decision"
      title={<span className="block break-words text-ui font-semibold text-white">{idea.idea}</span>}
      meta={<span className="text-micro text-white/38">One source, two independent editorial lenses</span>}
    >
      <div className="flex-1 overflow-y-auto bg-[#07100c] px-4 py-5 sm:px-8 sm:py-7">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-28">
          {segments.length > 1 ? (
            <SegmentedNav
              segments={segments}
              value={series}
              onChange={switchSeries}
              label="Editorial series"
              variant="segmented"
            />
          ) : null}

          <SeriesIdentity series={publicKey} className="max-w-full" />

          <article className="editorial-paper rounded-2xl p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-micro font-bold uppercase tracking-[0.14em] ${hardBlocked ? 'text-rose-700' : needsReason ? 'text-amber-700' : 'text-emerald-700'}`}>
                {hardBlocked ? 'Blocked' : needsReason ? 'Needs judgement' : 'Ready to shape'}
              </span>
              <span className="text-micro text-[#102017]/48">{opportunity.corroboration} source{opportunity.corroboration === 1 ? '' : 's'}</span>
            </div>

            <h1 className="mt-3 break-words font-serif text-[clamp(1.65rem,5vw,2.65rem)] font-semibold leading-[0.98] tracking-[-0.035em]">
              {opportunity.title || opportunity.angle || idea.idea}
            </h1>

            <dl className="mt-6 grid gap-5 border-t border-[#102017]/14 pt-5 sm:grid-cols-2">
              <Field label="What changed">{opportunity.why_now}</Field>
              <Field label="Why it matters">{opportunity.audience_problem}</Field>
              <Field label="Mechanism">{opportunity.mechanism}</Field>
              <Field label="Visual proof">{opportunity.visual_proof}</Field>
            </dl>

            <div className="mt-6 border-l-2 border-amber-600 pl-3">
              <div className="text-micro font-bold uppercase tracking-[0.14em] text-amber-800">Strongest reason it may fail</div>
              <p className="mt-1 break-words text-body leading-relaxed text-[#102017]/76">{opportunity.strongest_failure}</p>
            </div>

            <div className="mt-7">
              <div className="editorial-kicker">Recommended angle</div>
              <div className="mt-2 rounded-xl border border-emerald-700/24 bg-white/45 p-4">
                <p className="break-words text-[1.08rem] font-semibold leading-snug">
                  {opportunity.recommended_version || opportunity.angle}
                </p>
                {opportunity.recommendation_reason ? (
                  <p className="mt-2 break-words text-label leading-relaxed text-[#102017]/62">{opportunity.recommendation_reason}</p>
                ) : null}
              </div>
            </div>

            {opportunity.proposed_hook ? <div className="mt-6"><Field label="Possible opening">{opportunity.proposed_hook}</Field></div> : null}
            {opportunity.honest_payoff ? <div className="mt-5"><Field label="Payoff">{opportunity.honest_payoff}</Field></div> : null}

            {opportunity.source_urls.length ? (
              <div className="mt-7 border-t border-[#102017]/14 pt-5">
                <div className="editorial-kicker">Evidence</div>
                <div className="mt-2 flex flex-col items-start gap-2">
                  {opportunity.source_urls.map(url => (
                    <a key={url} href={url} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-full items-start gap-1.5 break-all text-label text-emerald-800 underline underline-offset-2">
                      <ExternalLink size={12} className="mt-0.5 flex-none" /> {url}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </article>

          {decision ? (
            <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] p-4 text-body text-emerald-100">
              This route was {decision.status === 'approved' ? 'approved' : 'passed'} on {new Date(decision.decided_at).toLocaleDateString('en-GB')}.
            </div>
          ) : null}

          {hardBlocked ? (
            <div className="rounded-xl border border-rose-400/25 bg-rose-400/[0.06] p-4">
              <div className="flex items-center gap-2 text-body font-semibold text-rose-100"><ShieldAlert size={16} /> This route cannot be approved</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-label leading-relaxed text-rose-100/72">
                {opportunity.hard_blocks.map(block => <li key={block}>{block}</li>)}
              </ul>
            </div>
          ) : needsReason ? (
            <label className="block rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-4">
              <span className="text-label font-semibold text-amber-100">Why take this forward despite the warning?</span>
              <textarea
                value={overrideReason}
                onChange={event => setOverrideReason(event.target.value)}
                rows={3}
                placeholder="Your judgement becomes part of this story's provenance."
                className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-body text-white outline-none placeholder:text-white/28 focus:border-amber-300/40"
              />
            </label>
          ) : null}
        </div>
      </div>

      {!decision ? (
        <div className="flex flex-none gap-2 border-t border-white/[0.08] bg-[#07100c]/96 p-3 sm:justify-end sm:px-8">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => act('pass')}
            className="min-h-[46px] rounded-xl border border-white/12 px-5 text-body font-semibold text-white/68 hover:bg-white/[0.05] disabled:opacity-45"
          >
            {busy === 'pass' ? <Working size={15} /> : 'Pass'}
          </button>
          <button
            type="button"
            disabled={busy !== null || hardBlocked}
            onClick={() => act('approve')}
            className="flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 text-body font-bold text-emerald-950 hover:bg-emerald-200 disabled:opacity-40 sm:flex-none"
          >
            {busy === 'approve' ? <Working size={15} /> : <Check size={16} />} Use this angle
          </button>
        </div>
      ) : null}
    </ComposerShell>
  )
}
