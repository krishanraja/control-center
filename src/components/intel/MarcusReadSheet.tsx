import React from 'react'
import { format } from 'date-fns'
import { SlideOver } from '../shared/SlideOver'
import { AgentAvatar } from '../shared/AgentAvatar'
import { LastUpdated } from '../shared/LastUpdated'
import { Skeleton } from '../shared/Skeleton'
import { useHomeIntelligence } from '../../hooks/useHomeIntelligence'
import { useMarcusSynthesis } from '../../hooks/useMarcusSynthesis'

/**
 * Marcus's full brief, one tap behind his dateline in the Business
 * Intelligence header: the deduped read, org focus, the content
 * recommendation, this week's focus, and his own scoreboard. His authored
 * numbers live HERE, quarantined from the deterministic answers on the tab.
 *
 * Desktop used to render the same content twice — `assessment` (a
 * pipe-joined copy of the insights) as "Strategic Assessment", then the
 * insights themselves directly below. dedupeMarcusRead keeps the read once.
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

export function MarcusReadSheet({ open, onClose }: {
  open: boolean
  onClose: () => void
}) {
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
    <SlideOver open={open} onClose={onClose} ariaLabel="Marcus's brief" label="Marcus's brief">
      <div className="flex flex-col gap-5" data-testid="marcus-read-sheet">
        <div className="flex items-center gap-2">
          <AgentAvatar agent="marcus" size="sm" />
          <span className="text-micro text-white/50">Marcus — cross-domain synthesis</span>
          <span className="ml-auto"><LastUpdated date={intel.generated_at ? new Date(intel.generated_at) : null} /></span>
        </div>

        {loading && !hasAnything ? (
          <div className="flex flex-col gap-2.5" aria-busy="true" role="status" aria-label="Loading">
            <Skeleton h={12} w="70%" />
            <Skeleton h={12} w="100%" />
            <Skeleton h={12} w="85%" />
          </div>
        ) : !hasAnything ? (
          <p className="text-body leading-relaxed text-white/45">
            Nothing written yet. Marcus runs Monday, Wednesday and Friday.
          </p>
        ) : (
          <>
            {intel.summary?.headline && (
              <p className="font-serif text-title italic leading-snug text-violet-200/90">{intel.summary.headline}</p>
            )}
            {body && (
              <p className="font-serif text-lede leading-relaxed text-white/80 whitespace-pre-wrap">{body}</p>
            )}
            {read.assessment && (
              <p className="font-serif text-lede leading-relaxed text-white/80 whitespace-pre-wrap">{read.assessment}</p>
            )}
            {read.insights.length > 0 && (
              <ul className="flex flex-col gap-2.5">
                {read.insights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span aria-hidden className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-violet-300/70" />
                    <span className="font-serif text-lede leading-relaxed text-white/75">{insight}</span>
                  </li>
                ))}
              </ul>
            )}

            {synthesis?.org_focus && (
              <div>
                <p className="mb-1 font-mono text-micro font-semibold uppercase tracking-[0.14em] text-amber-400/70">Org focus</p>
                <p className="font-serif text-lede leading-relaxed text-amber-200/75">{synthesis.org_focus}</p>
              </div>
            )}

            {synthesis?.cleo_recommendations && (
              <div>
                <p className="mb-1 font-mono text-micro font-semibold uppercase tracking-[0.14em] text-sky-400/70">Content recommendation</p>
                <p className="font-serif text-lede leading-relaxed text-sky-200/75">{synthesis.cleo_recommendations}</p>
              </div>
            )}

            {focus && (
              <div>
                <p className="mb-1 font-mono text-micro font-semibold uppercase tracking-[0.14em] text-white/45">Focus this week</p>
                <p className="font-serif text-lede leading-relaxed text-white/80">{focus}</p>
              </div>
            )}

            {intel.metrics.length > 0 && (
              <div>
                <p className="mb-2 font-mono text-micro font-semibold uppercase tracking-[0.14em] text-white/45">His scoreboard</p>
                <div className="flex flex-col gap-3">
                  {intel.metrics.map(m => {
                    const pct = Math.max(0, Math.min(100, m.progress_pct ?? 0))
                    const bar =
                      pct >= 80 ? 'bg-emerald-400' :
                      pct >= 40 ? 'bg-amber-400' :
                      'bg-red-400'
                    return (
                      <div key={m.id}>
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
                    )
                  })}
                </div>
                <p className="mt-2 text-micro text-white/30">
                  These are Marcus's own targets, not system numbers.
                </p>
              </div>
            )}

            {weekLabel(synthesis?.week_of) && (
              <p className="text-micro text-white/30">{weekLabel(synthesis?.week_of)}</p>
            )}
          </>
        )}
      </div>
    </SlideOver>
  )
}
