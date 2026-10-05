import React from 'react'

interface Props {
  /** Fixed, non-scrolling region pinned to the top of the frame. */
  header?: React.ReactNode
  /** Fixed, non-scrolling region pinned to the bottom (e.g. a triage control bar). */
  footer?: React.ReactNode
  /**
   * 'auto' (default): the body scrolls internally, the window never does.
   * 'none': the body does not scroll — it's a fixed stage (e.g. a card deck).
   *   The body becomes a flex column so a single `h-full` child fills it.
   */
  scroll?: 'auto' | 'none'
  /** Apply the standard desktop content gutter to the body. */
  padded?: boolean
  className?: string
  bodyClassName?: string
  /** Test id for the bounded body, so a spec can find the tab's one scroller
   *  (Content's is `content-room-scroll`). */
  bodyTestId?: string
  /**
   * Reserve room for the ⌘I and ⌘/ pills INSIDE the scrolling body, instead of
   * letting the shell shorten the whole frame to clear them.
   *
   * `src/index.css` already says this is the rule: "Surfaces that scroll to the
   * bottom-right add it as padding". The shell was doing the opposite for every
   * scrolling desk tab, taking `--capture-gutter` (72px, plus 24px of its own)
   * off the frame's height. The body then ended 96px above the bottom of the
   * screen and sliced its last row clean through, with 96px of dead paper
   * underneath it and no scrollbar to say there was more. That is what "the
   * Content tab cuts off at the bottom" was. It is the same failure the CSS
   * comment already records against the Visibility rails on 2026-09-23.
   *
   * Only meaningful with scroll='auto'; a fixed stage has nothing to scroll
   * past the pills, so it keeps its clearance from the shell.
   */
  capturePills?: boolean
  children: React.ReactNode
}

/**
 * AppFrame — the no-scroll "app shell" for a tab. Owns the full viewport height
 * (100dvh) and partitions it into a fixed header, a contained body, and an
 * optional fixed footer. The *frame* never scrolls; only the body does, and only
 * when scroll='auto'. This is what turns a long scrolling web page into an app
 * surface: chrome stays put, content lives in a bounded region.
 *
 * Mobile already has this shape via MobileShell; AppFrame is the desktop/shared
 * counterpart. For a fixed parent it inherits height via h-full; standalone it
 * falls back to h-[100dvh].
 */
export function AppFrame({
  header,
  footer,
  scroll = 'auto',
  padded = false,
  className = '',
  bodyClassName = '',
  bodyTestId,
  capturePills = false,
  children,
}: Props) {
  const body =
    scroll === 'none'
      // No-scroll stage: flex column so h-full children resolve to a real height.
      ? 'flex-1 min-h-0 overflow-hidden flex flex-col'
      : 'flex-1 min-h-0 overflow-y-auto'
  const gutter = padded ? 'px-6 py-5' : ''
  // The pill clearance rides with the content, so the scrollport keeps the full
  // height of the frame. `--capture-gutter` is 0px under 900px, so a phone pays
  // nothing for this.
  const pills = capturePills && scroll !== 'none' ? 'pb-[var(--capture-gutter)]' : ''
  return (
    <div className={`flex flex-col h-full max-h-[100dvh] min-h-0 ${className}`}>
      {header && <div className="flex-shrink-0">{header}</div>}
      <div data-testid={bodyTestId} className={`${body} ${gutter} ${pills} ${bodyClassName}`}>{children}</div>
      {footer && <div className="flex-shrink-0">{footer}</div>}
    </div>
  )
}
