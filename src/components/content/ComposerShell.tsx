import React from 'react'
import { ArrowLeft } from 'lucide-react'

// The composer's chrome, shared by the two things it opens.
//
// CONTENT-ENGINE-V2-SPEC.md:75 said the composer would open ideas AND briefs
// with the refine rail untouched. What shipped instead was a second
// full-screen editor that happened to look similar, kept its own four-item
// chip list, and drifted from there: different tab strip, different header,
// different selection handling, different everything except the general shape.
//
// So the shape is a component now. Both surfaces mount this, which is what
// makes them the same product rather than two products that resemble each
// other. Each still owns its own body, because a brief and a piece genuinely
// are edited differently: a brief is rich text with citations and versions, a
// piece is markdown with materials and channel cuts. What they share is the
// frame, the rail, and the palette inside it.

export interface ComposerShellProps {
  onClose: () => void
  /** Small uppercase eyebrow above the title (lane, or week). */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  /** The status line under the title: state, word count, saved-ness. */
  meta?: React.ReactNode
  /** Header controls, right-aligned. */
  actions?: React.ReactNode
  /** Full-width notice under the header (errors, closed-for-editing). */
  banner?: React.ReactNode
  children: React.ReactNode
}

export function ComposerShell({ onClose, eyebrow, title, meta, actions, banner, children }: ComposerShellProps) {
  return (
    <div className="fixed top-0 left-0 w-[calc(100vw/var(--z,1))] h-[calc(100dvh/var(--z,1))] z-[90] bg-base text-white flex flex-col">
      <header className="flex items-center gap-2 px-3 sm:px-5 h-14 border-b border-white/[0.08] flex-shrink-0">
        <button
          type="button" onClick={onClose} aria-label="Back to pipeline"
          className="flex items-center justify-center w-9 h-9 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <div className="text-micro uppercase tracking-[0.14em] text-sky-200/80">{eyebrow}</div>
          ) : null}
          {title}
          {meta ? <div className="flex items-center gap-1.5 mt-0.5">{meta}</div> : null}
        </div>
        {actions}
      </header>
      {banner}
      {children}
    </div>
  )
}

/** One dot separator, so the status lines read the same on both surfaces. */
export function MetaDot() {
  return <span className="text-micro text-white/30">·</span>
}

export interface ComposerTab<T extends string> {
  id: T
  label: string
  icon: React.ReactNode
}

/**
 * The desktop rail: a tab strip over one panel.
 *
 * Labels are always visible. They used to appear only on the selected tab,
 * which left Refine as an unlabelled wand on a rail that defaults elsewhere,
 * and is logged in docs/plans/content-tab-rebuild/OBSERVATIONS.md as OBS-029:
 * "Tab-style without labels is divination." That is a large part of why the
 * palette felt missing even on the surface that had it.
 */
export function ComposerRail<T extends string>({ tabs, tab, onTab, children }: {
  tabs: ComposerTab<T>[]
  tab: T
  onTab: (id: T) => void
  children: React.ReactNode
}) {
  return (
    <aside className="w-[380px] flex-shrink-0 border-l border-white/[0.08] flex flex-col min-h-0">
      <div className="flex items-center gap-0.5 px-2 pt-2 border-b border-white/[0.06] flex-shrink-0 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id} type="button" onClick={() => onTab(t.id)} title={t.label}
            aria-label={t.label} aria-pressed={tab === t.id}
            data-testid={`composer-rail-${t.id}`}
            className={`flex flex-shrink-0 items-center gap-1.5 px-2.5 py-2 text-micro rounded-t-md transition-colors ${
              tab === t.id ? 'bg-white/[0.06] text-white/90' : 'text-white/45 hover:text-white/75'
            }`}
          >
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">{children}</div>
    </aside>
  )
}
