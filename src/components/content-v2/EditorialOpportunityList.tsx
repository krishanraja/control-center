import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import {
  editorialOpportunityHref,
  editorialSeriesForKey,
  opportunityScore,
  readEditorialDecision,
  readEditorialOpportunity,
} from '../../lib/editorialOpportunities'
import type { PublicSeriesKey } from '../../lib/publicSeries'
import { Eyebrow } from '../shared/Eyebrow'

export function EditorialOpportunityList({ ideas, seriesKey }: { ideas: ContentIdeaRow[]; seriesKey: PublicSeriesKey }) {
  const series = editorialSeriesForKey(seriesKey)
  const rows = ideas
    .map(idea => ({ idea, opportunity: readEditorialOpportunity(idea, series) }))
    .filter((row): row is { idea: ContentIdeaRow; opportunity: NonNullable<typeof row.opportunity> } => (
      Boolean(row.opportunity)
      && ['eligible', 'near_miss'].includes(row.opportunity.status)
      && !readEditorialDecision(row.idea, series)
    ))
    .sort((a, b) => {
      if (a.opportunity.status !== b.opportunity.status) return a.opportunity.status === 'eligible' ? -1 : 1
      return opportunityScore(b.opportunity) - opportunityScore(a.opportunity)
    })

  if (!rows.length) return null

  return (
    <section data-testid={`editorial-opportunities-${seriesKey}`}>
      <h3 className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Eyebrow>Ideas ready to shape</Eyebrow>
        <span className="text-micro text-white/40">One source, judged through this series</span>
      </h3>
      <div className="flex flex-col gap-2">
        {rows.map(({ idea, opportunity }) => (
          <a
            key={idea.id}
            href={editorialOpportunityHref(idea.id, series)}
            className="group rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 transition-colors hover:border-emerald-300/25 hover:bg-emerald-300/[0.035]"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-micro font-semibold uppercase tracking-[0.14em] ${opportunity.status === 'eligible' ? 'text-emerald-300' : 'text-amber-200'}`}>
                {opportunity.status === 'eligible' ? 'Ready' : 'Needs a judgement'}
              </span>
              <span className="text-micro text-white/35">{opportunity.corroboration} source{opportunity.corroboration === 1 ? '' : 's'}</span>
            </div>
            <div className="mt-1 break-words text-body font-semibold leading-snug text-white/90 group-hover:text-white">
              {opportunity.title || opportunity.angle || idea.idea}
            </div>
            <p className="mt-1 break-words text-label leading-relaxed text-white/48">{idea.idea}</p>
            <span className="mt-2 inline-block text-label font-semibold text-emerald-200">Review the angle</span>
          </a>
        ))}
      </div>
    </section>
  )
}
