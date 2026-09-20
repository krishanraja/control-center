import { resolveFormat, formatLabel } from './formats'

/**
 * Public publication identity: which wordmark goes on a piece.
 *
 * WHAT THIS IS, and what it stopped pretending to be on 2026-09-20. It is an
 * ASSET REGISTRY: two PNG wordmarks, vendored byte for byte and SHA pinned. It
 * is not the format taxonomy. `venture_formats` is, and `src/lib/formats.ts` is
 * this repo's one reader of it.
 *
 * BOTH WORDMARKS ARE RETIRED. They say "The Money of AI" and "Built With AI",
 * the names retired on 2026-09-17, and they are kept because the pieces already
 * published under them cannot be un-published. NO LIVE FORMAT POINTS AT ONE.
 * `paid` resolves to split.the.bill and `built` to lift.the.lid through
 * format_aliases, but the artwork does not follow a rename: putting a wordmark
 * reading "The Money of AI" on a split.the.bill piece mislabels it, which is
 * worse than shipping it with the publication mark and no format wordmark.
 *
 * WHAT IS OWED, and it is design work rather than a rename, which is why this
 * file declares it instead of guessing: three wordmarks, one per subchannel.
 * Until they exist, `NO_WORDMARK_FOR` below is what a surface reads, and
 * scripts/check-content-taxonomy.mts holds this file to saying so out loud.
 *
 * THE THIRD CONSEQUENCE, not taken here: `PublicSeriesKey` has leaked out of
 * this registry into contentRouting.ts and editorialOpportunities.ts, where two
 * binary ternaries make a third format structurally unrepresentable, and into
 * the Content tab, which has one room per key. Widening the key means a third
 * room and three wordmarks, which is a product change rather than a rename, so
 * it waits for a decision instead of arriving inside one.
 *
 * Assets are vendored byte-for-byte from the pinned GitHub revision below.
 * SHA-256 is checked by scripts/check-mindmake-design.mts.
 */
export type PublicSeriesKey = 'built' | 'paid'

/** Every live subchannel, and why it has no wordmark. Read by any surface that
 *  would otherwise render a retired one, and by the taxonomy guard. */
export const NO_WORDMARK_FOR: Readonly<Record<string, string>> = Object.freeze({
  split_the_bill: 'No split.the.bill wordmark exists. The nearest asset reads "The Money of AI", the name this format carried until 2026-09-17, so it would mislabel the piece.',
  mind_the_gap:   'No mind.the.gap wordmark exists, and no retired asset is even close: the format has no predecessor to borrow from.',
  lift_the_lid:   'No lift.the.lid wordmark exists. The nearest asset reads "Built With AI", the name this format carried until 2026-09-17, so it would mislabel the piece.',
})

export const PUBLIC_SERIES_SOURCE_REVISION = '54ea43b9771d3b263718a4d40cecc68167b7a718'

export interface PublicSeriesIdentity {
  key: PublicSeriesKey
  label: string
  /** The date this NAME was retired. Present on every entry here since
   *  2026-09-17: the assets are history, not current identity. */
  retiredOn: string
  assetPath: string | null
  assetSha256: string
  sourceUrl: string
  sourceWidth: 1200
  sourceHeight: 630
  /** Final row of the symbol above the wordmark, used to crop to lettering. */
  symbolEndY: number
  /** Inclusive source-pixel bounds of the actual letter-bearing rows. */
  letterTopY: number
  letterBottomY: number
  letterLeftX: number
  letterRightX: number
}

export const PUBLIC_SERIES: Readonly<Record<PublicSeriesKey, PublicSeriesIdentity>> = Object.freeze({
  built: Object.freeze({
    key: 'built',
    label: 'Built With AI',
    retiredOn: '2026-09-17',
    assetPath: '/builtwithai-logo-wordmark.png',
    assetSha256: '271ab965dc51714be8c13c8a6bb8c7b2b60f4bf22caf51dda5a2928e295fd29f',
    sourceUrl: `https://raw.githubusercontent.com/krishanraja/mindmake/${PUBLIC_SERIES_SOURCE_REVISION}/src/assets/builtwithai-logo-wordmark.png`,
    sourceWidth: 1200,
    sourceHeight: 630,
    symbolEndY: 438,
    letterTopY: 452,
    letterBottomY: 508,
    letterLeftX: 287,
    letterRightX: 912,
  }),
  paid: Object.freeze({
    key: 'paid',
    label: 'The Money of AI',
    retiredOn: '2026-09-17',
    assetPath: '/moneyofai-logo-wordmark.png',
    assetSha256: '1cdd6d7710c9970a1e86c8793b33acf6b3f63c81304aeb6efe84d392467322a6',
    sourceUrl: `https://raw.githubusercontent.com/krishanraja/mindmake/${PUBLIC_SERIES_SOURCE_REVISION}/src/assets/moneyofai-logo-wordmark.png`,
    sourceWidth: 1200,
    sourceHeight: 630,
    symbolEndY: 423,
    letterTopY: 438,
    letterBottomY: 490,
    letterLeftX: 254,
    letterRightX: 942,
  }),
})

export const PUBLIC_SERIES_KEYS = Object.freeze(['built', 'paid'] as const)

/** Which retired asset a stored key uses. `video_studio_jobs.series` spells the
 *  same two publications as `money_of_ai` and `built_with_ai`; this registry
 *  spells them `paid` and `built`. Both are frozen history. */
export const SERIES_ASSET_KEY: Readonly<Record<string, PublicSeriesKey>> = Object.freeze({
  money_of_ai: 'paid',
  paid: 'paid',
  built_with_ai: 'built',
  built: 'built',
})

/** The words printed ON the artwork, which are fixed at publication and are
 *  never renamed.
 *
 *  This is a THIRD question, and on 2026-09-20 it was answered with the second
 *  one by mistake. `publicSeriesLabel` asks what to call a thing today and is
 *  right for a room header. `VIDEO_SERIES_LABEL` was pointed at it, so a video
 *  review of a piece stored as `money_of_ai` rendered the "The Money of AI"
 *  wordmark under an accessible name reading "split.the.bill". A label that
 *  disagrees with the artwork beside it is worse than either alone, and the
 *  e2e suite caught it where every static guard passed. */
export function publicSeriesAssetLabel(key: string): string {
  const asset = PUBLIC_SERIES[SERIES_ASSET_KEY[key]]
  return asset ? asset.label : publicSeriesLabel(key)
}

/** The artwork for a key. A retired asset key gets its PNG. Anything else,
 *  including every live subchannel, gets a wordmark-less identity carrying the
 *  live label and the reason there is no asset, so a caller renders type rather
 *  than somebody else's name. */
export function publicSeriesIdentity(key: string): PublicSeriesIdentity {
  const asset = (PUBLIC_SERIES as Record<string, PublicSeriesIdentity | undefined>)[key]
  if (asset) return asset
  return {
    key: key as PublicSeriesKey,
    label: publicSeriesLabel(key),
    retiredOn: '',
    assetPath: null,
  } as unknown as PublicSeriesIdentity
}

/** The label to show. A LIVE slug gets its live label from venture_formats; a
 *  retired asset key gets the name it was published under, because a historical
 *  piece is still that piece. Never a title-cased slug. */
export function publicSeriesLabel(key: string): string {
  const live = resolveFormat(key)
  if (live && live.kind === 'subchannel') return live.label
  const retired = (PUBLIC_SERIES as Record<string, PublicSeriesIdentity>)[key]
  return retired ? retired.label : formatLabel(key)
}
