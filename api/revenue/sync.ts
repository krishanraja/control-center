import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// Pull revenue from Stripe. GET on a cron, POST as an on-demand backstop.
// Shape follows api/feed/ingest.ts (Bearer $CRON_SECRET, service-role writes).
//
// PULL, NOT WEBHOOK, for a specific reason. `system_config.
// stripe_webhook_signing_secrets` is unarmed (GROWTH_TAB_RUNBOOK.md:75), so
// every Stripe webhook into `customers` today is processed UNVERIFIED. A pull
// needs no signature, backfills all history in one run, and is idempotent on
// the balance-transaction id. It also leaves the existing n8n path untouched.
//
// Balance transactions are the grain because they settle the FEES. The charge
// object alone does not tell you what landed after Stripe's cut and Substack's
// 10% application fee.

const STRIPE = 'https://api.stripe.com/v1'

/** account key -> env var holding that account's secret key. */
const ACCOUNTS: Record<string, string> = {
  mindmaker_llc: 'STRIPE_API_KEY',
  fractionl_ai: 'STRIPE_API_KEY_FRACTIONL',
}

type Json = Record<string, any>

async function stripeGet(key: string, path: string, params: Record<string, string | number> = {}): Promise<Json> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) qs.append(k, String(v))
  const r = await fetch(`${STRIPE}${path}?${qs}`, { headers: { Authorization: `Bearer ${key}` } })
  if (!r.ok) throw new Error(`Stripe ${r.status} on ${path}: ${(await r.text()).slice(0, 200)}`)
  return r.json() as Promise<Json>
}

/** Every page, oldest-first is not needed; we upsert so order is irrelevant. */
async function stripeList(key: string, path: string, params: Record<string, string | number> = {}): Promise<Json[]> {
  const out: Json[] = []
  let starting_after: string | undefined
  for (let page = 0; page < 100; page++) {
    const p: Record<string, string | number> = { ...params, limit: 100 }
    if (starting_after) p.starting_after = starting_after
    const res = await stripeGet(key, path, p)
    const data = (res.data || []) as Json[]
    out.push(...data)
    if (!res.has_more || data.length === 0) break
    starting_after = data[data.length - 1].id
  }
  return out
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'GET') {
    const secret = process.env.CRON_SECRET || ''
    const auth = req.headers.authorization || ''
    if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: 'unauthorized' })
  } else if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'GET (cron) or POST only' })
  }

  const configured = Object.entries(ACCOUNTS).filter(([, envVar]) => !!process.env[envVar])
  if (configured.length === 0) {
    return res.status(200).json({
      ok: true,
      skipped: `no Stripe key configured (set ${Object.values(ACCOUNTS).join(' or ')})`,
    })
  }

  const report: Json[] = []

  try {
    for (const [account, envVar] of configured) {
      const key = process.env[envVar] as string

      // ── subscriptions: the ONLY source of MRR ─────────────────────────────
      const subs = await stripeList(key, '/subscriptions', { status: 'all' })
      const subRows = subs.map(s => {
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
          customer_id: s.customer ? String(s.customer) : null,
          product: null,
          status: String(s.status),
          interval,
          interval_count: intervalCount,
          unit_amount_cents: unit,
          quantity,
          currency,
          mrr_cents: mrr,
          // Left NULL for non-USD plans: a subscription carries no settled figure
          // the way a balance transaction does, and guessing a rate here is
          // exactly the silent conversion this file avoids.
          mrr_usd_cents: currency.toLowerCase() === 'usd' ? mrr : null,
          current_period_end: item.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
          canceled_at: s.canceled_at ? new Date(s.canceled_at * 1000).toISOString() : null,
          raw: s,
          synced_at: new Date().toISOString(),
        }
      })
      if (subRows.length) {
        const { error } = await supabase.from('revenue_subscriptions').upsert(subRows, { onConflict: 'id' })
        if (error) throw new Error(`revenue_subscriptions upsert: ${error.message}`)
      }

      // invoice -> subscription, so "recurring" is derived rather than guessed.
      const invoiceToSub = new Map<string, string | null>()
      for (const inv of await stripeList(key, '/invoices', {})) {
        invoiceToSub.set(String(inv.id), inv.subscription ? String(inv.subscription) : null)
      }

      // ── cash ──────────────────────────────────────────────────────────────
      const txns = await stripeList(key, '/balance_transactions', { 'expand[]': 'data.source' })
      const eventRows = []
      for (const t of txns) {
        const type = String(t.type || '')
        // Money movement that is not revenue: payouts, transfers, fee debits.
        if (!['charge', 'payment', 'refund', 'payment_refund', 'adjustment'].includes(type)) continue

        const src = (t.source && typeof t.source === 'object' ? t.source : {}) as Json
        const invoiceId = src.invoice ? String(src.invoice) : null
        const subscriptionId = invoiceId ? (invoiceToSub.get(invoiceId) ?? null) : null

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
          customer_id: src.customer ? String(src.customer) : null,
          kind,
          occurred_at: new Date(Number(t.created) * 1000).toISOString(),
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
      if (eventRows.length) {
        const { error } = await supabase.from('revenue_events').upsert(eventRows, { onConflict: 'id' })
        if (error) throw new Error(`revenue_events upsert: ${error.message}`)
      }

      report.push({ account, subscriptions: subRows.length, events: eventRows.length })
    }

    return res.json({ ok: true, accounts: report })
  } catch (e) {
    return res.status(502).json({ ok: false, error: e instanceof Error ? e.message : 'sync failed' })
  }
}
