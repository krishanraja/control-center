import { useMemo, useState } from 'react'
import { useGrowth } from '../../hooks/useGrowth'
import { BATCH_MAX, citationRate, mondayOf, pct } from '../../lib/growth'
import { TouchpointMap } from './TouchpointMap'
import { BOTTOM_NAV_PAD } from '../mobile/primitives'
import { CreativeBoard } from './CreativeBoard'
import { CouncilFeed } from './CouncilFeed'
import { SignalsPanel } from './SignalsPanel'
import { GovernancePanel } from './GovernancePanel'
import { GrowthScoreboard } from './GrowthScoreboard'
import { isGrowthScoreboardEnabled } from '../../hooks/useGrowthMetrics'
import { DailyBriefBanner } from '../DailyBriefBanner'
import { SegmentedNav, type Segment } from '../shared/SegmentedNav'
import { useQuickCreateListener } from '../../lib/quickCreate'

/**
 * The Growth tab. ONE surface, five sections, in the order of the weekly loop.
 *
 *   Map        where the ICP already is (growth_touchpoints, the spine)
 *   Work       what gets made for them (growth_creative_queue, batch-capped)
 *   Signals    whether anyone found us (growth_geo_probes + maya_striking_distance)
 *   Council    the weekly kill and double-down call (growth_council_reviews)
 *   Governance what it costs and how much rope the agents have (lane control plane)
 *
 * This replaces two tabs that both read as "growth": the old `acquisition` deck
 * and the old `growth` map. They overlapped on measurement and half the deck
 * served cold email outbound, a motion Krish has retired. `#/acquisition` still
 * resolves here (see App.tsx), landing on Governance where its lane controls now
 * live.
 *
 * Same shape as the Content tab: a pill nav over one scrolling body, sections
 * are code-split with the tab. The growth tables read from Supabase on the anon
 * key and write through /api/growth/*; the lane control plane in Governance
 * reads and writes through /api/acquisition/* on the service role, because
 * money and PII never touch the anon client.
 */

export type GrowthSectionId = 'map' | 'work' | 'signals' | 'council' | 'governance'

/**
 * What the whole tab is for, in one sentence, and what each section is for,
 * in one more. Krish (2026-09-08): "I don't know what this tab is for. In
 * plain English what is it for and why doesn't it just say that?" So it says
 * it, at the top, and the line changes with the section under the pills.
 */
export const GROWTH_PURPOSE = 'Find buyers where they already are, make them something each week, and see whether it worked.'

const SECTIONS: Array<{ id: GrowthSectionId; label: string; what: string }> = [
  // Krish: "I find the laguage used over complicated and hard to understand
  // what everything actually is, full of jargon". Section names now say what
  // the section IS, not what the subsystem behind it is called. The ids are
  // unchanged so nothing downstream breaks.
  { id: 'map', label: 'Where they are', what: 'The places your buyers already go, per product. Add one, answer the open questions, mark what is covered.' },
  { id: 'work', label: 'To do', what: 'The 3 to 5 clips to make this week, from brief to posted. You film. The card holds the script.' },
  { id: 'signals', label: "What's moving", what: 'Whether anyone is finding you: do AI answers mention you, and where do you rank on Google.' },
  { id: 'council', label: 'Weekly review', what: 'Every Sunday, one verdict per product: what to stop, what to do next, and your ruling on it.' },
  { id: 'governance', label: 'Spend limits', what: 'The money and freedom each product\'s agents get: the budget, how much they may do alone, what they may say.' },
]

export function GrowthTab({
  variant,
  initialSection,
  lane,
  onNavigate,
}: {
  variant: 'desktop' | 'mobile'
  /** Section a deep link opens on. Undefined leaves the current one alone. */
  initialSection?: GrowthSectionId
  /** Lane slug from `?lane=`, used by the Governance section. */
  lane?: string | null
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}) {
  const [section, setSection] = useState<GrowthSectionId>(initialSection || 'map')
  // Adjust on prop change during render rather than in an Effect: a deep link
  // that arrives while the tab is already mounted still moves the section, but
  // clicking a pill afterwards never gets overwritten (the prop has not changed,
  // so this branch does not run again).
  const [lastEntry, setLastEntry] = useState(initialSection)
  if (initialSection !== lastEntry) {
    setLastEntry(initialSection)
    if (initialSection) setSection(initialSection)
  }

  const g = useGrowth()

  const counts = useMemo(() => {
    const week = mondayOf(new Date())
    return {
      map: g.touchpoints.filter(t => t.assumption_flag).length,
      work: g.cards.filter(c => c.stage !== 'dropped' && c.batch_week === week).length,
      signals: g.probes.length,
      council: g.reviews.filter(r => !r.krish_decision).length,
      governance: 0,
    }
  }, [g.touchpoints, g.cards, g.reviews, g.probes])

  // The + create sheet's "Add a place": land on the map with its
  // composer open, wherever in Growth you were.
  const [mapCompose, setMapCompose] = useState(0)
  useQuickCreateListener('touchpoint', () => { setSection('map'); setMapCompose(n => n + 1) })
  const [clipCompose, setClipCompose] = useState(0)
  useQuickCreateListener('clip', () => { setSection('work'); setClipCompose(n => n + 1) })

  const overCap = counts.work > BATCH_MAX
  const geoRate = useMemo(() => citationRate(g.probes), [g.probes])

  return (
    <div className="flex flex-col gap-3 min-h-0 h-full">
      <div className="flex-shrink-0">
        <h1 className="text-xl md:text-2xl xl:text-heading font-semibold text-white tracking-tight">Growth</h1>
        {/* The purpose, not a readout. The counts live on the pills, and the
            desk keeps its one line of numbers under the purpose because it
            has the room. The old phone line ("3 questions to answer when you
            have a minute") named a chore without saying what the tab was. */}
        <p className="text-xs md:text-body text-white/60 mt-0.5 leading-snug">{GROWTH_PURPOSE}</p>
        {variant === 'desktop' && !g.loading && (
          <p className="text-label text-white/40 mt-0.5 tabular-nums">
            {g.touchpoints.length} touchpoints · {counts.map} open questions · {counts.work} in this week's batch · {counts.council} reviews waiting on you · {pct(geoRate)} of AI answers mention you
          </p>
        )}
        {g.error && <p className="text-label text-rose-300 mt-1">Could not read growth data: {g.error}</p>}
      </div>

      <SegmentedNav<GrowthSectionId>
        segments={SECTIONS.map((sec): Segment<GrowthSectionId> => ({
          id: sec.id,
          label: sec.label,
          badge: counts[sec.id] > 0 ? (
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 align-middle text-micro tabular-nums ${
              sec.id === 'work' && overCap ? 'bg-rose-500/25 text-rose-200' : 'bg-white/10'
            }`}>
              {counts[sec.id]}
            </span>
          ) : undefined,
        }))}
        value={section}
        onChange={setSection}
        label="Growth sections"
        variant="pill"
        testIdPrefix="growth-section"
      />

      {/* What the open section is for. One sentence, changes with the pill. */}
      <p className="text-label text-white/45 leading-snug flex-shrink-0" data-testid="growth-section-what">
        {SECTIONS.find(s => s.id === section)?.what}
      </p>

      {/* The scroll container announces which section is mounted. Asserting on a
          heading meant the specs broke when "Touchpoint map" was renamed along
          with the section labels; a panel id says WHICH section is showing
          without depending on any word inside it. */}
      <div data-testid={`growth-panel-${section}`} className={`flex-1 min-h-0 overflow-y-auto ${variant === 'mobile' ? BOTTOM_NAV_PAD : ''}`}>
        {section === 'map' ? (
          <TouchpointMap g={g} variant={variant} composeSignal={mapCompose} />
        ) : section === 'work' ? (
          <CreativeBoard g={g} variant={variant} composeSignal={clipCompose} />
        ) : section === 'signals' ? (
          <div className="space-y-4">
            {/* Venture health at a glance, relocated from Home in the 2026-08-20
                recompose; Growth owns venture-level signal. */}
            {isGrowthScoreboardEnabled() && (
              <GrowthScoreboard variant={variant === 'mobile' ? 'mobile' : 'desktop'} />
            )}
            <SignalsPanel g={g} variant={variant} />
          </div>
        ) : section === 'council' ? (
          <div className="space-y-4">
            {/* The Friday retro, relocated from Home's ambient fold; the weekly
                review is where a retro belongs. */}
            <DailyBriefBanner blocking={false} variant={variant === 'mobile' ? 'mobile' : 'desktop'} retroOnly />
            <CouncilFeed g={g} variant={variant} onNavigate={onNavigate} />
          </div>
        ) : (
          <GovernancePanel
            variant={variant}
            lane={lane}
            onSelectLane={slug => onNavigate?.('growth', { lane: slug })}
            onNavigate={onNavigate}
          />
        )}
      </div>
    </div>
  )
}
