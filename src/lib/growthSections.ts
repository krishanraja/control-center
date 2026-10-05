/**
 * The Growth tab's views, and every ?section= spelling that reaches one.
 *
 * It lives here rather than in GrowthTab.tsx because App.tsx has to know which
 * deep links are real BEFORE the Growth chunk loads, and GrowthTab is lazy. So
 * App kept its own copy of the list, the copy did not grow when the Buyers view
 * did, and `#/growth?section=buyers` silently landed on Next move. A list with
 * two copies is the same failure as five files holding five labels for one
 * venture. This module has no imports and no DOM, so importing it costs the
 * shell nothing.
 */

export type GrowthSectionId = 'next' | 'week' | 'numbers' | 'places' | 'buyers'

export const GROWTH_SECTIONS: readonly GrowthSectionId[] = ['next', 'week', 'numbers', 'places', 'buyers']

/** The ids kept working after the 2026-10-04 rename, each pointing at a view. */
export const GROWTH_SECTION_ALIASES: Record<string, GrowthSectionId> = {
  council: 'week', work: 'week', signals: 'numbers', governance: 'numbers', map: 'places', icp: 'buyers',
}

/** Every spelling App.tsx should accept from a URL. */
export const GROWTH_SECTION_IDS: readonly string[] = [
  ...GROWTH_SECTIONS, ...Object.keys(GROWTH_SECTION_ALIASES),
]

export function resolveGrowthSection(raw: string | null | undefined): GrowthSectionId {
  if (raw && (GROWTH_SECTIONS as readonly string[]).includes(raw)) return raw as GrowthSectionId
  return (raw && GROWTH_SECTION_ALIASES[raw]) || 'next'
}
