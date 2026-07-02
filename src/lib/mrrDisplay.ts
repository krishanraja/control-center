// Manual DISPLAY override for the headline MRR figure. The live number is derived
// from customers.mrr_usd (see useRevenueAttribution) and reads $0 until paid
// customer rows exist; this pins the shown figure without touching data. Set to
// `null` to revert to the live sum. Display-only — the Customers tab still shows
// the real underlying rows.
export const MRR_DISPLAY_OVERRIDE: number | null = 16500

/** Resolve the figure to display: the override when set, else the live value. */
export function displayMrr(live: number): number {
  return MRR_DISPLAY_OVERRIDE ?? live
}

/** Abbreviated money — 16500 → "$16.5k", 100000 → "$100k", 950 → "$950". */
export function formatMrr(n: number): string {
  if (n >= 1000) {
    const k = n / 1000
    const s = k >= 100 ? Math.round(k).toString() : k.toFixed(1).replace(/\.0$/, '')
    return `$${s}k`
  }
  return `$${Math.round(n)}`
}
