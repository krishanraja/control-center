import React, { useEffect } from 'react'
import { X, ExternalLink } from 'lucide-react'
import { AgentAvatar } from '../shared/AgentAvatar'
import { StatusPill } from '../shared/StatusPill'
import { Pressable } from '../shared/Pressable'
import { useReducedMotion, useDeviceClass } from '../shared/motion'
import { BottomSheet } from './BottomSheet'

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
  const reduced = useReducedMotion()
  const device = useDeviceClass()

  // Keyboard-first on the desk: Enter commits the primary action. Escape is
  // BottomSheet's (via Radix) rather than a second listener racing it.
  //
  // Only the affirmative primary auto-fires, never a 'danger' action, so a
  // stray Enter cannot drop, kill or reject anything. That always stays a
  // deliberate click.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Enter') {
        const primary = actions.find(a => a.variant === 'primary')
        if (primary) { e.preventDefault(); primary.onClick() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, actions])

  return (
    <BottomSheet open={open} onClose={onClose} fullHeight={false} ariaLabel={title}>
      <div className="pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
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
    </BottomSheet>
  )
}
