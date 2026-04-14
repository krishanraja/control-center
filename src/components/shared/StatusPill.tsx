import React from 'react'
import { statusStyle } from './tokens'

interface Props {
  status: string
  /** Override the visible label (defaults to a human label from tokens). */
  label?: string
  /** Size variant. */
  size?: 'sm' | 'md'
  /** Render a leading dot. */
  dot?: boolean
  className?: string
}

/**
 * Semantic status pill. Replaces grey uppercase "BLOCKED" text with a
 * colored chip sized and coloured by the status vocabulary.
 */
export function StatusPill({
  status, label, size = 'sm', dot = true, className = '',
}: Props) {
  const s = statusStyle(status)
  const sizeCls = size === 'sm'
    ? 'text-[11px] px-2 py-0.5 gap-1.5'
    : 'text-[13px] px-2.5 py-1 gap-2'
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${sizeCls} ${s.bg} ${s.text} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />}
      {label ?? s.label}
    </span>
  )
}
