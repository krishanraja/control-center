import {
  BUILT_WITH_AI_WORDMARK_SRC,
  MINDMAKE_WORDMARK_SRC,
  MONEY_OF_AI_WORDMARK_SRC,
} from '../../assets/videoBrandAssets'
import MAKEYOURMINDUP_MARK_SRC from '../../assets/brand/makeyourmindup/makeyourmindup-mark.png'
import { VIDEO_SERIES_LABEL, type VideoStudioSeries } from '../../lib/videoStudio'
import { NO_WORDMARK_FOR } from '../../lib/publicSeries'

type Placement = 'header' | 'card' | 'preview'

type SeriesAsset = {
  src: string
  viewBox: string
  sourceLetterBox: string
  size: Record<Placement, string>
}

// Only the retired pair has official series artwork. A live subchannel has
// none by design (lib/publicSeries.ts NO_WORDMARK_FOR): the brand book sets
// channel names as type, so its plate is the makeyourmindup mark with the name
// in mono, never another publication's artwork.
const SERIES_ASSET: Partial<Record<VideoStudioSeries, SeriesAsset>> = {
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

// A live subchannel is branded makeyourmindup (Krish, 2026-09-26: "Make your
// mind up, Mark, plus the channel name"): the publication's mark, the
// channel's brand-book colour as a dot, and its name set as type, exactly as
// the Studio draws it (content-engine config/studio.json,
// makeyourmindup-video-v1).
const CHANNEL_COLOR: Partial<Record<VideoStudioSeries, string>> = {
  follow_the_money: '#FFD84D',
  mind_the_gap: '#FF6A4D',
  under_the_hood: '#B7A6FF',
}

const MARK_SIZE: Record<Placement, string> = {
  header: 'w-[26px] sm:w-[28px]',
  card: 'w-[26px]',
  preview: 'w-[26px]',
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
  const channelColor = CHANNEL_COLOR[series]

  if (channelColor) return (
    <div
      data-testid={`video-brand-lockup-${placement}`}
      data-placement={placement}
      data-official-asset-source="krishanraja/control-center"
      aria-label={`${label} by makeyourmindup`}
      className={`pointer-events-none inline-flex w-fit flex-row items-center gap-2 rounded-xl border border-white/[0.12] bg-[#0a100d] px-2.5 shadow-e1 ${placement === 'card' ? 'h-auto py-2' : 'h-9 sm:h-10'} ${className}`}
    >
      <span className={`grid flex-none place-items-center ${MARK_SIZE[placement]}`} aria-hidden="true">
        <img src={MAKEYOURMINDUP_MARK_SRC} alt="" className="h-auto w-full" draggable={false} />
      </span>
      <span className="h-2 w-2 flex-none rounded-full" style={{ background: channelColor }} aria-hidden="true" />
      <span
        data-testid={`video-series-label-${series}`}
        className="flex-none font-mono text-label font-semibold lowercase leading-none text-[#f4f1e6]"
      >{label}</span>
    </div>
  )

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
      {asset ? (<svg
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
      </svg>) : (
        <span
          data-testid={`video-series-label-${series}`}
          title={NO_WORDMARK_FOR[series] || undefined}
          className="flex-none font-mono text-label font-semibold leading-none text-[#f4f1e6]"
        >{label}</span>
      )}
    </div>
  )
}
