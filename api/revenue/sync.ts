import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'

// Pull revenue from Stripe. GET on a cron, POST as an on-demand backstop (the
// dashboard cookie is enough for POST, see guardCronRoute, which is what the
// "Sync now" control on the Subscriptions tab uses).
// Shape follows api/feed/ingest.ts (Bearer $CRON_SECRET, service-role writes).
//
// PULL, NOT WEBHOOK, and it stays that way. The original reason was that
// `system_config.stripe_webhook_signing_secrets` was unarmed, so webhooks into
// `customers` were processed unverified. That is fixed elsewhere now
// (./webhook.ts verifies and fails closed; the n8n intake no longer falls
// through), but the pull remains the ONE writer of revenue_events and
// revenue_subscriptions, because two writers of the same truth is how the repo
// ended up with five incompatible MRR sums. A verified webhook is accepted and
// audited; this route is what reconciles the money.
//
// A pull also backfills all history in one run and is idempotent on the
// balance-transaction id, so re-running it can never double count.
//
// NO DATE WINDOW AND NO PAGE CAP, deliberately. A 2026-10-05 audit reported a
// third of the history missing ("$1,244.00 across 20 charges" in Stripe against
// "$842.56 across 9 payments" recorded). There was no missing history: 11 of
// those 20 charge objects FAILED, and $1,244.00 was 111,500 AUD cents added to
// 12,900 USD cents as though currency did not matter. The nine real payments
// reconcile exactly, $911.45 gross and $842.56 net.
// `npx tsx scripts/stripe-reconcile.mts` prints that comparison per account so
// the next version of that question is answered by a measurement.
//
// Balance transactions are the grain because they settle the FEES. The charge
// object alone does not tell you what landed after Stripe's cut and Substack's
// 10% application fee.
//
// This route also keeps the `customers` ledger honest. The n8n "Stripe
// Reconciliation | Nightly" workflow used to do that, and it has errored on
// every run since its Full Time account key expired, which froze the roster on
// the Subscriptions tab at whatever the last webhook wrote. The same
// reconciliation now runs here, off the subscriptions this route already
// pulls, so the roster and the money are refreshed by the same daily tick.

// The five accounts, the one org key that reads them all, and how to
// authenticate against each, live in api/_stripe.ts. This route used to
// hardcode two of them, which is why Full Time, Legibility and Heartside could
// never appear here however much they earned.
import { configuredStripeAccounts, stripeHeaders, STRIPE_ACCOUNTS, STRIPE_BASE, type StripeAuth } from '../_stripe.js'

type Json = Record<string, any>

async function stripeGet(auth: StripeAuth, path: string, params: Record<string, string | number> = {}): Promise<Json> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) qs.append(k, String(v))
  const r = await fetch(`${STRIPE_BASE}${path}?${qs}`, { headers: stripeHeaders(auth) })
  if (!r.ok) throw new Error(`Stripe ${r.status} on ${path}: ${(await r.text()).slice(0, 200)}`)
  return r.json() as Promise<Json>
}

/**
 * Every page. `has_more` is the only stop condition that is safe: a page cap
 * alone silently truncates history, and a date window silently drops the start
 * of it. There is no `created` filter here on purpose, so the pull is the whole
 * ledger every time and stays idempotent on the balance-transaction id.
 */
async function stripeList(auth: StripeAuth, path: string, params: Record<string, string | number> = {}): Promise<Json[]> {
  const out: Json[] = []
  let starting_after: string | undefined
  for (let page = 0; page < 1000; page++) {
    const p: Record<string, string | number> = { ...params, limit: 100 }
    if (starting_after) p.starting_after = starting_after
    const res = await stripeGet(auth, path, p)
    const data = (res.data || []) as Json[]
    out.push(...data)
    if (!res.has_more || data.length === 0) return out
    starting_after = data[data.length - 1].id
  }
  // 100,000 rows in and Stripe still says there is more: report it rather than
  // return a truncated ledger that would read as a complete one.
  throw new Error(`${path}: more than 100000 rows, pull aborted rather than truncated`)
}

// No local FX table, on purpose. Stripe settles every balance transaction into
// the account's own currency and reports the `exchange_rate` it used, so
// `amount` and `net` are already settled. Converting again would double-count.
// What settlement loses is what the customer actually paid (A$1,000 arrives as
// US$701.30 with no trace), so the presented amount is carried separately.

/** Normalise a subscription price to one month, in its own currency. */
export function monthlyCents(unitAmount: number, interval: string | null, intervalCount: number, quantity: number): number | null {
  if (!Number.isFinite(unitAmount) || !interval) return null
  const n = Math.max(1, intervalCount || 1)
  const total = unitAmount * Math.max(1, quantity || 1)
  switch (interval) {
    case 'month': return Math.round(total / n)
    case 'year':  return Math.round(total / (12 * n))
    case 'week':  return Math.round((total * 52) / (12 * n))
    case 'day':   return Math.round((total * 365) / (12 * n))
    default:      return null
  }
}

/** Stripe ids arrive either as a string or, when expanded, as the object. */
function idOf(v: unknown): string | null {
  if (!v) return null
  if (typeof v === 'string') return v
  if (typeof v === 'object' && typeof (v as Json).id === 'string') return (v as Json).id
  return null
}

/**
 * Which subscription an invoice belongs to, on either side of Stripe's
 * 2025-03-31 ("basil") API version. Before it, `invoice.subscription` and
 * `charge.invoice` were plain fields. After it, the subscription moved to
 * `invoice.parent.subscription_details.subscription`, and the invoice is linked
 * to its charge only through `invoice.payments`. This account is pinned past
 * that line, which is why every subscription charge in the ledger read as a
 * one-off payment until this mapping was widened.
 */
export function invoiceSubscriptionId(inv: Json): string | null {
  return idOf(inv?.parent?.subscription_details?.subscription) ?? idOf(inv?.subscription)
}

export interface InvoiceLinks {
  byInvoice: Map<string, string>
  byCharge: Map<string, string>
  byPaymentIntent: Map<string, string>
}

export function linkInvoices(invoices: Json[]): InvoiceLinks {
  const links: InvoiceLinks = { byInvoice: new Map(), byCharge: new Map(), byPaymentIntent: new Map() }
  for (const inv of invoices) {
    const sid = invoiceSubscriptionId(inv)
    if (!sid) continue
    if (inv.id) links.byInvoice.set(String(inv.id), sid)
    const charge = idOf(inv.charge)
    if (charge) links.byCharge.set(charge, sid)
    const pi = idOf(inv.payment_intent)
    if (pi) links.byPaymentIntent.set(pi, sid)
    const payments = Array.isArray(inv.payments?.data) ? inv.payments.data as Json[] : []
    for (const p of payments) {
      const pay = (p.payment || {}) as Json
      const c = idOf(pay.charge)
      if (c) links.byCharge.set(c, sid)
      const i = idOf(pay.payment_intent)
      if (i) links.byPaymentIntent.set(i, sid)
    }
  }
  return links
}

/**
 * Resolve the subscription behind a charge. Tries every link Stripe exposes,
 * then falls back on the description Stripe itself writes on subscription
 * invoices ("Subscription creation" / "Subscription update") when the customer
 * has exactly one subscription that predates the charge. Returns null when the
 * charge genuinely is a one-off.
 */
export function resolveSubscription(
  src: Json,
  links: InvoiceLinks,
  subsByCustomer: Map<string, Json[]>,
  occurredAtSec: number,
): string | null {
  const invoice = idOf(src.invoice)
  if (invoice && links.byInvoice.has(invoice)) return links.byInvoice.get(invoice)!
  const charge = idOf(src.id)
  if (charge && links.byCharge.has(charge)) return links.byCharge.get(charge)!
  const pi = idOf(src.payment_intent)
  if (pi && links.byPaymentIntent.has(pi)) return links.byPaymentIntent.get(pi)!

  const descr = String(src.description || '')
  if (!/^Subscription (creation|update)/i.test(descr)) return null
  const customer = idOf(src.customer)
  if (!customer) return null
  const candidates = (subsByCustomer.get(customer) || [])
    .filter(s => Number(s.created || 0) <= occurredAtSec + 60)
    .sort((a, b) => Number(b.created || 0) - Number(a.created || 0))
  return candidates.length ? String(candidates[0].id) : null
}

// ── customers ledger ────────────────────────────────────────────────────────

const KNOWN_PRODUCTS = new Set([
  'gutted', 'onalert', 'merciless', 'fractionl_circle', 'fractionl_pulse',
  'mm_ctrl', 'legibility', 'full_time', 'mindmake', 'publication', 'heartside',
])

/** The price map keeps a few spellings the enum never had. */
const PRODUCT_ALIASES: Record<string, string> = { mindmaker: 'mindmake' }

export function normaliseProduct(p: unknown): string | null {
  if (typeof p !== 'string' || !p) return null
  const v = PRODUCT_ALIASES[p] || p
  return KNOWN_PRODUCTS.has(v) ? v : null
}

/** Stripe subscription status -> customers.kind. */
export function kindForStatus(status: string): 'paid' | 'trial' | 'churned' {
  if (status === 'active' || status === 'past_due') return 'paid'
  if (status === 'trialing') return 'trial'
  return 'churned'
}

async function loadPriceMap(): Promise<Record<string, string>> {
  const { data } = await supabase.from('system_config').select('value').eq('key', 'stripe_price_product_map').maybeSingle()
  const raw = (data as Json | null)?.value
  if (!raw) return {}
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {}
  } catch {
    return {}
  }
}

interface SubRow {
  id: string
  stripe_account: string
  customer_id: string | null
  product: string | null
  status: string
  interval: string | null
  interval_count: number
  unit_amount_cents: number
  quantity: number
  currency: string
  mrr_cents: number | null
  mrr_usd_cents: number | null
  current_period_end: string | null
  canceled_at: string | null
  raw: Json
  synced_at: string
}

/**
 * One customers row per (product, Stripe customer), carrying that customer's
 * most relevant subscription: a live one over a dead one, then the newest.
 * Matches the unique index the ledger already has, and the key the retired
 * n8n reconciliation upserted on.
 */
export function pickLedgerSubscription(subs: SubRow[]): SubRow {
  const live = (s: SubRow) => s.status === 'active' || s.status === 'past_due' || s.status === 'trialing'
  return [...subs].sort((a, b) => {
    const l = Number(live(b)) - Number(live(a))
    if (l) return l
    return Number(b.raw?.created || 0) - Number(a.raw?.created || 0)
  })[0]
}

/** The price (or its legacy `plan` mirror) a subscription is billed on. */
export function priceOf(s: SubRow): Json {
  return s.raw?.items?.data?.[0]?.price || s.raw?.plan || {}
}

/**
 * Which product a subscription belongs to: its price id first, then its product
 * id, then the account default for an account that sells exactly one thing.
 * Returns null when nothing claims it, so the report can NAME the unmapped
 * price instead of filing the money under a guess.
 */
export function resolveProduct(
  s: SubRow,
  priceMap: Record<string, string>,
  accountDefault: string | null = null,
): string | null {
  const price = priceOf(s)
  return normaliseProduct(priceMap[String(price.id)])
    ?? normaliseProduct(priceMap[String(price.product)])
    ?? normaliseProduct(accountDefault)
}

/**
 * Stamp `product` on every subscription row BEFORE it is written.
 *
 * This used to happen inside reconcileCustomers, which runs AFTER the
 * `revenue_subscriptions` upsert, so the column was written null on every row
 * and then set on an in-memory object nobody saved again. Measured on
 * production 2026-10-05: all six rows in `revenue_subscriptions` had
 * `product = null` while `customers` had them attributed, so the two tables
 * disagreed about the same subscription and only one of them could be read.
 */
export function assignProducts(
  subRows: SubRow[],
  priceMap: Record<string, string>,
  accountDefault: string | null = null,
): { unmapped: string[] } {
  const unmapped = new Set<string>()
  for (const s of subRows) {
    const product = resolveProduct(s, priceMap, accountDefault)
    s.product = product
    if (!product) {
      const price = priceOf(s)
      unmapped.add(`${String(price.id || price.product || s.id)} ${String(price.nickname || '')}`.trim())
    }
  }
  return { unmapped: [...unmapped] }
}

async function reconcileCustomers(subRows: SubRow[]): Promise<{ upserted: number }> {
  const groups = new Map<string, SubRow[]>()
  for (const s of subRows) {
    // Products are already stamped by assignProducts, before the write above.
    if (!s.customer_id || !s.product) continue
    groups.set(`${s.product}|${s.customer_id}`, [...(groups.get(`${s.product}|${s.customer_id}`) || []), s])
  }
  if (groups.size === 0) return { upserted: 0 }

  const subIds = subRows.map(s => s.id)
  const custIds = [...new Set(subRows.map(s => s.customer_id).filter(Boolean))] as string[]
  const { data: existingRows, error: readErr } = await supabase
    .from('customers')
    .select('id, product, stripe_customer_id, stripe_subscription_id, email, full_name, mrr_usd, became_paid_at')
    .or(`stripe_subscription_id.in.(${subIds.join(',')}),stripe_customer_id.in.(${custIds.join(',')})`)
  if (readErr) throw new Error(`customers read: ${readErr.message}`)
  const existing = (existingRows || []) as Json[]

  let upserted = 0
  const now = new Date().toISOString()
  for (const [, subs] of groups) {
    const s = pickLedgerSubscription(subs)
    const cust = (s.raw?.customer && typeof s.raw.customer === 'object' ? s.raw.customer : {}) as Json
    const price = priceOf(s)
    const kind = kindForStatus(s.status)
    const row = existing.find(r => subs.some(x => x.id === r.stripe_subscription_id))
      || existing.find(r => r.product === s.product && r.stripe_customer_id === s.customer_id)

    const endedAt = s.canceled_at
      || (s.raw?.ended_at ? new Date(Number(s.raw.ended_at) * 1000).toISOString() : null)
    const payload: Json = {
      product: s.product,
      kind,
      email: cust.email || row?.email || null,
      full_name: cust.name || row?.full_name || null,
      stripe_customer_id: s.customer_id,
      stripe_subscription_id: s.id,
      plan: price.nickname || `${(Number(price.unit_amount ?? 0) / 100).toFixed(2)} ${String(s.currency).toUpperCase()} / ${s.interval || 'once'}`,
      // Settled USD when we have it. A non-USD plan with no settled figure keeps
      // whatever the row already carried rather than being zeroed.
      mrr_usd: s.mrr_usd_cents != null ? s.mrr_usd_cents / 100 : (row?.mrr_usd ?? null),
      became_paid_at: s.raw?.start_date ? new Date(Number(s.raw.start_date) * 1000).toISOString() : (row?.became_paid_at ?? null),
      churned_at: kind === 'churned' ? endedAt || now : null,
      source: 'stripe_sync',
      attribution_confidence: 'reconciled',
      updated_at: now,
    }
    if (row) {
      const { error } = await supabase.from('customers').update(payload).eq('id', row.id)
      if (error) throw new Error(`customers update ${row.id}: ${error.message}`)
    } else {
      const { error } = await supabase.from('customers').insert({ ...payload, signed_up_at: payload.became_paid_at })
      if (error) throw new Error(`customers insert ${s.id}: ${error.message}`)
    }
    upserted += 1
  }
  return { upserted }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (guardCronRoute(req, res)) return

  const configured = configuredStripeAccounts()
  if (configured.length === 0) {
    return res.status(200).json({
      ok: true,
      skipped: 'no Stripe key configured. Set STRIPE_ORG_KEY to read all five accounts with one credential, '
        + `or a per-account key (${STRIPE_ACCOUNTS.map(a => a.legacyEnvVar).filter(Boolean).join(', ')}).`,
    })
  }

  const report: Json[] = []
  const priceMap = await loadPriceMap()

  try {
    // One account failing (an expired key, say) must not stop the others:
    // the Full Time key expiring is exactly what froze the old n8n
    // reconciliation for every product at once.
    const failures: string[] = []
    for (const { account: acct, auth } of configured) {
      const account = acct.key
      try {
      const syncedAt = new Date().toISOString()

      // ── subscriptions: the ONLY source of MRR ─────────────────────────────
      // The customer is expanded so the ledger below gets an email and a name
      // without a request per subscriber.
      const subs = await stripeList(auth, '/subscriptions', { status: 'all', 'expand[]': 'data.customer' })
      const subsByCustomer = new Map<string, Json[]>()
      for (const s of subs) {
        const c = idOf(s.customer)
        if (c) subsByCustomer.set(c, [...(subsByCustomer.get(c) || []), s])
      }
      const subRows: SubRow[] = subs.map(s => {
        const item = s.items?.data?.[0] || {}
        const price = item.price || s.plan || {}
        const currency = String(price.currency || s.currency || 'usd')
        const unit = Number(price.unit_amount ?? price.amount ?? 0)
        const interval = price.recurring?.interval ?? price.interval ?? null
        const intervalCount = Number(price.recurring?.interval_count ?? price.interval_count ?? 1)
        const quantity = Number(item.quantity ?? s.quantity ?? 1)
        const mrr = monthlyCents(unit, interval, intervalCount, quantity)
        return {
          id: String(s.id),
          stripe_account: account,
          customer_id: idOf(s.customer),
          product: null,
          status: String(s.status),
          interval,
          interval_count: intervalCount,
          unit_amount_cents: unit,
          quantity,
          currency,
          mrr_cents: mrr,
          // Filled in below for non-USD plans from what Stripe actually settled
          // on their last recurring charge; never from a guessed rate.
          mrr_usd_cents: currency.toLowerCase() === 'usd' ? mrr : null,
          current_period_end: item.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
          canceled_at: s.canceled_at ? new Date(s.canceled_at * 1000).toISOString() : null,
          raw: s,
          synced_at: syncedAt,
        }
      })

      // invoice -> subscription, so "recurring" is derived rather than guessed.
      // `payments` is the only link from an invoice to its charge on the
      // current API version; older versions reject the expand, so fall back to
      // the plain list rather than failing the whole sync.
      let invoices: Json[]
      try {
        invoices = await stripeList(auth, '/invoices', { 'expand[]': 'data.payments' })
      } catch {
        invoices = await stripeList(auth, '/invoices', {})
      }
      const links = linkInvoices(invoices)

      // ── cash ──────────────────────────────────────────────────────────────
      const txns = await stripeList(auth, '/balance_transactions', { 'expand[]': 'data.source' })
      const eventRows = []
      for (const t of txns) {
        const type = String(t.type || '')
        // Money movement that is not revenue: payouts, transfers, fee debits.
        if (!['charge', 'payment', 'refund', 'payment_refund', 'adjustment'].includes(type)) continue

        const src = (t.source && typeof t.source === 'object' ? t.source : {}) as Json
        const occurredSec = Number(t.created)
        const invoiceId = idOf(src.invoice)
        const subscriptionId = resolveSubscription(src, links, subsByCustomer, occurredSec)

        const kind = type === 'adjustment' ? 'adjustment'
          : (type === 'refund' || type === 'payment_refund') ? 'refund'
          : subscriptionId ? 'recurring'
          : 'one_time'

        const currency = String(t.currency || 'usd')       // settlement currency
        const gross = Number(t.amount ?? 0)                 // already settled
        const totalFee = Number(t.fee ?? 0)
        // Read the fee split from fee_details rather than the charge, so the
        // application fee is in the SETTLED currency like everything else.
        const details = Array.isArray(t.fee_details) ? t.fee_details as Json[] : []
        const appFee = details
          .filter(d => d.type === 'application_fee')
          .reduce((n, d) => n + Number(d.amount || 0), 0)
        const stripeFee = Math.max(0, totalFee - appFee)
        const rate = t.exchange_rate == null ? null : Number(t.exchange_rate)
        // Presented amount lives on the source charge, in the customer's currency.
        const presentedCurrency = src.currency ? String(src.currency) : null
        const presentedGross = src.amount == null ? null : Number(src.amount)

        eventRows.push({
          id: String(t.id),
          stripe_account: account,
          charge_id: src.id ? String(src.id) : null,
          invoice_id: invoiceId,
          subscription_id: subscriptionId,
          customer_id: idOf(src.customer),
          kind,
          occurred_at: new Date(occurredSec * 1000).toISOString(),
          currency,
          gross_cents: gross,
          stripe_fee_cents: stripeFee,
          app_fee_cents: appFee,
          net_cents: Number(t.net ?? gross - totalFee),
          usd_cents: currency.toLowerCase() === 'usd' ? gross : null,
          fx_rate: rate,
          presented_currency: presentedCurrency && presentedCurrency !== currency ? presentedCurrency : null,
          presented_gross_cents: presentedCurrency && presentedCurrency !== currency ? presentedGross : null,
          product: null,
          description: t.description ? String(t.description) : (src.description ? String(src.description) : null),
          raw: t,
        })
      }

      // A non-USD plan gets its USD figure from the rate Stripe settled its
      // most recent recurring charge at. That is a rate that actually happened,
      // which is the line this file draws: settled, never guessed.
      for (const s of subRows) {
        if (s.mrr_usd_cents != null || !s.interval) continue
        const settled = eventRows
          .filter(e => e.subscription_id === s.id && e.kind === 'recurring' && e.currency.toLowerCase() === 'usd' && e.gross_cents > 0)
          .sort((a, b) => a.occurred_at < b.occurred_at ? 1 : -1)[0]
        if (settled) s.mrr_usd_cents = monthlyCents(settled.gross_cents, s.interval, s.interval_count, 1)
      }

      // Stamp the product BEFORE the write, so revenue_subscriptions.product
      // is not null on every row while customers says otherwise.
      const mapping = assignProducts(subRows, priceMap, acct.defaultProduct)

      if (subRows.length) {
        const { error } = await supabase.from('revenue_subscriptions').upsert(subRows, { onConflict: 'id' })
        if (error) throw new Error(`revenue_subscriptions upsert: ${error.message}`)
      }
      if (eventRows.length) {
        const { error } = await supabase.from('revenue_events').upsert(eventRows, { onConflict: 'id' })
        if (error) throw new Error(`revenue_events upsert: ${error.message}`)
      }

      const ledger = await reconcileCustomers(subRows)

      report.push({
        account,
        label: acct.label,
        stripe_account_id: acct.accountId,
        read_via: auth.via === 'org' ? 'organisation key' : `account key (${acct.legacyEnvVar})`,
        payments_via: acct.paymentsVia,
        subscriptions: subRows.length,
        events: eventRows.length,
        recurring_events: eventRows.filter(e => e.kind === 'recurring').length,
        customers_reconciled: ledger.upserted,
        unmapped_prices: mapping.unmapped,
        // An account that takes money elsewhere must not read as a Stripe zero.
        ...(acct.note ? { note: acct.note } : {}),
      })
      } catch (e) {
        const error = e instanceof Error ? e.message : 'sync failed'
        failures.push(`${account}: ${error}`)
        report.push({ account, error })
      }
    }

    if (failures.length === configured.length) {
      return res.status(502).json({ ok: false, error: failures.join('; '), accounts: report })
    }
    return res.json({
      ok: failures.length === 0,
      ...(failures.length ? { error: `partly synced. ${failures.join('; ')}` } : {}),
      accounts: report,
      synced_at: new Date().toISOString(),
    })
  } catch (e) {
    return res.status(502).json({ ok: false, error: e instanceof Error ? e.message : 'sync failed' })
  }
}
