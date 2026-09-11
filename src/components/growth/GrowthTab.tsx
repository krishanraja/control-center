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
import { DoThisNextHero, type HeroDescriptor } from '../shared/DoThisNextHero'
import { Film, Gavel, HelpCircle } from '@/lib/icons'
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

/**
 * The five sections, in the order one CAUSES the next.
 *
 * They used to run Map, Work, Signals, Council, described as "the order of the
 * weekly loop". It is not that order. The council runs on Sunday and its "Make
 * it a clip" action writes the creative board, so the review is what PRODUCES
 * the week's work; it sat fourth, two pills to the right of the thing it feeds.
 * Krish, reading it on a phone: "not very guided and not very sequential, just
 * loads of random things to do everywhere".
 *
 * So: the three steps of the week first, in sequence, then the two references
 * that are not steps at all. The ids are unchanged, so deep links and the e2e
 * test ids keep working.
 */
const SECTIONS: Array<{ id: GrowthSectionId; label: string; what: string }> = [
  // The week, in order.
  { id: 'council', label: 'Review', what: 'Every Sunday, one verdict per product: what to stop, what to do next, and your ruling on it. This is where the week\'s clips come from.' },
  { id: 'work', label: 'To do', what: 'The 3 to 5 clips to make this week, from brief to posted. You film. The card holds the script.' },
  { id: 'signals', label: "What's moving", what: 'Whether anyone is finding you: do AI answers mention you, and where do you rank on Google.' },
  // Reference, not steps.
  { id: 'map', label: 'Where they are', what: 'The places your buyers already go, per product. Add one, answer the open questions, mark what is covered.' },
  { id: 'governance', label: 'Spend limits', what: 'The money and freedom each product\'s agents get: the budget, how much they may do alone, what they may say.' },
]

/**
 * The one thing to do next on this tab.
 *
 * Growth is the only tab that never went through the all-tabs rebuild
 * (docs/plans/all-tabs-rebuild/STATE.md ledgers Pipeline, Network, Visibility,
 * Subscriptions, Today, Intel, Org, Home and Content as done; Growth is not in
 * it). Seven surfaces render through the shared DoThisNextHero and this one
 * rendered five equal pills and left Krish to work out which mattered. The
 * charter's own consistency mandate says a finished tab's hero, counts, actions
 * and empty states must be indistinguishable in grammar from Content's.
 *
 * Order follows the week: a ruling that is owed blocks the clips it produces,
 * so it comes first. An unfilled batch is next, because that is the actual
 * output. Then the map's open questions, which sharpen everything downstream.
 * When none of that is true it says so plainly rather than inventing a chore.
 */
function nextGrowthAction(
  counts: Record<GrowthSectionId, number>,
  overCap: boolean,
  weekLabel: string,
): { descriptor: HeroDescriptor; go: GrowthSectionId; compose?: 'clip' } {
  if (counts.council > 0) {
    return {
      descriptor: {
        headline: counts.council === 1 ? 'Rule on Sunday\'s review' : `Rule on ${counts.council} reviews`,
        sub: 'Your ruling turns each move into a clip.',
        actionLabel: 'Read the review',
        icon: <Gavel size={14} />,
        tone: 'amber',
      },
      go: 'council',
    }
  }
  if (overCap) {
    return {
      descriptor: {
        headline: 'Drop one before you start filming',
        sub: `Over the agreed run of ${BATCH_MAX}. Cut one back.`,
        actionLabel: 'Open the board',
        icon: <Film size={14} />,
        tone: 'amber',
      },
      go: 'work',
    }
  }
  if (counts.work === 0) {
    return {
      descriptor: {
        headline: 'Pick this week\'s clips',
        sub: `Nothing queued for the week of ${weekLabel}.`,
        actionLabel: 'Start one',
        icon: <Film size={14} />,
        tone: 'violet',
      },
      go: 'work',
      compose: 'clip',
    }
  }
  if (counts.map > 0) {
    return {
      descriptor: {
        headline: counts.map === 1 ? 'Answer one open question' : `Answer ${counts.map} open questions`,
        sub: 'The map is still guessing on these.',
        actionLabel: 'Open the map',
        icon: <HelpCircle size={14} />,
        tone: 'sky',
      },
      go: 'map',
    }
  }
  return {
    descriptor: {
      headline: 'Nothing is waiting on you',
      sub: 'Clips queued, map answered, review ruled on.',
      clear: true,
      tone: 'neutral',
    },
    go: 'work',
  }
}

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
  // The landing section is the week's work, not the reference map: opening
  // Growth is almost always about what to make this week.
  const [section, setSection] = useState<GrowthSectionId>(initialSection || 'work')
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
  // Same signal pattern as the two composers above: the hero points at the
  // first review that owes a ruling, and CouncilFeed brings it into view.
  const [councilFocus, setCouncilFocus] = useState(0)

  const overCap = counts.work > BATCH_MAX
  const geoRate = useMemo(() => citationRate(g.probes), [g.probes])
  const weekLabel = useMemo(
    () => new Date(mondayOf(new Date())).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }),
    [],
  )
  const next = useMemo(
    () => nextGrowthAction(counts, overCap, weekLabel),
    [counts, overCap, weekLabel],
  )

  return (
    <div className="flex flex-col gap-3 min-h-0 h-full">
      <div className="flex-shrink-0">
        <h1 className="text-xl md:text-2xl xl:text-heading font-semibold text-white tracking-tight">Growth</h1>
        {/* The purpose, on the desk only. On a phone the title, the purpose,
            the counts, the hero, the pills and the section line took the top
            half of the screen before any content: "more than half the screen
            is fixed, which is ridiculous" (Krish, 2026-09-11). The hero says
            what to do, which is what this sentence was standing in for. */}
        {variant === 'desktop' && (
          <p className="text-xs md:text-body text-white/60 mt-0.5 leading-snug">{GROWTH_PURPOSE}</p>
        )}
        {/* The house count line, on the phone too. It was desktop-only, so the
            device that actually gets used opened on a purpose sentence and five
            pills with no sense of scale. It wraps rather than truncating. */}
        {!g.loading && (
          <p className="text-label text-white/40 mt-0.5 tabular-nums leading-snug">
            {g.touchpoints.length} places mapped · {counts.work} of {BATCH_MAX} clips this week
            {counts.council > 0 ? ` · ${counts.council} to rule on` : ''}
            {variant === 'desktop' ? ` · ${pct(geoRate)} of AI answers mention you` : ''}
          </p>
        )}
        {g.error && <p className="text-label text-rose-300 mt-1">Could not read growth data: {g.error}</p>}
      </div>

      {/* The one next thing, in the same component every other tab uses. */}
      {!g.loading && !g.error && (
        <div className="flex-shrink-0" data-testid="growth-hero">
          <DoThisNextHero
            descriptor={next.descriptor}
            narrow={variant === 'mobile'}
            // Setting the section was all this used to do, so on the common
            // case (the hero naming the section already under the pills) the
            // button was a no-op. It now points at the actual waiting thing.
            onAct={next.descriptor.clear ? undefined : () => {
              setSection(next.go)
              if (next.compose === 'clip') setClipCompose(n => n + 1)
              if (next.go === 'council') setCouncilFocus(n => n + 1)
            }}
          />
        </div>
      )}

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

      {/* What the open section is for. One sentence, changes with the pill.
          Desk only: on a phone it restates the pill directly above it, and the
          room it costs comes straight out of the content below. */}
      {variant === 'desktop' && (
        <p className="text-label text-white/45 leading-snug flex-shrink-0" data-testid="growth-section-what">
          {SECTIONS.find(s => s.id === section)?.what}
        </p>
      )}

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
            <CouncilFeed g={g} variant={variant} onNavigate={onNavigate} focusSignal={councilFocus} />
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
