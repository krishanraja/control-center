import { SlideOver } from '../shared/SlideOver'
import { ContentSeedRail } from '../content/ContentSeedRail'
import { FeedRoom } from './FeedRoom'
import { Eyebrow } from '../shared/Eyebrow'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import { publicSeriesIdentity } from '../../lib/publicSeries'

// Everything the engine read and could seed from, behind one button.
//
// Supply is ambient, not an obligation: the seed rail (your own signals,
// customers and deals), the week's feed (pool headlines, newsletters, build
// signals) and anything the sorter has not laned yet. It used to sit inline
// under the shifts and pushed the work off the screen. Now it opens when you
// want it and stays out of the way when you do not.

export function SupplyDrawer({ open, onClose, mine, unclassified }: {
  open: boolean
  onClose: () => void
  mine: ContentIdeaRow[]
  unclassified: ContentIdeaRow[]
}) {
  return (
    <SlideOver open={open} onClose={onClose} ariaLabel="Supply" label="Supply">
      <div className="flex flex-col gap-6 p-4">
        <section>
          <h3 className="mb-2"><Eyebrow>Seed from your own work</Eyebrow></h3>
          <ContentSeedRail />
        </section>
        <section>
          <h3 className="mb-2"><Eyebrow>What the engine read this week</Eyebrow></h3>
          <FeedRoom ideas={mine} />
        </section>
        {unclassified.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-1.5">
              <Eyebrow>Not yet sorted</Eyebrow>
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-micro tabular-nums">{unclassified.length}</span>
            </h3>
            <p className="mb-2 text-label text-white/45">
              Collected while the sorter was down. These belong in {publicSeriesIdentity('built').label} or {publicSeriesIdentity('paid').label}, they just have not been sorted yet.
            </p>
            <FeedRoom ideas={unclassified} />
          </section>
        )}
      </div>
    </SlideOver>
  )
}
