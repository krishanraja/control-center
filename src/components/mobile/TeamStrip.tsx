import React from 'react'
import { AgentAvatar } from '../shared/AgentAvatar'
import type { Agent } from '../../types'
import { statusStyle } from '../shared/tokens'
import { useHaptics } from '../../hooks/useHaptics'

interface Props {
  agents: Agent[]
  onSelect?: (agent: Agent) => void
  title?: string
}

/** Horizontal scroll of agent avatars with status dots — team pulse at a glance. */
export function TeamStrip({ agents, onSelect, title = 'Team' }: Props) {
  const h = useHaptics()
  if (!agents.length) return null
  return (
    <div className="space-y-2">
      <p className="text-micro font-bold uppercase tracking-[0.14em] text-white/40 px-1">
        {title} · {agents.length}
      </p>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-5 px-5 pb-1">
        {agents.map(a => {
          const s = statusStyle(a.status)
          return (
            <button
              key={a.id}
              onClick={() => { h.select(); onSelect?.(a) }}
              className="flex-shrink-0 flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
              style={{ minWidth: 60 }}
            >
              <AgentAvatar agent={a.id} size="md" statusDot={s.dot} />
              <span className="text-micro text-white/65 font-medium truncate max-w-[60px]">
                {a.humanName}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
