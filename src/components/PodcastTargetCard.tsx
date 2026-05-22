import React from 'react'
import { ExternalLink, Mic, Sparkles } from 'lucide-react'
import { FeedbackButton } from './shared/FeedbackButton'
import type { VisibilityTargetRow } from '../hooks/useVisibilityTargets'

interface Props {
  target: VisibilityTargetRow
}

/**
 * Podcast target card for the Visibility lane — rose-themed sibling of
 * VisibilityTargetCard, used when the target type is `podcast` so the lane
 * still reads as one surface but podcasts get a visual lane of their own.
 * Sources from the unified visibility_targets table; richer Podchaser-only
 * fields (host email, episode count, latest episode) are no longer surfaced
 * here — they live with the outbound pipeline.
 */
export function PodcastTargetCard({ target: t }: Props) {
  const primaryCta = t.event_url || t.cfp_url || null

  return (
    <article className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-3.5 hover:border-rose-500/35 transition-colors">
      <header className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-white leading-snug flex items-center gap-1.5">
            <Mic size={11} className="text-rose-300 flex-shrink-0" />
            <span className="truncate">{t.title}</span>
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-200">
              <Mic size={10} />
              Podcast
            </span>
            {t.audience && (
              <span className="inline-flex items-center text-[10px] text-white/55">
                {t.audience}
              </span>
            )}
            {typeof t.relevance_score === 'number' && t.relevance_score > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-200 tabular-nums">
                Fit {t.relevance_score}
              </span>
            )}
            {t.quality_score && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-[0.1em] ${
                t.quality_score === 'green' ? 'bg-emerald-500/10 text-emerald-300' :
                t.quality_score === 'amber' ? 'bg-amber-500/10 text-amber-300' :
                'bg-rose-500/10 text-rose-300'
              }`}>
                {t.quality_score}
              </span>
            )}
          </div>
        </div>
      </header>

      {t.why_relevant && (
        <p className="text-[12px] text-white/75 leading-snug mt-3">
          <Sparkles size={10} className="inline mr-1 text-rose-300" />
          <span className="text-white/40">Why: </span>
          {t.why_relevant}
        </p>
      )}

      {t.suggested_talk_title && (
        <p className="text-[12px] text-white/85 leading-snug mt-2">
          <span className="text-white/40">Pitch: </span>
          <span className="italic">{t.suggested_talk_title}</span>
        </p>
      )}

      {t.recommended_next_step && (
        <p className="text-[12px] text-rose-200/85 mt-2 leading-snug">
          → {t.recommended_next_step}
        </p>
      )}

      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        {primaryCta && (
          <a
            href={primaryCta}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-rose-500/30 text-rose-200 hover:bg-rose-500/15 transition-colors"
          >
            <ExternalLink size={11} />
            Listen
          </a>
        )}
        <div className="ml-auto">
          <FeedbackButton
            sourceTable="visibility_targets"
            sourceId={t.id}
            agentId="nova"
            compact
          />
        </div>
      </div>
    </article>
  )
}
