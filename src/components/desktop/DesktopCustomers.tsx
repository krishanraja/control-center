/**
 * Subscriptions, desk. One screen, no scroll: the money in four figures, the
 * Substack on its own line, then every ranked product in priority order with
 * the same six numbers Growth shows (src/components/portfolio/PortfolioBoard),
 * and what to wire next.
 *
 * Rebuilt 2026-10-05 (Krish: "make that tab look 10X better visually, and
 * guaranteed no scroll"). The old tab stacked nine panels in a scrolling
 * column. The roster, the customer council, the expansion radar and the
 * revenue sources now open from the header in one side panel, so nothing was
 * lost, only moved off the stage. Still a read-only watch (charter
 * 2026-06-17): the only writes are Sync now, the Substack import and a Gmail
 * draft of a check-in (never a send).
 *
 * Leads with one move since 2026-10-05 (Growth's standard): a paying customer
 * waiting on a check-in, else a stale Stripe read, else the first number to
 * wire. It replaced a "Reach out" box and the wiring list sitting side by side
 * at the foot of the screen with equal weight, so the one thing to do was the
 * last thing read.
 */
import { useMemo, useState } from 'react'
import { RefreshCw, Users, Upload } from '@/lib/icons'
import { SurfaceHeader } from '../shared/SurfaceHeader'
import { Eyebrow } from '../shared/Eyebrow'
import { SlideOver } from '../shared/SlideOver'
import { Modal } from '../shared/Modal'
import { Skeleton } from '../shared/Skeleton'
import { Working } from '../shared/Working'
import { useToast } from '../shared/Toast'
import { Button } from '../ui/button'
import { CustomerCard } from '../CustomerCard'
import { SubscribersList } from '../customers/SubscribersList'
import { CustomerCouncilCard } from '../CustomerCouncilCard'
import { ExpansionRadar } from '../ExpansionRadar'
import { CustomerSourcesPanel } from '../CustomerSourcesPanel'
import { SubstackImportDropzone } from '../SubstackImportDropzone'
import { syncAgeLabel } from '../MrrTicker'
import { PortfolioTable, PortfolioDetail, WireNext } from '../portfolio/PortfolioBoard'
import { useSubscriptionsModel } from '../customers/useSubscriptionsModel'
import { SubscriptionsMoveHero, useSubscriptionsMove } from '../customers/SubscriptionsMoveHero'
import { AppFrame } from '../shared/AppFrame'
import { MoneyTiles, SubstackTile } from '../customers/MoneyTiles'

export function DesktopCustomers() {
  const s = useSubscriptionsModel()
  const { move } = useSubscriptionsMove(s)
  const { toast } = useToast()
  const [open, setOpen] = useState<string | null>(null)
  const [roster, setRoster] = useState(false)
  const [importing, setImporting] = useState(false)
  const row = open ? s.rows.find(r => r.product.venture === open) ?? null : null
  const rowCustomers = useMemo(
    () => (row?.product.customerProduct ? s.customers.filter(c => c.product === row.product.customerProduct).slice(0, 12) : []),
    [row, s.customers],
  )

  const runSync = async () => {
    const err = await s.syncNow()
    if (err) toast(`Stripe sync: ${err}`, 'error')
    else toast('Stripe synced. Revenue and subscribers are current.', 'success')
  }

  const meta = s.revenue ? (
    <span className={`text-label ${s.behind ? 'text-amber-300' : 'text-ink-faint'}`}>
      {s.behind && s.ageHours != null ? 'Stripe is behind: ' : 'Stripe '}{syncAgeLabel(s.ageHours)}
    </span>
  ) : null

  // One frame: the title and the one move are chrome, the money, the board
  // and the rest of the wiring scroll under them. The ⌘I / ⌘/ pills are
  // reserved INSIDE the scroller (`capturePills`), so the board reaches the
  // bottom of the screen instead of stopping 96px short of it.
  const leadIsWire = move?.kind === 'wire'
  const rest = leadIsWire ? s.gaps.slice(1) : s.gaps

  return (
    <div className="h-full min-h-0" data-testid="subscriptions-tab">
    <AppFrame
      capturePills
      bodyTestId="subscriptions-stage"
      header={
        <div className="flex flex-col gap-4 pb-4">
          <SurfaceHeader
            title="Subscriptions"
            description={s.loading ? <Skeleton h={12} w={320} r={4} className="mt-1" /> : <span data-testid="subscriptions-summary">{s.summary}</span>}
            meta={meta}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setRoster(true)} data-testid="subscriptions-roster-open">
                  <Users size={14} aria-hidden /> Subscribers
                </Button>
                <Button variant="outline" size="sm" onClick={() => { void runSync() }} disabled={s.syncing} title="Pull Stripe now">
                  {s.syncing ? <Working size={12} /> : <RefreshCw size={14} aria-hidden />} {s.syncing ? 'Syncing' : 'Sync now'}
                </Button>
              </div>
            }
          />
          <SubscriptionsMoveHero s={s} onOpenProduct={setOpen} />
        </div>
      }
    >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-5 gap-3">
            <MoneyTiles s={s} />
            <SubstackTile s={s} onImport={() => setImporting(true)} />
          </div>

          {s.loading && s.rows.every(r => r.cells.aeo.state !== 'live') && s.customers.length === 0
            ? <Skeleton h={360} r={16} />
            : <PortfolioTable rows={s.rows} onOpen={setOpen} emphasis={['signups', 'revenue']} />}

          {/* The first gap is the move above when nothing outranks it, so this
              list starts at the second and says so. */}
          {rest.length > 0 && (
            <div className="surface rounded-2xl px-4 py-3">
              <WireNext gaps={rest} onOpen={setOpen} title={leadIsWire ? 'After that, in priority order' : undefined} />
            </div>
          )}
        </div>
    </AppFrame>

      <SlideOver open={row != null} onClose={() => setOpen(null)} ariaLabel={row ? `${row.product.label} detail` : 'Product detail'} label="Product">
        {row && (
          <PortfolioDetail row={row}>
            {rowCustomers.length > 0 && (
              <div className="flex flex-col gap-2">
                <Eyebrow>Customers on the ledger</Eyebrow>
                {rowCustomers.map(c => <CustomerCard key={c.id} customer={c} />)}
              </div>
            )}
          </PortfolioDetail>
        )}
      </SlideOver>

      <SlideOver open={roster} onClose={() => setRoster(false)} ariaLabel="Subscribers" label="Subscribers">
        <div className="flex flex-col gap-4">
          <SubscribersList />
          <CustomerCouncilCard />
          <ExpansionRadar />
          <CustomerSourcesPanel />
        </div>
      </SlideOver>

      <Modal open={importing} onClose={() => setImporting(false)} title="Import the Substack export" description="Substack has no API, so free readers arrive from its CSV export. Paid subscribers already arrive from Stripe every day.">
        <div className="flex flex-col gap-3">
          <SubstackImportDropzone onImported={() => { s.reloadAudience(); setImporting(false) }} />
          <p className="flex items-center gap-1.5 text-label text-ink-faint"><Upload size={12} aria-hidden /> In Substack, open Subscribers and choose Export.</p>
        </div>
      </Modal>
    </div>
  )
}
