/**
 * Growth, Numbers: the ranked products first. The same board, built by the
 * same function from the same rows, as the one on Subscriptions, so Heartside
 * and Full Time read the same on both tabs. Growth lifts the finding columns
 * (AEO / GEO, analytics, growth hacks); Subscriptions lifts sign-ups and
 * revenue. The order of the columns never changes.
 */
import { useState } from 'react'
import { Eyebrow } from '../shared/Eyebrow'
import { usePortfolio } from '../../hooks/usePortfolio'
import { PortfolioDetail, PortfolioList, PortfolioTable, WireNext } from '../portfolio/PortfolioBoard'
import { Overlay } from './bits'
import { ListenerGoal } from './ListenerGoal'
import { LISTENER_PRODUCT, countPilotListeners } from '../../lib/pilotListeners'
import type { Layout } from './NextView'
import type { GrowthTabModel } from './useGrowthTab'

export function PortfolioSection({ m, mobile, layout }: { m: GrowthTabModel; mobile: boolean; layout: Layout }) {
  const p = usePortfolio({ signals: m.signals.products, reviews: m.g.reviews, loading: m.loading })
  const [open, setOpen] = useState<string | null>(null)
  const row = open ? p.rows.find(r => r.product.venture === open) ?? null : null
  const desk = layout === 'wide' || layout === 'xwide'
  // Full Time's target and its count, from the same board row the table shows.
  const ft = p.rows.find(r => r.product.goal && r.product.customerProduct === LISTENER_PRODUCT) ?? null
  const listenerGoal = ft?.product.goal && !p.listenerSync.loading
    ? { target: ft.product.goal.target, count: countPilotListeners(p.customers) }
    : null
  return (
    <section id="growth-numbers-portfolio" className="surface flex scroll-mt-4 flex-col gap-4 rounded-3xl p-5" data-testid="growth-numbers-portfolio">
      <div className="flex flex-wrap items-baseline gap-3">
        <Eyebrow className="flex-1">Products, in priority order</Eyebrow>
        <span className="text-label text-ink-muted">The same six numbers as Subscriptions</span>
      </div>
      {listenerGoal && (
        <ListenerGoal
          count={listenerGoal.count}
          target={listenerGoal.target}
          sync={p.listenerSync.state}
          siteAction={m.web.data?.properties.find(w => w.prefix === 'fulltime')?.action ?? null}
        />
      )}
      {desk
        ? <PortfolioTable rows={p.rows} onOpen={setOpen} emphasis={['aeo', 'analytics', 'hacks']} />
        : <PortfolioList rows={p.rows} onOpen={setOpen} headline="aeo" />}
      <div className="border-t border-white/[0.08] pt-4">
        <WireNext gaps={p.gaps} onOpen={setOpen} />
      </div>
      <Overlay open={row != null} onClose={() => setOpen(null)} label={row ? `${row.product.label}, six numbers` : 'Product'} mobile={mobile}>
        {row && <PortfolioDetail row={row} />}
      </Overlay>
    </section>
  )
}
