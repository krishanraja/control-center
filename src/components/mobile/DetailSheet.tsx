import React, { useEffect, useRef, useState } from 'react'
import { X, ExternalLink } from 'lucide-react'
import { AgentAvatar } from '../shared/AgentAvatar'
import { StatusPill } from '../shared/StatusPill'
import { Pressable } from '../shared/Pressable'
import { useReducedMotion, useDeviceClass } from '../shared/motion'
import { useHaptics } from '../../hooks/useHaptics'

export interface SheetAction {
  label: string
  variant?: 'primary' | 'secondary' | 'danger'
  /**
   * The action. May return a Promise — when it does, the button choreographs
   * the in-flight rail and the earned success/error state (see Pressable).
   */
  onClick: () => void | Promise<unknown>
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
  const reduced = useReducedMotion()
  const device = useDeviceClass()
  const h = useHaptics()

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

  // Keyboard-first on the desk: Esc dismisses, Enter commits the primary action.
  // We only auto-fire the affirmative primary (never a 'danger' action), so a
  // stray Enter can't drop/kill/reject anything — that always stays a deliberate
  // click. Reuses the exact action handlers the buttons use.
  useEffect(() => {
    if (!mounted || !visible) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key === 'Enter') {
        const primary = actions.find(a => a.variant === 'primary')
        if (primary) { e.preventDefault(); primary.onClick() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted, visible, actions, onClose])

  if (!mounted) return null

  const onTouchStart = (e: React.TouchEvent) => { startY.current = e.touches[0].clientY }
  const onTouchMove  = (e: React.TouchEvent) => {
    if (startY.current == null) return
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0) setDragY(dy)
  }
  const onTouchEnd = () => {
    if (dragY > 120) { h.soft(); onClose() }
    setDragY(0)
    startY.current = null
  }

  const translate = visible ? dragY : 1000

  return (
    <div
      className="fixed top-0 left-0 w-[calc(100vw/var(--z,1))] h-[calc(100dvh/var(--z,1))] z-[70] flex items-end justify-center"
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
        className="relative w-full max-w-xl bg-base border-t border-white/[0.08] rounded-t-[28px] shadow-2xl shadow-black/60 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]"
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
        <div className={`px-5 pb-4 flex items-start gap-3 border-b border-white/[0.06] ${reduced ? '' : 'animate-rise stagger-1'}`}>
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
          <div className={`px-5 py-4 max-h-[48vh] overflow-y-auto scrollbar-hide ${reduced ? '' : 'animate-rise stagger-2'}`}>
            <p className="text-[15px] text-white/70 leading-relaxed whitespace-pre-wrap">{body}</p>
          </div>
        )}

        {/* Actions */}
        <div className={`px-5 pt-3 pb-2 space-y-2.5 ${reduced ? '' : 'animate-rise stagger-3'}`}>
          {actions.map((a, i) => (
            <Pressable
              key={i}
              variant={a.variant ?? 'secondary'}
              onPress={a.onClick}
            >
              {a.label}
            </Pressable>
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
          {device === 'desktop' && actions.some(a => a.variant === 'primary') && (
            <p className="pt-1 text-center text-[11px] text-white/35">
              <kbd className="rounded border border-white/15 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/55">Enter</kbd>
              {' '}to confirm{' · '}
              <kbd className="rounded border border-white/15 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/55">Esc</kbd>
              {' '}to close
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
