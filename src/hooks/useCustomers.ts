import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { withoutTestRecords } from './../lib/recordHygiene'

export type CustomerKind    = 'paid' | 'free_signup' | 'trial' | 'waitlist' | 'churned'
export type CustomerProduct =
  | 'gutted'
  | 'onalert'
  | 'merciless'
  | 'fractionl_circle'
  | 'fractionl_pulse'
  | 'mm_ctrl'
  | 'plinth'
  | 'full_time'
  | 'mindmaker'
  | 'mindmaker_live'
  | 'tech0nomic'

export interface CustomerRow {
  id: string
  product: CustomerProduct
  kind: CustomerKind
  email?: string | null
  full_name?: string | null
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  plan?: string | null
  mrr_usd?: number | null
  ltv_usd?: number | null
  signed_up_at?: string | null
  became_paid_at?: string | null
  churned_at?: string | null
  source?: string | null
  country?: string | null
  raw?: Record<string, unknown> | null
  created_at: string
  updated_at: string
  // Pillar 1 — revenue attribution. Set by Stripe webhook patch on insert,
  // or backfilled by the matching playbook.
  attribution_lead_id?: string | null
  attribution_task_id?: string | null
  attribution_channel?: string | null
  attribution_confidence?: string | null
  // Outreach surface (added 2026-05-25 pedantic audit migration)
  needs_outreach_at?: string | null
  last_emailed_at?: string | null
  last_email_draft_id?: string | null
  last_email_draft_url?: string | null
}

export interface ProductBucket {
  product: CustomerProduct
  total: number
  paid: number
  freeSignups: number
  waitlist: number
  churned: number
  mrrUsd: number
  newestPaidAt: string | null
  recent: CustomerRow[]
}

// mindmaker / mindmaker_live / tech0nomic joined the customer_product enum with
// the unified audience pipeline (2026-06-03 migration). Leaving them out of this
// list silently dropped every paid Substack subscriber from totals.paid and
// totals.mrrUsd (MrrTicker, GlanceHeader, Subscriptions header) while
// SubscribersList counted them, so the same tab disagreed with itself.
const ALL_PRODUCTS: CustomerProduct[] = [
  'gutted', 'onalert', 'merciless',
  'fractionl_circle', 'fractionl_pulse', 'mm_ctrl',
  'plinth', 'full_time',
  'mindmaker', 'mindmaker_live', 'tech0nomic',
]

/**
 * Polled (60s) fetch of the central customer ledger. Returns flat rows plus
 * per-product buckets pre-computed so screens don't each redo the reduce.
 * Degrades gracefully when the migration hasn't been applied (table missing
 * returns []).
 */
export function useCustomers() {
  const [rows, setRows] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error: err } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)
      if (cancelled) return
      if (err) {
        // 404/PGRST205 = pre-migration. Don't break the tab.
        if (err.code !== 'PGRST205') setError(err.message)
        setRows([])
      } else {
        // Drop test/demo rows so MRR, counts, and "Recent" are all honest.
        setRows(withoutTestRecords((data as CustomerRow[]) || []))
        setError(null)
      }
      setLoading(false)
    }
    load()
    const iv = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  const buckets = useMemo<ProductBucket[]>(() => {
    const map = new Map<CustomerProduct, ProductBucket>()
    for (const p of ALL_PRODUCTS) {
      map.set(p, {
        product: p,
        total: 0, paid: 0, freeSignups: 0, waitlist: 0, churned: 0,
        mrrUsd: 0, newestPaidAt: null, recent: [],
      })
    }
    for (const r of rows) {
      const b = map.get(r.product)
      if (!b) continue
      b.total += 1
      if (r.kind === 'paid')        b.paid += 1
      if (r.kind === 'free_signup') b.freeSignups += 1
      if (r.kind === 'waitlist')    b.waitlist += 1
      if (r.kind === 'churned')     b.churned += 1
      if (r.kind === 'paid' && r.churned_at == null && typeof r.mrr_usd === 'number') {
        b.mrrUsd += Number(r.mrr_usd) || 0
      }
      if (r.kind === 'paid' && r.became_paid_at) {
        if (!b.newestPaidAt || new Date(r.became_paid_at) > new Date(b.newestPaidAt)) {
          b.newestPaidAt = r.became_paid_at
        }
      }
      if (b.recent.length < 5) b.recent.push(r)
    }
    return ALL_PRODUCTS.map(p => map.get(p)!)
  }, [rows])

  const totals = useMemo(() => {
    const t = { paid: 0, freeSignups: 0, waitlist: 0, churned: 0, mrrUsd: 0 }
    for (const b of buckets) {
      t.paid += b.paid
      t.freeSignups += b.freeSignups
      t.waitlist += b.waitlist
      t.churned += b.churned
      t.mrrUsd += b.mrrUsd
    }
    return t
  }, [buckets])

  return { customers: rows, buckets, totals, loading, error }
}

// Gutted/On Alert/Merciless were retired from the OS control plane 2026-07-06
// (see MINDMAKER_OS_ARCHITECTURE.md §21) but historical `customers` rows for
// them are preserved, not deleted — labels/accents/tones stay defined so those
// rows keep rendering their real product name instead of crashing or falling
// back to the raw enum string.
export const PRODUCT_LABEL: Record<CustomerProduct, string> = {
  gutted: 'Gutted',
  onalert: 'On Alert',
  merciless: 'Merciless',
  fractionl_circle: 'Fractionl Circle',
  fractionl_pulse: 'Fractionl Pulse',
  mm_ctrl: 'mm-ctrl',
  plinth: 'Plinth',
  full_time: 'Full Time',
  mindmaker: 'Mindmaker',
  mindmaker_live: 'MYMU',
  // Retired as a brand 2026-08-06 and folded into Mindmaker LIVE. The enum value
  // stays (Postgres enums cannot drop values) and existing rows keep rendering.
  tech0nomic: 'Techonomic (retired)',
}

export const PRODUCT_ACCENT: Record<CustomerProduct, string> = {
  gutted: 'bg-rose-400',
  onalert: 'bg-amber-400',
  merciless: 'bg-red-400',
  fractionl_circle: 'bg-violet-400',
  fractionl_pulse: 'bg-sky-400',
  mm_ctrl: 'bg-emerald-400',
  plinth: 'bg-blue-400',
  full_time: 'bg-orange-400',
  mindmaker: 'bg-teal-400',
  mindmaker_live: 'bg-cyan-400',
  tech0nomic: 'bg-indigo-400',
}

// Bordered-chip tone triple (text / bg / border) — same hue family as
// PRODUCT_ACCENT above, in the ContactSourcePill VENTURE_META idiom. Used
// wherever a product needs a full chip rather than just a dot (e.g.
// SubscribersList). Hardcoded literal Tailwind classes (not built from a
// template string) so the JIT content scanner can see them.
export const PRODUCT_CHIP_TONE: Record<CustomerProduct, string> = {
  gutted: 'text-rose-300 bg-rose-500/10 border-rose-500/20',
  onalert: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  merciless: 'text-red-300 bg-red-500/10 border-red-500/20',
  fractionl_circle: 'text-violet-300 bg-violet-500/10 border-violet-500/20',
  fractionl_pulse: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
  mm_ctrl: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  plinth: 'text-blue-300 bg-blue-500/10 border-blue-500/20',
  full_time: 'text-orange-300 bg-orange-500/10 border-orange-500/20',
  mindmaker: 'text-teal-300 bg-teal-500/10 border-teal-500/20',
  mindmaker_live: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
  tech0nomic: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20',
}

export const KIND_ACCENT: Record<CustomerKind, string> = {
  paid: 'bg-emerald-400',
  free_signup: 'bg-violet-400',
  trial: 'bg-sky-400',
  waitlist: 'bg-amber-400',
  churned: 'bg-red-400',
}

export const KIND_LABEL: Record<CustomerKind, string> = {
  paid: 'Paid',
  free_signup: 'Free signup',
  trial: 'Trial',
  waitlist: 'Waitlist',
  churned: 'Churned',
}
