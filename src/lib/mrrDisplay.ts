// The headline MRR figure used to be pinned here:
//
//   export const MRR_DISPLAY_OVERRIDE: number | null = 16500
//
// It was removed 2026-08-11. It existed because the live figure read near zero,
// which was itself a symptom: the money was real, but most of it was one-off
// payments that customers.mrr_usd could never represent, and the rest was
// Substack subscriptions net of a 10% platform fee.
//
// Revenue now comes from Stripe directly. See api/_revenue.ts and
// src/hooks/useRevenue.ts, which expose two figures that are never added
// together: cash collected, and committed MRR. This file is a formatter now.

/** Abbreviated money — 16500 → "$16.5k", 100000 → "$100k", 950 → "$950". */
export function formatMrr(n: number): string {
  if (n >= 1000) {
    const k = n / 1000
    const s = k >= 100 ? Math.round(k).toString() : k.toFixed(1).replace(/\.0$/, '')
    return `$${s}k`
  }
  return `$${Math.round(n)}`
}
