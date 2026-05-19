import React from 'react'
import { ChevronRight } from 'lucide-react'
import { AgentAvatar } from '../shared/AgentAvatar'
import { podColor } from '../shared/tokens'
import { useHaptics } from '../../hooks/useHaptics'
import { humanAge } from '../../lib/ageHelpers'

export interface BlockerItem {
  id: string
  title: string
  description?: string
  agent?: string
  urgency?: 'high' | 'medium' | 'low' | string
  createdAt?: string
  action?: { label: string; kind?: 'approve' | 'review' | 'feedback' | 'default' }
  actionUrl?: string
}

interface Props {
  item: BlockerItem
  onOpen?: (item: BlockerItem) => void
  pod?: string
}

const URGENCY_DOT: Record<string, string> = {
  high:   'bg-status-blocked',
  medium: 'bg-status-needsYou',
  low:    'bg-pod-ops',
}

function actionLabel(item: BlockerItem) {
  if (item.action?.label) return item.action.label
  const k = item.action?.kind
  if (k === 'approve')  return 'Approve'
  if (k === 'review')   return 'Review brief'
  if (k === 'feedback') return 'Send feedback'
  return 'Open'
}

/**
 * A single "blocked on you" row, designed for the Home stack.
 * Left: AgentAvatar with pod color. Middle: specific decision copy + timestamp.
 * Right: primary action button.
 * Whole card is tappable; primary button fires its own onOpen (same callback).
 */
export function BlockerCard({ item, onOpen, pod }: Props) {
  const h = useHaptics()
  const color = podColor(pod)
  const age = humanAge(item.createdAt)

  return (
    <button
      onClick={() => { h.select(); onOpen?.(item) }}
      className={`group w-full text-left rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-4 active:bg-white/[0.07] active:scale-[0.995] transition-all flex items-start gap-3.5`}
      style={{ minHeight: 88 }}
    >
      <AgentAvatar
        agent={item.agent}
        size="md"
        statusDot={URGENCY_DOT[item.urgency ?? 'medium'] ?? 'bg-white/30'}
      />

      <div className="flex-1 min-w-0">
        <p className="text-[16px] font-semibold text-white leading-snug line-clamp-2">
          {item.title}
        </p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {item.agent && (
            <span className={`text-[12px] font-medium ${color.text}`}>{item.agent}</span>
          )}
          {age && (
            <>
              {item.agent && <span className="text-white/20 text-[12px]">·</span>}
              <span className="text-[12px] text-white/45">waiting {age}</span>
            </>
          )}
        </div>
      </div>

      <span className="flex-shrink-0 self-center flex items-center gap-1.5 rounded-full bg-white/10 group-active:bg-white/20 px-3.5 py-2 text-[13px] font-semibold text-white whitespace-nowrap">
        {actionLabel(item)}
        <ChevronRight className="w-3.5 h-3.5 opacity-60" strokeWidth={2.5} />
      </span>
    </button>
  )
}
