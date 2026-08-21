import React, { useMemo, useState } from 'react'
import { MobileShell as MobileShellPrim, TabHeader,
  HeaderSubtitleSkeleton, HeroCard, StatPill, FeedCard, FeedRow, EmptyState, MobileLoadingScreen } from './primitives'
import { DetailSheet } from './DetailSheet'
import { BottomSheet } from './BottomSheet'
import { Pressable } from '../shared/Pressable'
import { useHaptics } from '../../hooks/useHaptics'
import { useDictation } from '../../hooks/useDictation'
import { useToast } from '../shared/Toast'
import { supabase } from '../../lib/supabase'
import {
  useCustomers, PRODUCT_LABEL, PRODUCT_ACCENT, KIND_LABEL, KIND_ACCENT,
  type CustomerRow, type CustomerProduct,
} from '../../hooks/useCustomers'
import { MrrTicker } from '../MrrTicker'
import { CustomerCouncilCard } from '../CustomerCouncilCard'
import { ExpansionRadar } from '../ExpansionRadar'
import { CustomerSourcesPanel } from '../CustomerSourcesPanel'
import { SubscriptionsWatchHero } from '../customers/SubscriptionsWatchHero'
import { SubscribersList } from '../customers/SubscribersList'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useFocusMode, isFocusModeEnabled } from '../../hooks/useFocusMode'
import { FocusLanes, FocusModeToggle } from '../focus/FocusLanes'

export function MobileCustomers() {
  const h = useHaptics()
  const { toast } = useToast()
  const { customers, buckets, totals, loading, error } = useCustomers()
  const [openId, setOpenId] = useState<string | null>(null)
  // Log-a-call sheet: dictation-first quick capture (the sanctioned mobile
  // composition exception). Hook lives at top level; actions only flip state.
  const [logOpen, setLogOpen] = useState(false)
  const [callNote, setCallNote] = useState('')
  const dict = useDictation(t => setCallNote(prev => (prev.trim() ? `${prev.trim()} ${t}` : t)))
  const { mode, setMode } = useFocusMode()
  const { today: focusToday } = useDailyFocus()
  const calibrated = focusToday?.status === 'calibrated' || focusToday?.status === 'complete'

  // Hero priority: newest paid customer in the last 7 days (celebration)
  // → newest churn in last 7 days (alert) → null.
  const hero = useMemo(() => {
    const now = Date.now()
    const within7d = (iso?: string | null) => iso && now - new Date(iso).getTime() < 7 * 86_400_000
    const recentPaid = customers
      .filter(c => c.kind === 'paid' && within7d(c.became_paid_at || c.created_at))
      .sort((a, b) => new Date(b.became_paid_at || b.created_at).getTime() - new Date(a.became_paid_at || a.created_at).getTime())[0]
    if (recentPaid) return { row: recentPaid, mode: 'paid' as const }
    const recentChurn = customers
      .filter(c => c.kind === 'churned' && within7d(c.churned_at))
      .sort((a, b) => new Date(b.churned_at!).getTime() - new Date(a.churned_at!).getTime())[0]
    if (recentChurn) return { row: recentChurn, mode: 'churned' as const }
    return null
  }, [customers])

  const open = openId ? customers.find(c => c.id === openId) ?? null : null

  // Mirrors DesktopCustomers expansion-plays selection.
  const expansionPlays = useMemo(() => {
    const now = Date.now()
    return customers
      .filter(c => c.kind === 'paid' && c.needs_outreach_at && new Date(c.needs_outreach_at).getTime() <= now)
      .filter(c => {
        if (!c.last_emailed_at) return true
        const ageDays = (now - new Date(c.last_emailed_at).getTime()) / (24 * 60 * 60 * 1000)
        return ageDays >= 7
      })
      .sort((a, b) => (b.mrr_usd || 0) - (a.mrr_usd || 0))
  }, [customers])

  // Full Focus Mode (Phase 3): when enabled and the day is calibrated, the
  // product-grouped roster regroups into the 3 daily-target lanes via
  // relevance_index (table 'customers'). visibleCustomers is the same flat set
  // of rows the grouped FeedCards render (each bucket's `recent`), and one
  // uniform row renderer feeds both the lanes and the muted set.
  const visibleCustomers = useMemo<CustomerRow[]>(() => {
    return buckets
      .filter(b => b.total > 0)
      .sort((a, b) => b.paid - a.paid || b.total - a.total)
      .flatMap(b => b.recent)
  }, [buckets])

  const showFocus = isFocusModeEnabled() && !!calibrated && mode === 'focus'
  const renderCustomerRow = (c: CustomerRow) => (
    <FeedRow
      dotColor={KIND_ACCENT[c.kind]}
      title={c.full_name || c.email || 'Customer'}
      detail={[KIND_LABEL[c.kind], c.plan].filter(Boolean).join(' · ')}
      trailing={
        typeof c.mrr_usd === 'number' && c.mrr_usd > 0 ? (
          <span className="text-ui tabular-nums text-emerald-300">
            ${Math.round(c.mrr_usd)}
          </span>
        ) : null
      }
      onClick={() => { h.select(); setOpenId(c.id) }}
    />
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

  if (loading && customers.length === 0) {
    return <MobileLoadingScreen title="Subscriptions" subtitle="Gathering subscriptions…" />
  }

  return (
    <MobileShellPrim
      header={
        <TabHeader
          title="Subscriptions"
          subtitle={
            loading
              ? <HeaderSubtitleSkeleton w={200} />
              : totals.paid > 0
                ? `${totals.paid} paid · $${Math.round(totals.mrrUsd).toLocaleString()}/mo`
                : 'No paid customers yet; sweep + Stripe webhooks not wired.'
          }
        />
      }
    >
      <SubscriptionsWatchHero
        expansionPlays={expansionPlays}
        totals={{ mrrUsd: totals.mrrUsd, paid: totals.paid }}
        onOpen={(c) => { h.select(); setOpenId(c.id) }}
      />

      <MrrTicker variant="mobile" />
      <SubscribersList />
      <CustomerCouncilCard />
      <ExpansionRadar />
      <CustomerSourcesPanel />
      {hero && (
        <HeroCard
          eyebrow={hero.mode === 'paid' ? 'New paid customer' : 'Recent churn'}
          accent={hero.mode === 'paid' ? 'emerald' : 'red'}
          dotColor={hero.mode === 'paid' ? 'bg-emerald-400' : 'bg-red-400'}
          title={hero.row.full_name || hero.row.email || 'Customer'}
          detail={[PRODUCT_LABEL[hero.row.product], hero.row.plan].filter(Boolean).join(' · ')}
          meta={
            hero.mode === 'paid' && typeof hero.row.mrr_usd === 'number' && hero.row.mrr_usd > 0
              ? `$${Math.round(hero.row.mrr_usd)}/mo added`
              : hero.mode === 'churned'
                ? 'Investigate: Marcus can pull last-7-day context'
                : undefined
          }
          cta="Open"
          onClick={() => { h.select(); setOpenId(hero.row.id) }}
        />
      )}

      <div className="flex gap-3 flex-shrink-0">
        <StatPill label="Paid"  value={totals.paid}                                       color={totals.paid > 0 ? 'text-emerald-300' : 'text-white/45'} />
        <StatPill label="MRR"   value={`$${Math.round(totals.mrrUsd).toLocaleString()}`}  color={totals.mrrUsd > 0 ? 'text-emerald-300' : 'text-white/45'} />
        <StatPill label="Free"  value={totals.freeSignups}                                color={totals.freeSignups > 0 ? 'text-violet-300' : 'text-white/45'} />
        <StatPill label="Wait"  value={totals.waitlist}                                   color={totals.waitlist > 0 ? 'text-amber-300' : 'text-white/45'} />
      </div>

      {error && (
        <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-5 text-lede text-red-200">
          {error}
        </div>
      )}

      {customers.length === 0 && !loading && !error && (
        <EmptyState label="No customers yet. Apply the customers migration and activate the Maya sweeper." />
      )}

      {isFocusModeEnabled() && calibrated && (
        <div className="flex items-center justify-end -mt-1">
          <FocusModeToggle mode={mode} onChange={setMode} />
        </div>
      )}

      {showFocus ? (
        <FeedCard title="Subscriptions, by focus">
          <FocusLanes
            rows={visibleCustomers}
            table="customers"
            keyOf={c => String(c.id)}
            renderItem={renderCustomerRow}
            fallback={null}
            mutedLabel="Off focus"
          />
        </FeedCard>
      ) : (
        buckets
        .filter(b => b.total > 0)
        .sort((a, b) => b.paid - a.paid || b.total - a.total)
        .map(b => (
          <FeedCard
            key={b.product}
            title={`${PRODUCT_LABEL[b.product]} · ${b.total}`}
          >
            <div className="px-7 pt-3 pb-2 flex items-center gap-4 text-ui">
              {b.paid > 0 && (
                <span className="text-emerald-300 tabular-nums">
                  {b.paid} paid
                </span>
              )}
              {b.mrrUsd > 0 && (
                <span className="text-emerald-300 tabular-nums">
                  ${Math.round(b.mrrUsd).toLocaleString()}/mo
                </span>
              )}
              {b.freeSignups > 0 && (
                <span className="text-violet-300 tabular-nums">{b.freeSignups} free</span>
              )}
              {b.waitlist > 0 && (
                <span className="text-amber-300 tabular-nums">{b.waitlist} waitlist</span>
              )}
              {b.churned > 0 && (
                <span className="text-red-300 tabular-nums">{b.churned} churn</span>
              )}
            </div>
            {b.recent.map(c => (
              <FeedRow
                key={c.id}
                dotColor={KIND_ACCENT[c.kind]}
                title={c.full_name || c.email || 'Customer'}
                detail={[KIND_LABEL[c.kind], c.plan].filter(Boolean).join(' · ')}
                trailing={
                  typeof c.mrr_usd === 'number' && c.mrr_usd > 0 ? (
                    <span className="text-ui tabular-nums text-emerald-300">
                      ${Math.round(c.mrr_usd)}
                    </span>
                  ) : null
                }
                onClick={() => { h.select(); setOpenId(c.id) }}
              />
            ))}
          </FeedCard>
        ))
      )}

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
            <p className="text-micro font-bold uppercase tracking-widest text-white/45">
              Log a call
            </p>
            <h2 className="text-title font-bold text-white leading-snug mt-0.5">
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
              {dict.listening ? 'Listening... tap to stop' : '🎙 Dictate the summary'}
            </button>
          )}

          <textarea
            value={callNote}
            onChange={e => setCallNote(e.target.value)}
            rows={4}
            // Summon the keyboard only when the mic cannot lead.
            autoFocus={!dict.supported}
            placeholder="Brief summary of the call"
            className="mt-3 w-full rounded-2xl border border-white/[0.10] bg-white/[0.04] px-4 py-3 text-ui text-white placeholder:text-white/35 leading-relaxed resize-none focus:outline-none focus:border-white/25"
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
