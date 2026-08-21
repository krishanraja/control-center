import React from 'react'
import { ExternalLink } from '@/lib/icons'
import { AgentAvatar } from './shared/AgentAvatar'
import { ageDays, ageTone, humanAge, AGE_TONE_CLASS } from '../lib/ageHelpers'
import type { TaskRow } from '../hooks/useRealtimeTasks'

interface Props {
  task: TaskRow
  onOpen?: (taskId: string) => void
  showLink?: boolean
  meta?: React.ReactNode  // pipeline-specific chips (ICP, tier, fit_score, etc.)
}

/**
 * Compact in-lane card. Used for the non-featured slots in every pipeline
 * lane — title · agent avatar · pipeline-specific meta · age · link icon.
 *
 * One click opens the task in Today (Krish's existing approve/reject surface
 * uses InlineActions there). Approve/Reject buttons aren't rendered here on
 * purpose: the featured Content card surfaces them inline; the compact rows
 * stay scannable.
 */
export function PipelineCard({ task: t, onOpen, showLink = true, meta }: Props) {
  const days = ageDays(t.updated_at)
  const tone = AGE_TONE_CLASS[ageTone(days)]
  const link = t.link_primary

  return (
    <button
      type="button"
      onClick={() => onOpen?.(t.id)}
      className="w-full text-left px-3 py-2 hover:bg-white/[0.03] transition-colors flex items-center gap-2.5 min-w-0"
    >
      <AgentAvatar agent={t.agent || 'system'} size="xs" />
      <div className="flex-1 min-w-0">
        <p className="text-label text-white/85 leading-snug truncate">{t.title}</p>
        {meta && (
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">{meta}</div>
        )}
      </div>
      <span className={`text-micro tabular-nums flex-shrink-0 ${tone}`}>
        {humanAge(t.updated_at)}
      </span>
      {showLink && link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 text-white/30 hover:text-white/70 transition-colors"
          aria-label="Open source"
        >
          <ExternalLink size={11} />
        </a>
      )}
    </button>
  )
}
