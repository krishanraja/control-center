import React from 'react'
import { podColor, podLabel } from './tokens'

interface Props {
  pod: string
  size?: 'sm' | 'md'
  className?: string
}

/** Pod identifier chip — revenue/growth/ops color-coded. */
export function PodChip({ pod, size = 'sm', className = '' }: Props) {
  const color = podColor(pod)
  const sizeCls = size === 'sm'
    ? 'text-micro px-2 py-0.5'
    : 'text-label px-2.5 py-1'
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold uppercase tracking-wider ${sizeCls} ${color.bg} ${color.text} ${className}`}
    >
      {podLabel(pod)}
    </span>
  )
}
