import {
  BUILT_WITH_AI_WORDMARK_SRC,
  MINDMAKE_WORDMARK_SRC,
  MONEY_OF_AI_WORDMARK_SRC,
} from '../../assets/videoBrandAssets'
import { VIDEO_SERIES_LABEL, type VideoStudioSeries } from '../../lib/videoStudio'

type Placement = 'header' | 'card' | 'preview'

type SeriesAsset = {
  src: string
  viewBox: string
  sourceLetterBox: string
  size: Record<Placement, string>
}

const SERIES_ASSET: Record<VideoStudioSeries, SeriesAsset> = {
  // These viewBoxes remove only transparent canvas around the lettering in
  // the official 1200 by 630 assets. They align with complete source-pixel
  // cells, so the edge antialiasing remains intact without carrying the large
  // transparent logo canvas. At the compact 17.25px render, the fractional
  // guard keeps high-contrast letter pixels safely above the 16px phone floor
  // for both series rather than rounding to 15.99px on a device boundary.
  money_of_ai: {
    src: MONEY_OF_AI_WORDMARK_SRC,
    viewBox: '254 438 689 53',
    sourceLetterBox: '254 438 689 53',
    size: {
      header: 'h-[17.25px] w-[224.25px] sm:h-[18px] sm:w-[234px]',
      card: 'h-[17.25px] w-[224.25px]',
      preview: 'h-[17.25px] w-[224.25px]',
    },
  },
  built_with_ai: {
    src: BUILT_WITH_AI_WORDMARK_SRC,
    viewBox: '287 452 626 57',
    sourceLetterBox: '287 452 626 57',
    size: {
      header: 'h-[17.25px] w-[189.5px] sm:h-[18px] sm:w-[198px]',
      card: 'h-[17.25px] w-[189.5px]',
      preview: 'h-[17.25px] w-[189.5px]',
    },
  },
}

const MINDMAKE_SIZE: Record<Placement, string> = {
  header: 'w-[60px] sm:w-[72px]',
  card: 'w-[60px]',
  preview: 'w-[60px]',
}

// The card is the one placement that stacks. A phone card's content box is
// about 229 CSS px at 390 wide under the 1.2x zoom; the horizontal rail is
// 259 to 294. It cannot fit, and the old answer, bleeding it out of the card
// with a negative margin, clipped the Mindmake mark. The design contract says
// allocate a larger identity beat rather than shrink the lettering, so the
// card gives the wordmark its own row and keeps every letter at the floor.
const PLATE_SIZE: Record<Placement, string> = {
  header: 'h-9 flex-row items-center gap-[3px] px-[3px] sm:h-10 sm:gap-1.5 sm:px-1.5',
  card: 'h-auto flex-col items-start gap-1.5 px-2.5 py-2',
  preview: 'h-9 flex-row items-center gap-[3px] px-[3px]',
}

/**
 * Responsive, official-artwork identity lockup. Mindmake stays a compact
 * anchor; the series wordmark gets its own horizontal measure instead of both
 * marks being made illegible inside one small square.
 *
 * The plate shares its colour, border and shadow with SeriesIdentity in
 * components/shared/MindmakeIdentity.tsx, so the two publications read as one
 * brand whether the card is a lane header or a video review. Folding the two
 * components into one is recorded as a follow-up in the parity ledger. Never
 * offset this plate outside its container: the deck card clips overflow.
 */
export function VideoBrandLockup({
  series,
  placement,
  className = '',
}: {
  series: VideoStudioSeries
  placement: Placement
  className?: string
}) {
  const asset = SERIES_ASSET[series]
  const label = VIDEO_SERIES_LABEL[series]

  return (
    <div
      data-testid={`video-brand-lockup-${placement}`}
      data-placement={placement}
      data-official-asset-source="krishanraja/mindmake"
      aria-label={`${label} by Mindmake`}
      className={`pointer-events-none inline-flex w-fit rounded-xl border border-white/[0.12] bg-[#0a100d] shadow-e1 ${PLATE_SIZE[placement]} ${className}`}
    >
      <span className={`grid flex-none place-items-center ${MINDMAKE_SIZE[placement]}`} aria-hidden="true">
        <img src={MINDMAKE_WORDMARK_SRC} alt="" className="h-auto w-full" draggable={false} />
      </span>
      <span className={placement === 'card' ? 'h-px w-full flex-none bg-white/[0.12]' : 'h-5 w-px flex-none bg-white/[0.12]'} aria-hidden="true" />
      <svg
        data-testid={`video-series-wordmark-${series}`}
        data-min-letter-height="16"
        data-source-letter-box={asset.sourceLetterBox}
        viewBox={asset.viewBox}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
        className={`pointer-events-none flex-none overflow-hidden ${asset.size[placement]}`}
      >
        <image href={asset.src} x="0" y="0" width="1200" height="630" />
      </svg>
    </div>
  )
}
