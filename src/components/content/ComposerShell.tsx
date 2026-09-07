import React from 'react'
import { ArrowLeft } from '@/lib/icons'

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
      <header className="flex min-h-14 flex-shrink-0 items-center gap-2 border-b border-white/[0.08] px-3 py-2 sm:px-5">
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
          {meta ? <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center justify-end gap-1.5">{actions}</div> : null}
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

// Labels are always visible on every tab. They used to appear only on the
// selected one, which left Refine as an unlabelled wand on a rail that
// defaults elsewhere (OBS-029: "Tab-style without labels is divination").
export interface ComposerStage<T extends string> {
  id: string
  label: string
  /** The rail tabs that belong to this stage, in order. */
  tabs: T[]
}

/**
 * The desktop rail: a tab strip over one panel.
 *
 * With `stages` the strip reads as a sequence: Draft, then Strengthen, then
 * Produce. The current stage (from the piece's state) is lit, the others are
 * reachable, and each stage's tabs sit under its label so twenty-six tools
 * never face you at once. Without `stages` it is the flat strip the brief uses.
 */
export function ComposerRail<T extends string>({ tabs, tab, onTab, children, stages, currentStage }: {
  tabs: ComposerTab<T>[]
  tab: T
  onTab: (id: T) => void
  children: React.ReactNode
  stages?: ComposerStage<T>[]
  /** Which stage the piece is at right now, by id. */
  currentStage?: string
}) {
  const byId = new Map(tabs.map(t => [t.id, t]))
  const activeStage = stages?.find(s => s.tabs.includes(tab))?.id
  return (
    <aside className="w-[380px] flex-shrink-0 border-l border-white/[0.08] flex flex-col min-h-0">
      {stages ? (
        <div className="flex flex-shrink-0 items-stretch gap-1 overflow-x-auto border-b border-white/[0.06] px-2 pt-2" data-testid="composer-stages">
          {stages.map((stage, index) => {
            const lit = stage.id === activeStage
            const here = stage.id === currentStage
            return (
              <div key={stage.id} className={`flex min-w-0 flex-col rounded-t-md px-1.5 pb-1 ${lit ? 'bg-white/[0.04]' : ''}`}>
                <button
                  type="button"
                  onClick={() => onTab(stage.tabs[0])}
                  data-testid={`composer-stage-${stage.id}`}
                  aria-current={here ? 'step' : undefined}
                  className={`flex items-center gap-1.5 whitespace-nowrap px-1 pt-1 pb-1.5 text-micro uppercase tracking-[0.14em] ${lit ? 'text-white/85' : 'text-white/40 hover:text-white/70'}`}
                >
                  <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-micro tabular-nums ${here ? 'bg-emerald-400/25 text-emerald-200' : lit ? 'bg-white/15 text-white/80' : 'bg-white/[0.06] text-white/40'}`}>{index + 1}</span>
                  {stage.label}
                </button>
                <div className="flex items-center gap-0.5">
                  {stage.tabs.map(id => {
                    const t = byId.get(id)
                    if (!t) return null
                    return (
                      <button
                        key={t.id} type="button" onClick={() => onTab(t.id)} title={t.label}
                        aria-label={t.label} aria-pressed={tab === t.id}
                        data-testid={`composer-rail-${t.id}`}
                        className={`flex flex-shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-micro transition-colors ${
                          tab === t.id ? 'bg-white/[0.08] text-white/90' : 'text-white/45 hover:text-white/75'
                        }`}
                      >
                        {t.icon}<span>{t.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
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
      )}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">{children}</div>
    </aside>
  )
}
