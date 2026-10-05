/**
 * Subscriptions, phone. One screen, no scroll at 390x844: the money in one
 * band, the Substack line, then every ranked product in priority order with
 * the six Growth numbers as marks (filled: a number, ring: wired but nothing
 * yet, dashed: not wired). Tap a product for its numbers, their sources and
 * its customers; tap a customer for the same sheet as before (draft email,
 * log a call, mark for outreach).
 *
 * Rebuilt 2026-10-05 with the desk (Krish: "10X better visually, and
 * guaranteed no scroll"). The roster, the council, the radar and the sources
 * sit behind "Subscribers" in one sheet instead of a scrolling column.
 *
 * Leads with the same one move as the desk (customers/SubscriptionsMoveHero).
 * A check-in opens the customer's sheet, where Draft email already lives.
 */
import React, { useMemo, useState } from 'react'
import { Mic, Users } from '@/lib/icons'
import { MobileShell as MobileShellPrim, TabHeader, HeaderSubtitleSkeleton, FeedRow } from './primitives'
import { DetailSheet } from './DetailSheet'
import { BottomSheet } from './BottomSheet'
import { Pressable } from '../shared/Pressable'
import { Eyebrow } from '../shared/Eyebrow'
import { Button } from '../ui/button'
import { useHaptics } from '../../hooks/useHaptics'
import { useDictation } from '../../hooks/useDictation'
import { useToast } from '../shared/Toast'
import { PRODUCT_LABEL, KIND_LABEL, KIND_ACCENT, type CustomerRow } from '../../hooks/useCustomers'
import { formatCommittedMrr } from '../../hooks/useRevenue'
import { formatMrr } from '../../lib/mrrDisplay'
import { SubscribersList } from '../customers/SubscribersList'
import { CustomerCouncilCard } from '../CustomerCouncilCard'
import { ExpansionRadar } from '../ExpansionRadar'
import { CustomerSourcesPanel } from '../CustomerSourcesPanel'
import { SubstackImportDropzone } from '../SubstackImportDropzone'
import { PortfolioList, PortfolioDetail } from '../portfolio/PortfolioBoard'
import { useSubscriptionsModel, type SubscriptionsModel } from '../customers/useSubscriptionsModel'
import { SubstackTile } from '../customers/MoneyTiles'
import { SubscriptionsMoveHero } from '../customers/SubscriptionsMoveHero'

function Band({ s }: { s: SubscriptionsModel }) {
  const r = s.revenue
  const cell = (label: string, value: React.ReactNode, testId: string) => (
    <div className="flex min-w-0 flex-col gap-0.5" data-testid={testId}>
      <Eyebrow>{label}</Eyebrow>
      <span className="font-mono text-title font-semibold tabular-nums text-ink">{value}</span>
    </div>
  )
  // Unread is said in words, never as a dash that reads like a figure.
  const none = s.loading ? '…' : <span className="font-sans text-ui font-medium text-ink-faint">Not read</span>
  return (
    <div className="surface grid grid-cols-3 gap-2 rounded-2xl px-3 py-2.5" data-testid="subscriptions-band">
      {cell('30 days', r ? <span className="money-text">{formatMrr(r.collected_30d_net_cents / 100)}</span> : none, 'subscriptions-collected')}
      {cell('MRR', r ? formatCommittedMrr(r) : none, 'subscriptions-mrr')}
      {cell('Paying', r ? r.active_subscriptions : none, 'subscriptions-paying')}
    </div>
  )
}

export function MobileCustomers() {
  const h = useHaptics()
  const { toast } = useToast()
  const s = useSubscriptionsModel()
  const customers = s.customers
  const [openId, setOpenId] = useState<string | null>(null)
  const [product, setProduct] = useState<string | null>(null)
  const [roster, setRoster] = useState(false)
  const [importing, setImporting] = useState(false)
  // Log-a-call sheet: dictation-first quick capture (the sanctioned mobile
  // composition exception). Hook lives at top level; actions only flip state.
  const [logOpen, setLogOpen] = useState(false)
  const [callNote, setCallNote] = useState('')
  const dict = useDictation(t => setCallNote(prev => (prev.trim() ? `${prev.trim()} ${t}` : t)))

  const open = openId ? customers.find(c => c.id === openId) ?? null : null
  const row = product ? s.rows.find(r => r.product.venture === product) ?? null : null
  const rowCustomers = useMemo<CustomerRow[]>(
    () => (row?.product.customerProduct ? customers.filter(c => c.product === row.product.customerProduct).slice(0, 12) : []),
    [row, customers],
  )

  const closeLogSheet = () => {
    if (dict.listening) dict.toggle()
    setLogOpen(false)
  }

  // Async on purpose: Pressable choreographs pending/success/error off the
  // returned promise. Throw on failure so the error state (+ haptic) fires.
  const submitLogCall = async () => {
    if (!open) return
    try {
      const r = await fetch('/api/customer-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: open.id, channel: 'call', summary: callNote.trim() }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
    } catch (e) {
      toast(`Could not log call: ${e instanceof Error ? e.message : 'try again'}`, 'error')
      throw e
    }
    toast('Call logged.', 'success')
    closeLogSheet()
  }

  return (
    <MobileShellPrim
      scroll="none"
      header={
        <TabHeader
          compact
          title="Subscriptions"
          subtitle={s.loading ? <HeaderSubtitleSkeleton w={200} /> : undefined}
          trailing={
            <Button variant="ghost" size="sm" className="tap-44 -mr-2 px-2" onClick={() => { h.select(); setRoster(true) }} aria-label="Subscribers" data-testid="subscriptions-roster-open">
              <Users size={16} aria-hidden />
            </Button>
          }
        />
      }
    >
      {/* Fits 390x844 whole. On a shorter phone the column scrolls rather than
          clipping: the frame contract's backstop, not the layout. The tail
          clears the + button (about 148 screen px, 123 at the 1.2 zoom). */}
      <div className="-mx-5 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+128px)] scrollbar-hide" data-testid="subscriptions-stage">
        <SubscriptionsMoveHero s={s} narrow onOpenProduct={v => { h.select(); setProduct(v) }} onOpenCustomer={id => { h.select(); setOpenId(id) }} />
        <Band s={s} />
        <SubstackTile s={s} compact onImport={() => { h.select(); setImporting(true) }} />
        <PortfolioList rows={s.rows} headline="revenue" onOpen={v => { h.select(); setProduct(v) }} />
      </div>

      <BottomSheet open={row != null && open == null} onClose={() => setProduct(null)} fullHeight={false} ariaLabel={row ? `${row.product.label} detail` : 'Product detail'}>
        <div className="max-h-[calc(80dvh/var(--z,1))] overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
          {row && (
            <PortfolioDetail row={row}>
              {rowCustomers.length > 0 && (
                <div className="flex flex-col gap-1">
                  <Eyebrow>Customers on the ledger</Eyebrow>
                  {rowCustomers.map(c => (
                    <FeedRow
                      key={c.id}
                      dotColor={KIND_ACCENT[c.kind]}
                      title={c.full_name || c.email || 'Customer'}
                      detail={[KIND_LABEL[c.kind], c.plan].filter(Boolean).join(' · ')}
                      onClick={() => { h.select(); setOpenId(c.id) }}
                    />
                  ))}
                </div>
              )}
            </PortfolioDetail>
          )}
        </div>
      </BottomSheet>

      <BottomSheet open={roster} onClose={() => setRoster(false)} ariaLabel="Subscribers">
        <div className="flex h-full flex-col gap-4 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
          <SubscribersList />
          <CustomerCouncilCard />
          <ExpansionRadar />
          <CustomerSourcesPanel />
        </div>
      </BottomSheet>

      <BottomSheet open={importing} onClose={() => setImporting(false)} fullHeight={false} ariaLabel="Import the Substack export">
        <div className="flex flex-col gap-3 px-5 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
          <h2 className="font-display text-title font-semibold text-ink">Import the Substack export</h2>
          <p className="text-body text-ink-muted">Substack has no API, so free readers arrive from its CSV export. Paid subscribers already arrive from Stripe every day.</p>
          <SubstackImportDropzone onImported={() => { s.reloadAudience(); setImporting(false) }} />
        </div>
      </BottomSheet>

      <DetailSheet
        open={open != null && !logOpen}
        onClose={() => setOpenId(null)}
        eyebrow={open ? `${PRODUCT_LABEL[open.product]} · ${KIND_LABEL[open.kind]}` : undefined}
        title={open?.full_name || open?.email || ''}
        body={
          open
            ? [
                open.email ? `Email: ${open.email}` : null,
                open.plan ? `Plan: ${open.plan}` : null,
                typeof open.mrr_usd === 'number' && open.mrr_usd > 0
                  ? `MRR: $${Math.round(open.mrr_usd)}/mo`
                  : null,
                open.source ? `Source: ${open.source}` : null,
                open.signed_up_at ? `Signed up: ${new Date(open.signed_up_at).toLocaleDateString()}` : null,
                open.became_paid_at ? `Became paid: ${new Date(open.became_paid_at).toLocaleDateString()}` : null,
                open.churned_at ? `Churned: ${new Date(open.churned_at).toLocaleDateString()}` : null,
              ].filter(Boolean).join('\n\n')
            : undefined
        }
        docUrl={open?.stripe_customer_id
          ? `https://dashboard.stripe.com/customers/${open.stripe_customer_id}`
          : undefined}
        actions={open ? [
          ...(open.email ? [{
            label: 'Draft email',
            variant: 'primary' as const,
            onClick: async () => {
              h.heavy()
              try {
                const r = await fetch(`/api/customers/${open.id}/draft-email`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ intent: 'check_in' }),
                })
                const body = await r.json().catch(() => ({}))
                if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`)
                h.success()
                toast('Draft created in Gmail.', 'success')
                if (body?.draft_url) {
                  try { window.open(body.draft_url, '_blank', 'noreferrer,noopener') } catch {}
                }
              } catch (e: any) {
                h.error()
                toast(`Could not draft email: ${e?.message || 'try again'}`, 'error')
              }
            },
          }] : []),
          {
            label: 'Log call',
            variant: 'secondary' as const,
            // Sync open: swap the customer sheet for the dictation-first log
            // sheet (never stack; see DetailSheet Enter-key/body-overflow traps).
            onClick: () => { h.select(); setCallNote(''); setLogOpen(true) },
          },
          ...(open.needs_outreach_at ? [] : [{
            label: 'Mark for outreach',
            variant: 'secondary' as const,
            onClick: async () => {
              h.heavy()
              try {
                // Service-role route: the old anon-client update silently
                // matched 0 rows under RLS while the toast claimed success.
                const r = await fetch(`/api/customers/${open.id}/outreach`, { method: 'POST' })
                const body = await r.json().catch(() => ({}))
                if (!r.ok || body?.ok === false) throw new Error(body?.error || `HTTP ${r.status}`)
                h.success()
                toast('Flagged for outreach.', 'success')
              } catch (e: any) {
                h.error()
                toast(`Could not mark: ${e?.message || 'try again'}`, 'error')
              }
            },
          }]),
        ] : []}
      />

      {/* Log-a-call sheet. Replaces the customer sheet while open (openId is
          retained, so Cancel springs it back). Mic leads; the keyboard only
          appears when summoned, or immediately when dictation is unsupported. */}
      <BottomSheet
        open={logOpen && open != null}
        onClose={closeLogSheet}
        fullHeight={false}
        ariaLabel="Log a call"
      >
        <div className="px-5 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
          <div className="pb-4 border-b border-white/[0.06]">
            <p className="text-micro font-bold uppercase tracking-widest text-ink-faint">
              Log a call
            </p>
            <h2 className="text-title font-bold text-ink leading-snug mt-0.5">
              {open?.full_name || open?.email || 'Customer'}
            </h2>
          </div>

          {dict.supported && (
            <button
              type="button"
              onClick={() => { h.select(); dict.toggle() }}
              className={`mt-4 w-full rounded-full border py-3 text-ui font-semibold transition-colors ${
                dict.listening
                  ? 'border-red-400/40 bg-red-400/15 text-red-300'
                  : 'border-sky-400/30 bg-sky-400/10 text-sky-300 active:bg-sky-400/20'
              }`}
            >
              {dict.listening ? 'Listening... tap to stop' : <span className="inline-flex items-center gap-1.5"><Mic size={13} /> Dictate the summary</span>}
            </button>
          )}

          <textarea
            value={callNote}
            onChange={e => setCallNote(e.target.value)}
            rows={4}
            // Summon the keyboard only when the mic cannot lead.
            autoFocus={!dict.supported}
            placeholder="Brief summary of the call"
            className="mt-3 w-full rounded-2xl border border-white/[0.10] bg-white/[0.04] px-4 py-3 text-ui text-ink placeholder:text-ink-faint leading-relaxed resize-none focus:outline-none focus:border-white/25"
          />

          <div className="mt-3 space-y-2.5">
            <Pressable variant="primary" disabled={!callNote.trim()} onPress={submitLogCall}>
              Log it
            </Pressable>
            <Pressable variant="ghost" onPress={closeLogSheet}>
              Cancel
            </Pressable>
          </div>
        </div>
      </BottomSheet>
    </MobileShellPrim>
  )
}
