import { GeoProbes } from './GeoProbes'
import { WebPropertiesPanel } from './WebPropertiesPanel'
import { SeoRankPanel } from '../acquisition/SeoRankPanel'
import { ErrorBoundary } from '../ErrorBoundary'
import type { GrowthData } from '../../hooks/useGrowth'

/**
 * C) SIGNALS: the one measurement surface.
 *
 * Three reads of the same question, "does anyone actually find us", stacked in
 * order of importance. GEO leads (the channel the map is aimed at); site visits
 * answer it directly for the four sites; the SEO sweep sits under them.
 *
 * The GEO citation rate is computed from growth_geo_probes on every render and
 * never stored. Site visits are one read per site per day from
 * /api/growth/web-insights, in their own error boundary so a bad row there
 * never takes the other two reads down with it. The owned-domain check is
 * Maya's weekly SEO rank sweep over maya_striking_distance.
 *
 * The SEO panel runs UNFILTERED here on purpose. maya_striking_distance is keyed
 * on the acquisition lane slug (mm_ctrl, fractionl_pulse, legibility) while the GEO
 * probes are keyed on the growth product slug (ctrl, pulse, mindmake), so a
 * shared filter would silently drop rows. Signals is a portfolio read; the
 * per-lane cut lives in Governance.
 *
 * GeoCitationsPanel is deliberately NOT rendered: it reads zara_signals where
 * signal_type='geo-citation', which has never held a single row, and it
 * duplicates growth_geo_probes, which is the real GEO surface.
 */
export function SignalsPanel({ g, variant, webFocus, onNavigate }: {
  g: GrowthData
  variant: 'desktop' | 'mobile'
  /** The hero's "Show me" for a site action; `n` bumps on every press. */
  webFocus?: { prefix: string; n: number }
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}) {
  return (
    <div className="space-y-4 pb-8">
      <GeoProbes g={g} variant={variant} />
      <ErrorBoundary label="Site visits">
        <WebPropertiesPanel variant={variant} focus={webFocus} onNavigate={onNavigate} />
      </ErrorBoundary>
      <SeoRankPanel />
    </div>
  )
}
