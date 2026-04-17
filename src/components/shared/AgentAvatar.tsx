import React from 'react'
import { useAgentsContext } from '../../contexts/AgentsContext'
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
  agent?: string
  name?: string
  pod?: string
  size?: Size
  statusDot?: string
  className?: string
  title?: string
}

export function AgentAvatar({
  agent, name, pod, size = 'md', statusDot, className = '', title,
}: Props) {
  const { resolveAgent } = useAgentsContext()
  const record = agent ? resolveAgent(agent) : undefined

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
