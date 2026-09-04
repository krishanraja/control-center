/**
 * Public publication identity. The database and workflow keys stay `built`
 * and `paid`; nothing user-facing should derive a title from those aliases.
 *
 * Assets are vendored byte-for-byte from the pinned GitHub revision below.
 * SHA-256 is checked by scripts/check-mindmake-design.mts.
 */
export type PublicSeriesKey = 'built' | 'paid'

export const PUBLIC_SERIES_SOURCE_REVISION = '54ea43b9771d3b263718a4d40cecc68167b7a718'

export interface PublicSeriesIdentity {
  key: PublicSeriesKey
  label: string
  assetPath: string
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

export function publicSeriesIdentity(key: PublicSeriesKey): PublicSeriesIdentity {
  return PUBLIC_SERIES[key]
}

export function publicSeriesLabel(key: PublicSeriesKey): string {
  return publicSeriesIdentity(key).label
}
