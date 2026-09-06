import type { CSSProperties } from 'react'
import { cn } from '../../lib/utils'
import { publicSeriesIdentity, type PublicSeriesKey } from '../../lib/publicSeries'

// One extra source pixel prevents Chromium's 1.2 mobile zoom rounding the
// rendered 36px contract down to 35.99px on 375px viewports.
export const MINDMAKE_COMPACT_MIN_SIZE = 37
export const MINDMAKE_COMPACT_MIN_GLYPH = 24
export const MINDMAKE_WORDMARK_MOBILE_WIDTH = 120
export const MINDMAKE_WORDMARK_DESKTOP_WIDTH = 132
export const SERIES_WORDMARK_MAX_WIDTH = 320
export const SERIES_WORDMARK_MIN_LETTER_HEIGHT = 16
// This is deliberately based on the widest official asset (The Money of AI),
// not on the shorter Built With AI lockup. At 16.1 design pixels the complete
// Money lettering fits beside the Mindmake anchor at a 375px viewport and is
// painted above 19 physical pixels inside the app's 1.2x mobile scale. The
// fractional guard keeps Chromium layout rounding from landing just under the
// 16px desktop contract.
export const SERIES_WORDMARK_LETTER_HEIGHT = 16.1

type MindmakeIdentityProps = {
  variant?: 'compact' | 'expanded'
  /** Compatibility with the retired Logomark API. Values below the visible minimum are clamped. */
  size?: number
  className?: string
  testId?: string
}

function safeSize(size: number | undefined): number {
  return Number.isFinite(size) ? Math.max(MINDMAKE_COMPACT_MIN_SIZE, Math.round(size as number)) : MINDMAKE_COMPACT_MIN_SIZE
}

function MarkTile({ size, labelled, testId }: { size?: number; labelled: boolean; testId?: string }) {
  const tileSize = safeSize(size)
  const glyphSize = Math.max(MINDMAKE_COMPACT_MIN_GLYPH, Math.round(tileSize * 0.72))
  return (
    <span
      className="inline-flex flex-none items-center justify-center rounded-[26%] bg-[#0a100d] ring-1 ring-white/[0.12] shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
      style={{ width: tileSize, height: tileSize }}
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? 'Mindmake' : undefined}
      aria-hidden={labelled ? undefined : true}
      data-testid={testId}
      data-mindmake-compact="true"
    >
      <img
        src="/mindmake-mark.svg"
        alt=""
        aria-hidden
        draggable={false}
        className="select-none object-contain"
        style={{ width: glyphSize, height: glyphSize }}
        data-mindmake-mark-glyph="true"
      />
    </span>
  )
}

const wordmarkMask: CSSProperties = {
  background: 'linear-gradient(90deg, rgb(var(--ink)) 0%, rgb(var(--accent)) 100%)',
  WebkitMaskImage: "url('/mindmake-wordmark.svg')",
  maskImage: "url('/mindmake-wordmark.svg')",
  WebkitMaskPosition: 'center',
  maskPosition: 'center',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  WebkitMaskSize: '100% 100%',
  maskSize: '100% 100%',
  aspectRatio: '648.043 / 109.156',
}

/**
 * One responsive Mindmake identity for app chrome.
 *
 * The expanded wordmark uses the official SVG as an alpha mask. Unlike an
 * external <img>, this lets the host page's ink and mint variables paint the
 * lettering correctly in both themes without duplicating the official paths.
 */
export function MindmakeIdentity({ variant = 'compact', size, className, testId }: MindmakeIdentityProps) {
  if (variant === 'compact') {
    return <MarkTile size={size} labelled testId={testId} />
  }

  return (
    <span
      className={cn('inline-flex min-w-0 items-center gap-3', className)}
      role="img"
      aria-label="Mindmake"
      data-testid={testId}
      data-mindmake-expanded="true"
    >
      <MarkTile size={size} labelled={false} />
      <span
        aria-hidden
        className="block h-auto w-[120px] flex-none lg:w-[132px]"
        style={wordmarkMask}
        data-mindmake-wordmark="true"
      />
    </span>
  )
}

type SeriesIdentityProps = {
  series: PublicSeriesKey
  className?: string
  testId?: string
}

/**
 * A dedicated horizontal plate for the official series lettering.
 *
 * The source PNGs include a large symbol above the wordmark. Showing the full
 * canvas at card size made the actual words microscopic, so this view clips to
 * the original letter-bearing rows. It never redraws, types or stretches the
 * artwork, and it never stacks two miniature identities into a square.
 */
export function SeriesIdentity({ series, className, testId }: SeriesIdentityProps) {
  const identity = publicSeriesIdentity(series)
  const sourceLetterHeight = identity.letterBottomY - identity.letterTopY + 1
  const sourceLetterWidth = identity.letterRightX - identity.letterLeftX + 1
  const renderedLetterHeight = SERIES_WORDMARK_LETTER_HEIGHT
  const sourceScale = renderedLetterHeight / sourceLetterHeight
  const renderedLetterWidth = sourceLetterWidth * sourceScale

  return (
    <span
      className={cn(
        'inline-flex h-12 w-full max-w-[320px] items-center gap-2 rounded-xl border border-white/[0.12] bg-[#0a100d] px-2 shadow-e1',
        className,
      )}
      role="img"
      aria-label={identity.label}
      data-testid={testId ?? `series-identity-${series}`}
      data-series-identity={series}
      data-series-label={identity.label}
    >
      <MarkTile size={MINDMAKE_COMPACT_MIN_SIZE} labelled={false} />
      <span className="flex min-w-0 flex-1 items-center justify-center" aria-hidden>
        <span
          className="relative block max-w-full overflow-hidden"
          style={{ width: renderedLetterWidth, height: renderedLetterHeight }}
          data-series-wordmark-crop="true"
        >
          <img
            src={identity.assetPath}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute left-0 top-0 block h-auto max-w-none select-none"
            style={{
              width: identity.sourceWidth * sourceScale,
              transform: `translate(${-identity.letterLeftX * sourceScale}px, ${-identity.letterTopY * sourceScale}px)`,
            }}
            data-series-wordmark-image="true"
            data-source-width={identity.sourceWidth}
            data-source-height={identity.sourceHeight}
            data-symbol-end-y={identity.symbolEndY}
            data-letter-top-y={identity.letterTopY}
            data-letter-bottom-y={identity.letterBottomY}
            data-letter-left-x={identity.letterLeftX}
            data-letter-right-x={identity.letterRightX}
          />
        </span>
      </span>
    </span>
  )
}
