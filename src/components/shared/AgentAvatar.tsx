import React from 'react'
import { AGENTS } from '../../services/agentData'
import { podColor, initialsOf } from './tokens'

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZE_MAP: Record<Size, { box: string; text: string; dot: string; ring: string }> = {
  xs: { box: 'w-6 h-6',    text: 'text-[10px]', dot: 'w-1.5 h-1.5', ring: 'ring-1' },
  sm: { box: 'w-8 h-8',    text: 'text-[12px]', dot: 'w-2 h-2',     ring: 'ring-1' },
  md: { box: 'w-10 h-10',  text: 'text-[14px]', dot: 'w-2.5 h-2.5', ring: 'ring-2' },
  lg: { box: 'w-14 h-14',  text: 'text-[18px]', dot: 'w-3 h-3',     ring: 'ring-2' },
  xl: { box: 'w-20 h-20',  text: 'text-[24px]', dot: 'w-3.5 h-3.5', ring: 'ring-2' },
}

interface Props {
  /** Agent id, name, or human name. Resolves against AGENTS. Falls back to name-based initial if no match. */
  agent?: string
  /** Override the display name (used when no agent record exists). */
  name?: string
  /** Override pod for color (used when no agent record exists). */
  pod?: string
  size?: Size
  /** Render a small status dot on the bottom-right corner. */
  statusDot?: string
  /** Extra className on the wrapper. */
  className?: string
  title?: string
}

export function AgentAvatar({
  agent, name, pod, size = 'md', statusDot, className = '', title,
}: Props) {
  // Resolve agent record if an identifier was passed
  const record = agent
    ? AGENTS.find(a =>
        a.id === agent ||
        a.name.toLowerCase() === agent.toLowerCase() ||
        a.humanName.toLowerCase() === agent.toLowerCase()
      )
    : undefined

  const displayName = record?.humanName ?? record?.name ?? name ?? agent ?? '?'
  const resolvedPod = record?.pod ?? pod
  const color = podColor(resolvedPod)
  const sz = SIZE_MAP[size]

  return (
    <span
      title={title ?? displayName}
      className={`relative inline-flex items-center justify-center rounded-full font-semibold select-none ${sz.box} ${sz.text} ${color.bg} ${color.text} ${sz.ring} ring-inset ${color.ring} ${className}`}
    >
      {initialsOf(displayName)}
      {statusDot && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-[#0a0a0b] ${sz.dot} ${statusDot}`}
        />
      )}
    </span>
  )
}
