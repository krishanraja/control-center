/**
 * The Growth tab: ONE MOVE AT A TIME.
 *
 * The tab answers one question, "is anyone finding my products, and what is
 * the one thing to do now?", and then lets him act in a tap. Four views:
 *
 *   next     the numbers at a glance and the one move in focus (the default)
 *   week     every move in order, Sunday's reviews, this week's clips, past weeks
 *   numbers  AI answers, site visits, Google, clips, and the one spend line
 *   places   where buyers already go, what is waiting on an answer, the accounts
 *
 * The old ?section= ids still land somewhere sensible: council and work open
 * the week, signals and governance open the numbers, map opens the places.
 * `#/acquisition` resolves here too (App.tsx) and lands on the numbers, where
 * the spend line now lives. Switcher test ids are growth-section-<id> and the
 * one scroller is growth-panel-<id>.
 *
 * Height: a fixed header over ONE bounded scroller (the AppFrame contract).
 * The data and every write come through useGrowthTab, over the read model in
 * src/lib/growthModel.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SurfaceHeader } from '../shared/SurfaceHeader'
import { SegmentedNav, type Segment } from '../shared/SegmentedNav'
import { SkeletonList } from '../shared/Skeleton'
import { BOTTOM_NAV_PAD } from '../mobile/primitives'
import { useContainerWidth } from '../../hooks/useContainerWidth'
import { useQuickCreateListener } from '../../lib/quickCreate'
import { useGrowthTab } from './useGrowthTab'
import { NextView, type Layout } from './NextView'
import { WeekView } from './WeekView'
import { NumbersView } from './NumbersView'
import { PlacesView } from './PlacesView'
import { SiteCheck } from './SiteCheck'
import { aiSummary, summaryLine, visitsSummary } from './numbers'
import type { NumberAnchor } from './NumbersStrip'

export type GrowthSectionId = 'next' | 'week' | 'numbers' | 'places'

const ALIASES: Record<string, GrowthSectionId> = {
  council: 'week', work: 'week', signals: 'numbers', governance: 'numbers', map: 'places',
}

export function resolveGrowthSection(raw: string | null | undefined): GrowthSectionId {
  if (raw === 'next' || raw === 'week' || raw === 'numbers' || raw === 'places') return raw
  return (raw && ALIASES[raw]) || 'next'
}

export function GrowthTab({ variant, initialSection }: {
  variant: 'desktop' | 'mobile'
  /** The ?section= a deep link carries, in either spelling. Undefined leaves the view alone. */
  initialSection?: string
}) {
  const m = useGrowthTab()
  const [section, setSection] = useState<GrowthSectionId>(resolveGrowthSection(initialSection))
  // A deep link that arrives while the tab is mounted still moves the view,
  // and a tap afterwards is never overwritten (the prop has not changed).
  const [lastEntry, setLastEntry] = useState(initialSection)
  if (initialSection !== lastEntry) {
    setLastEntry(initialSection)
    if (initialSection) setSection(resolveGrowthSection(initialSection))
  }
  const [anchor, setAnchor] = useState<NumberAnchor | null>(null)
  const [placeCompose, setPlaceCompose] = useState(false)
  const [boxRef, width] = useContainerWidth()
  const scroller = useRef<HTMLDivElement>(null)
  const mobile = variant === 'mobile'

  // The box this tab is handed, not the window.
  const layout: Layout = width === 0
    ? (mobile ? 'phone' : 'wide')
    : width < 560 ? 'phone' : width < 1000 ? 'tablet' : width < 1400 ? 'wide' : 'xwide'
  const desk = layout === 'wide' || layout === 'xwide'

  const go = useCallback((s: GrowthSectionId) => {
    setSection(s)
    scroller.current?.scrollTo({ top: 0 })
  }, [])

  useEffect(() => { if (section !== 'numbers') setAnchor(null) }, [section])

  /** An in-app Growth link (`#/growth?section=work`) switches the view instead of navigating. */
  const onLink = useCallback((href: string): boolean => {
    if (!href.startsWith('#/growth')) return false
    const q = href.split('?')[1] ?? ''
    go(resolveGrowthSection(new URLSearchParams(q).get('section')))
    return true
  }, [go])

  // The + sheet (CreateSheet, tab 'growth') is the only create control on a phone.
  useQuickCreateListener('touchpoint', () => { go('places'); setPlaceCompose(true) })
  useQuickCreateListener('clip', () => {
    const i = m.queue.findIndex(mv => mv.source === 'clip')
    go('next')
    if (i >= 0) m.setCursor(i)
  })

  const openNumber = (a: NumberAnchor) => {
    setSection('numbers')
    setAnchor(a)
  }

  const summary = useMemo(() => {
    if (m.loading) return null
    const { products, totals } = m.signals
    return summaryLine(aiSummary(products, totals), visitsSummary(m.web.data, totals))
  }, [m.loading, m.signals, m.web.data])

  const segments: Array<Segment<GrowthSectionId>> = [
    { id: 'next', label: mobile ? 'Next' : 'Next move' },
    {
      id: 'week',
      label: mobile ? 'Week' : 'This week',
      badge: !mobile && !m.loading && m.openCount > 0
        ? <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 align-middle font-mono text-micro tabular-nums">{m.openCount}</span>
        : undefined,
    },
    { id: 'numbers', label: 'Numbers' },
    { id: 'places', label: 'Places' },
  ]

  const nav = (
    <SegmentedNav<GrowthSectionId>
      segments={segments}
      value={section}
      onChange={go}
      label="Growth sections"
      variant={mobile ? 'segmented' : 'pill'}
      testIdPrefix="growth-section"
    />
  )

  return (
    <div ref={boxRef} className="flex h-full min-h-0 flex-col" data-testid="growth-tab" data-layout={layout}>
      <div className={`flex-shrink-0 ${mobile ? 'pb-4' : 'pb-5'}`}>
        {mobile ? (
          <>
            {/* The bottom nav already says Growth; on a phone the title band's
                room goes to the move. The heading stays for screen readers. */}
            <h1 className="sr-only">Growth</h1>
            {nav}
          </>
        ) : (
          <SurfaceHeader
            title="Growth"
            description={summary ? <span data-testid="growth-summary">{summary}</span> : 'Is anyone finding your products, and what is the one thing to do now?'}
            meta={<SiteCheck m={m} header />}
            actions={nav}
          />
        )}
      </div>

      <div
        ref={scroller}
        data-testid={`growth-panel-${section}`}
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${mobile ? `${BOTTOM_NAV_PAD} -mx-5 px-5` : '-mx-2 px-2 pb-6'}`}
      >
        {section === 'next' && (
          <NextView m={m} layout={layout} mobile={mobile} summary={mobile ? summary : null} onSection={go} onLink={onLink} onNumber={openNumber} />
        )}
        {section !== 'next' && m.loading && <div data-testid="growth-loading" aria-busy="true"><SkeletonList rows={4} /></div>}
        {section === 'week' && !m.loading && (
          <WeekView m={m} mobile={mobile} wide={desk} onDo={i => { m.setCursor(i); go('next') }} />
        )}
        {section === 'numbers' && !m.loading && <NumbersView m={m} mobile={mobile} layout={layout} anchor={anchor} />}
        {section === 'places' && !m.loading && <PlacesView m={m} mobile={mobile} wide={desk} compose={placeCompose} onComposed={() => setPlaceCompose(false)} />}
      </div>
    </div>
  )
}
