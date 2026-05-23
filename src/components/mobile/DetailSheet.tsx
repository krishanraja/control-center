import React, { useEffect, useRef, useState } from 'react'
import { X, ExternalLink } from 'lucide-react'
import { AgentAvatar } from '../shared/AgentAvatar'
import { StatusPill } from '../shared/StatusPill'

export interface SheetAction {
  label: string
  variant?: 'primary' | 'secondary' | 'danger'
  onClick: () => void
}

interface Props {
  open: boolean
  onClose: () => void
  eyebrow?: string
  title: string
  body?: string
  agent?: string
  status?: string
  meta?: string
  docUrl?: string
  actions?: SheetAction[]
}

/**
 * Bottom sheet modal. Spring-in from the bottom, drag-down to dismiss.
 * Renders an agent avatar, title, body, and a stack of primary/secondary action
 * buttons. Tap the backdrop or swipe down to close.
 */
export function DetailSheet({
  open, onClose, eyebrow, title, body, agent, status, meta, docUrl, actions = [],
}: Props) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const [dragY, setDragY] = useState(0)
  const startY = useRef<number | null>(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      // Allow the element to mount then transition in on next frame.
      requestAnimationFrame(() => setVisible(true))
    } else if (mounted) {
      setVisible(false)
      const t = setTimeout(() => setMounted(false), 220)
      return () => clearTimeout(t)
    }
  }, [open, mounted])

  // Prevent body scroll while open
  useEffect(() => {
    if (!mounted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [mounted])

  if (!mounted) return null

  const onTouchStart = (e: React.TouchEvent) => { startY.current = e.touches[0].clientY }
  const onTouchMove  = (e: React.TouchEvent) => {
    if (startY.current == null) return
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0) setDragY(dy)
  }
  const onTouchEnd = () => {
    if (dragY > 120) onClose()
    setDragY(0)
    startY.current = null
  }

  const translate = visible ? dragY : 1000

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <button
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        style={{ opacity: visible ? 1 : 0 }}
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-xl bg-[#0f0f12] border-t border-white/[0.08] rounded-t-[28px] shadow-2xl shadow-black/60 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]"
        style={{
          transform: `translateY(${translate}px)`,
          transition: startY.current == null ? 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle */}
        <div className="pt-3 pb-2 flex items-center justify-center">
          <span className="block w-10 h-1 rounded-full bg-white/15" />
        </div>

        {/* Header */}
        <div className="px-5 pb-4 flex items-start gap-3 border-b border-white/[0.06]">
          {agent && <AgentAvatar agent={agent} size="lg" />}
          <div className="flex-1 min-w-0">
            {eyebrow && (
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/45">
                {eyebrow}
              </p>
            )}
            <h2 className="text-[19px] font-bold text-white leading-snug mt-0.5">
              {title}
            </h2>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {status && <StatusPill status={status} />}
              {meta && <span className="text-[12px] text-white/40">{meta}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 w-11 h-11 rounded-full bg-white/5 flex items-center justify-center active:bg-white/10"
          >
            <X className="w-4 h-4 text-white/70" strokeWidth={2.2} />
          </button>
        </div>

        {/* Body */}
        {body && (
          <div className="px-5 py-4 max-h-[48vh] overflow-y-auto scrollbar-hide">
            <p className="text-[15px] text-white/70 leading-relaxed whitespace-pre-wrap">{body}</p>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 pt-3 pb-2 space-y-2.5">
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={a.onClick}
              className={`w-full rounded-2xl py-3.5 text-[15px] font-semibold transition-colors ${
                a.variant === 'primary'
                  ? 'bg-violet-500 text-white active:bg-violet-400'
                  : a.variant === 'danger'
                  ? 'bg-red-500/15 text-red-300 active:bg-red-500/25'
                  : 'bg-white/[0.07] text-white active:bg-white/[0.12]'
              }`}
            >
              {a.label}
            </button>
          ))}
          {docUrl && (
            <a
              href={docUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full rounded-2xl py-3.5 text-[14px] font-medium bg-white/[0.04] text-white/70 active:bg-white/[0.08] flex items-center justify-center gap-2"
            >
              Open in Docs
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
