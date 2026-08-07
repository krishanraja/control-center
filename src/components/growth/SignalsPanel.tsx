import { GeoProbes } from './GeoProbes'
import { SeoRankPanel } from '../acquisition/SeoRankPanel'
import type { GrowthData } from '../../hooks/useGrowth'

/**
 * C) SIGNALS: the one measurement surface.
 *
 * Two reads of the same question, "does anyone actually find us", stacked in
 * order of importance. The GEO citation rate leads because it is the score for
 * the answer engines, the channel the whole map is aimed at; it is computed
 * from growth_geo_probes on every render and never stored. Under it sits the
 * owned-domain check: Maya's weekly SEO rank sweep over maya_striking_distance.
 *
 * The SEO panel runs UNFILTERED here on purpose. maya_striking_distance is keyed
 * on the acquisition lane slug (mm_ctrl, fractionl_pulse, legibility) while the GEO
 * probes are keyed on the growth product slug (ctrl, pulse, mindmaker), so a
 * shared filter would silently drop rows. Signals is a portfolio read; the
 * per-lane cut lives in Governance.
 *
 * GeoCitationsPanel is deliberately NOT rendered: it reads zara_signals where
 * signal_type='geo-citation', which has never held a single row, and it
 * duplicates growth_geo_probes, which is the real GEO surface.
 */
export function SignalsPanel({ g }: { g: GrowthData }) {
  return (
    <div className="space-y-4 pb-8">
      <GeoProbes g={g} />
      <SeoRankPanel />
    </div>
  )
}
