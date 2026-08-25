import React from 'react'
import { format } from 'date-fns'
import { FeedCard } from '../mobile/primitives'
import { AgentAvatar } from '../shared/AgentAvatar'
import { LastUpdated } from '../shared/LastUpdated'
import { Skeleton } from '../shared/Skeleton'
import { useHomeIntelligence } from '../../hooks/useHomeIntelligence'
import { useMarcusSynthesis } from '../../hooks/useMarcusSynthesis'

/**
 * Marcus's read, once. Desktop used to render the same content twice —
 * `assessment` (a pipe-joined copy of the insights) as "Strategic Assessment",
 * then the insights themselves as "Weekly Insights" directly below. One card
 * now: the deduped read, org focus, the content recommendation, this week's
 * focus, and Marcus's own scoreboard — his authored numbers with targets,
 * which live HERE and not in the deterministic KPI band above.
 */

/**
 * Drop the assessment when the insight list already carries it. The known
 * production shape is `assessment = insights.join(' | ')`; any assessment
 * whose content is fully covered by the insights adds nothing twice.
 * Exported for the spec.
 */
export function dedupeMarcusRead(
  assessment: string | null,
  insights: string[],
): { assessment: string | null; insights: string[] } {
  if (!assessment) return { assessment: null, insights }
  if (insights.length === 0) return { assessment, insights: [] }
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
  const a = norm(assessment)
  if (insights.every(i => a.includes(norm(i)))) {
    return { assessment: null, insights }
  }
  return { assessment, insights }
}

function weekLabel(weekOf: string | null | undefined): string | null {
  if (!weekOf) return null
  const d = new Date(weekOf)
  if (Number.isNaN(d.getTime())) return `Week of ${weekOf}`
  return `Week of ${format(d, 'd MMM')}`
}

export function MarcusReadCard() {
  const { intel, loading: intelLoading } = useHomeIntelligence()
  const { synthesis, loading: synthLoading } = useMarcusSynthesis()
  const loading = intelLoading || synthLoading

  const read = dedupeMarcusRead(intel.assessment, synthesis?.insights || [])
  const focus = intel.summary?.recommended_focus || null
  const body = intel.summary?.body || null

  const hasAnything =
    Boolean(body) || Boolean(read.assessment) || read.insights.length > 0 ||
    Boolean(synthesis?.org_focus) || Boolean(synthesis?.cleo_recommendations) ||
    Boolean(focus) || intel.metrics.length > 0

  return (
    <FeedCard
      title="Marcus's read"
      action={<LastUpdated date={intel.generated_at ? new Date(intel.generated_at) : null} />}
    >
      {loading && !hasAnything ? (
        <div className="px-5 py-4 flex flex-col gap-2.5" aria-busy="true" role="status" aria-label="Loading">
          <Skeleton h={12} w="70%" />
          <Skeleton h={12} w="100%" />
          <Skeleton h={12} w="85%" />
        </div>
      ) : !hasAnything ? (
        <p className="px-5 py-6 text-ui text-white/40">
          Nothing written yet — Marcus runs Monday, Wednesday and Friday.
        </p>
      ) : (
        <>
          {(body || read.assessment || read.insights.length > 0) && (
            <div className="px-5 py-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <AgentAvatar agent="marcus" size="sm" />
                <span className="text-micro text-white/50">Marcus — cross-domain synthesis</span>
              </div>
              {body && (
                <p className="text-body leading-relaxed text-white/75 whitespace-pre-wrap">{body}</p>
              )}
              {read.assessment && (
                <p className="text-body leading-relaxed text-white/75 whitespace-pre-wrap">{read.assessment}</p>
              )}
              {read.insights.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {read.insights.map((insight, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-violet-300/70" />
                      <span className="text-body leading-relaxed text-white/70">{insight}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {synthesis?.org_focus && (
            <div className="px-5 py-3.5">
              <p className="text-micro font-semibold uppercase tracking-[0.14em] text-amber-400/70 mb-1">Org focus</p>
              <p className="text-body leading-relaxed text-amber-200/70">{synthesis.org_focus}</p>
            </div>
          )}

          {synthesis?.cleo_recommendations && (
            <div className="px-5 py-3.5">
              <p className="text-micro font-semibold uppercase tracking-[0.14em] text-sky-400/70 mb-1">Content recommendation</p>
              <p className="text-body leading-relaxed text-sky-200/70">{synthesis.cleo_recommendations}</p>
            </div>
          )}

          {focus && (
            <div className="px-5 py-3.5">
              <p className="text-micro font-semibold uppercase tracking-[0.14em] text-white/45 mb-1">Focus this week</p>
              <p className="text-body leading-relaxed text-white/75">{focus}</p>
            </div>
          )}

          {intel.metrics.length > 0 && (
            <div className="px-5 py-3.5">
              <p className="text-micro font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">Marcus's scoreboard</p>
              <div className="flex flex-col gap-3">
                {intel.metrics.map(m => {
                  const pct = Math.max(0, Math.min(100, m.progress_pct ?? 0))
                  const bar =
                    pct >= 80 ? 'bg-emerald-400' :
                    pct >= 40 ? 'bg-amber-400' :
                    'bg-red-400'
                  return (
                    <div key={m.id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate text-ui text-white/80">{m.label}</span>
                          <span className="shrink-0 font-mono tabular-nums text-ui text-white/85">
                            {m.value}
                            {m.target && <span className="text-white/35"> / {m.target}</span>}
                          </span>
                        </div>
                        {m.progress_pct != null && (
                          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                            <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {weekLabel(synthesis?.week_of) && (
            <p className="px-5 py-2.5 text-micro text-white/30">{weekLabel(synthesis?.week_of)}</p>
          )}
        </>
      )}
    </FeedCard>
  )
}
