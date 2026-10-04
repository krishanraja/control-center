import { useMemo, useState } from 'react'
import { ArrowUpRight } from '@/lib/icons'
import { SlideOver } from '../shared/SlideOver'
import { BottomSheet } from '../mobile/BottomSheet'
import { SegmentedNav, type Segment } from '../shared/SegmentedNav'
import { Eyebrow } from '../shared/Eyebrow'
import { Badge } from '../ui/badge'
import { LibraryRoom } from './LibraryRoom'
import { SUBCHANNELS, standingQuestion } from '../../lib/formats'
import { ladderVerdict } from '../../lib/ladder'
import { compareCandidates, coveredIds, seriesOf, stageOf } from '../../lib/contentModel'
import { argumentOf, clearsOutMonday } from '../../lib/contentCallWords'
import type { ContentCalls } from '../../hooks/useContentCalls'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'

/**
 * Every piece, for browsing. Behind one quiet control rather than a row of
 * room pills, because browsing is not the job: the calls are. Each series
 * shows what is being made for it and everything judged ready, best first,
 * and the Library keeps its calendar, backburner and shelves.
 */
type View = string

const MAKING = new Set(['writing', 'fact_check', 'your_call', 'ready_to_go'])
const STAGE_WORDS: Record<string, string> = {
  writing: 'Being written',
  fact_check: 'Facts not passed yet',
  your_call: 'Waiting for your approval',
  ready_to_go: 'Approved, not out yet',
}

export function BrowsePieces({ open, onClose, mobile, s }: {
  open: boolean
  onClose: () => void
  mobile: boolean
  s: ContentCalls
}) {
  const [view, setView] = useState<View>(SUBCHANNELS[0]?.slug ?? 'library')
  const segments: Array<Segment<View>> = [
    ...SUBCHANNELS.map(f => ({ id: f.slug, label: f.label })),
    { id: 'library', label: 'Library' },
  ]
  const body = (
    <div className="flex flex-col gap-5" data-testid="content-browse">
      <SegmentedNav<View>
        segments={segments}
        value={view}
        onChange={setView}
        label="Browse by series"
        variant="pill"
        testIdPrefix="content-browse"
      />
      {view === 'library'
        ? <LibraryRoom v2={s.v2} ideas={s.ideas} variant={mobile ? 'mobile' : 'desktop'} />
        : <SeriesPieces slug={view} s={s} />}
    </div>
  )
  if (mobile) {
    return (
      <BottomSheet open={open} onClose={onClose} ariaLabel="All pieces">
        <div className="h-full overflow-y-auto px-5 pb-8">
          <div className="mb-4"><Eyebrow>All pieces</Eyebrow></div>
          {body}
        </div>
      </BottomSheet>
    )
  }
  return (
    <SlideOver open={open} onClose={onClose} ariaLabel="All pieces" label="All pieces">
      {body}
    </SlideOver>
  )
}

function SeriesPieces({ slug, s }: { slug: string; s: ContentCalls }) {
  const { making, ready } = useMemo(() => {
    const covered = coveredIds(s.ideas)
    const mine = s.ideas.filter(i => seriesOf(i) === slug)
    return {
      making: mine.filter(i => MAKING.has(stageOf(i) ?? '')),
      ready: mine.filter(i => stageOf(i) === 'judged_ready' && !covered.has(i.id)).sort(compareCandidates),
    }
  }, [s.ideas, slug])
  const question = standingQuestion(slug)
  return (
    <div className="flex flex-col gap-6" data-testid={`content-browse-panel-${slug}`}>
      {question && <p className="text-ui text-ink-muted">{question}</p>}
      <section className="flex flex-col gap-2">
        <h3 className="leading-none"><Eyebrow>Being made ({making.length})</Eyebrow></h3>
        {making.length
          ? <ul className="flex flex-col divide-y divide-white/[0.06]">{making.map(i => <PieceRow key={i.id} idea={i} note={STAGE_WORDS[stageOf(i) ?? ''] ?? 'In the works'} today={s.today} />)}</ul>
          : <p className="text-ui text-ink-faint">Nothing is being made for this series right now.</p>}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="leading-none"><Eyebrow>Judged ready ({ready.length})</Eyebrow></h3>
        {ready.length
          ? <ul className="flex flex-col divide-y divide-white/[0.06]">{ready.map(i => <PieceRow key={i.id} idea={i} note={`Scored ${ladderVerdict(i)?.score ?? 'no score'} of 10`} today={s.today} withArgument />)}</ul>
          : <p className="text-ui text-ink-faint">No piece is judged ready for this series yet. The judges look again every morning at 05:00 UTC.</p>}
      </section>
    </div>
  )
}

function PieceRow({ idea, note, today, withArgument = false }: { idea: ContentIdeaRow; note: string; today: string; withArgument?: boolean }) {
  const arg = withArgument ? argumentOf(idea) : null
  return (
    <li className="flex flex-col gap-1 py-3">
      <a href={`#/content?idea=${idea.id}`} className="tap-44 group inline-flex items-start gap-1.5 text-ui font-medium text-ink hover:text-accent">
        <span>{(idea.idea || '').trim()}</span>
        <ArrowUpRight size={14} className="mt-1 shrink-0 text-ink-faint group-hover:text-accent" aria-hidden />
      </a>
      <span className="flex flex-wrap items-center gap-2 text-label text-ink-faint">
        <span>{note}</span>
        {clearsOutMonday(idea, today) && <Badge variant="warning">Clears out Monday</Badge>}
      </span>
      {arg && <p className="text-ui text-ink-muted">{arg}</p>}
    </li>
  )
}
