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
  children,
}: Props) {
  const body =
    scroll === 'none'
      // No-scroll stage: flex column so h-full children resolve to a real height.
      ? 'flex-1 min-h-0 overflow-hidden flex flex-col'
      : 'flex-1 min-h-0 overflow-y-auto'
  const gutter = padded ? 'px-6 py-5' : ''
  return (
    <div className={`flex flex-col h-full max-h-[100dvh] min-h-0 ${className}`}>
      {header && <div className="flex-shrink-0">{header}</div>}
      <div className={`${body} ${gutter} ${bodyClassName}`}>{children}</div>
      {footer && <div className="flex-shrink-0">{footer}</div>}
    </div>
  )
}
