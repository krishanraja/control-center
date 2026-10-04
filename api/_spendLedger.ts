// The rules of the money-out ledger, in one place.
//
// The writer (api/spend/ingest.ts) and the reader (api/_spend.ts) both need
// to agree on what a receipt is worth, which service it belongs to, which day
// it lands on and whether two rows are the same receipt. When each kept its own
// copy of those rules they drifted, and the Intel tab paid for it:
//
//   - A parse with an amount but no payment date was called confident, and
//     the reader filtered on paid_at, so Hetzner $17.47, Apify $54.87 and
//     Citi Bike $260.21 dropped out of every total without a flag.
//   - Stripe sends receipts for Brave and ElevenLabs from
//     invoice+statements+acct_...@stripe.com, which never contains the
//     brave.com / elevenlabs.io needles, so real charges sat under
//     "Connected, no spend recorded".
//   - Forwarded and replied copies of one Relume receipt counted as separate
//     charges and refunds, and only netted to $0 because they happened to
//     cancel.
//
// No Supabase import: tests and scripts load this with no environment.

export interface RegistryMatch {
  key: string
  vendor_match: string[] | null
}

/** Lowercase letters and digits only, so "Eleven Labs Inc." reads as elevenlabsinc. */
export const compact = (s: string | null | undefined): string =>
  (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * The name part of a domain needle: mail.anthropic.com -> anthropic,
 * elevenlabs.io -> elevenlabs. Null for anything that is not a bare domain, or
 * whose name is too short to be safe: x.ai would otherwise claim every vendor
 * whose name starts with an x, and the X (Twitter) receipts are not xAI.
 */
function domainStem(needle: string): string | null {
  const n = needle.trim().toLowerCase()
  if (!n.includes('.') || /[\s@/]/.test(n)) return null
  const labels = n.split('.').filter(Boolean)
  if (labels.length < 2) return null
  const stem = compact(labels[labels.length - 2])
  return stem.length >= 5 ? stem : null
}

/** The display name of a From header: `"Brave Software, Inc." <x@stripe.com>` -> Brave Software, Inc. */
function fromName(from: string): string {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*</)
  return m ? m[1].trim() : ''
}

/**
 * Which registered service a receipt belongs to, or null.
 *
 * Two passes. The first is the registry's own needles, matched anywhere in the
 * vendor, sender and subject, exactly as before. The second exists for
 * payment processors: a Stripe receipt names the vendor ("Brave Software,
 * Inc.") but carries a stripe.com address, so it compares the vendor name, and
 * the sender's display name, against the NAME inside each domain needle. Only
 * a match at the start of the name counts, so brave.com claims "Brave
 * Software, Inc." and not a vendor that merely mentions Brave.
 */
export function matchService(registry: RegistryMatch[], vendor: string, from: string, subject: string): string | null {
  const hay = `${vendor} ${from} ${subject}`.toLowerCase()
  for (const r of registry) {
    for (const needle of r.vendor_match || []) {
      if (needle && hay.includes(needle.toLowerCase())) return r.key
    }
  }
  const names = [compact(vendor), compact(fromName(from))].filter(Boolean)
  if (!names.length) return null
  for (const r of registry) {
    for (const needle of r.vendor_match || []) {
      const stem = needle ? domainStem(needle) : null
      if (stem && names.some(n => n.startsWith(stem))) return r.key
    }
  }
  return null
}

/**
 * The vendor's own receipt or invoice number, from the subject line.
 *
 *   Your receipt from Relume #2444-4882                      -> 2444-4882
 *   Your Exa Labs, Inc. receipt [#1817-5354]                 -> 1817-5354
 *   Apify invoice #202609032892 payment successful          -> 202609032892
 *   Hetzner Online GmbH - Invoice 088001134956 (K0281443826) -> 088001134956
 *   ... for the invoice IN-007-943-816                       -> IN-007-943-816
 *   Your Google Play Order Receipt from Sep 27, 2026         -> null (no number)
 */
export function receiptNumber(subject: string | null | undefined): string | null {
  const s = subject || ''
  const hash = s.match(/#\s*([A-Z0-9][A-Z0-9-]{3,})/i)
  if (hash && /\d/.test(hash[1])) return hash[1].toUpperCase()
  const inv = s.match(/\binvoice\s+(?:no\.?\s*|number\s*)?([A-Z]{1,6}-[\d-]{4,}\d|\d[\d-]{5,}\d)/i)
  if (inv) return inv[1].toUpperCase()
  return null
}

/** A forward or a reply. It quotes a receipt; it is not a second one. */
export function isCopySubject(subject: string | null | undefined): boolean {
  return /^\s*(re|fwd?|aw|wg|tr)\s*:/i.test(subject || '')
}

export interface LedgerRow {
  gmail_message_id?: string | null
  service_key: string | null
  vendor_raw: string
  amount_usd: number | string | null
  kind: string
  paid_at: string | null
  needs_review?: boolean | null
  review_note?: string | null
  raw_subject?: string | null
  raw_from?: string | null
  created_at?: string | null
}

/** Signed USD: a refund takes money back. An unpriced row is worth nothing YET, which the review list says. */
export const netUsd = (r: Pick<LedgerRow, 'amount_usd' | 'kind'>): number =>
  r.amount_usd == null ? 0 : (r.kind === 'refund' ? -Number(r.amount_usd) : Number(r.amount_usd))

/**
 * The day a row counts on: the payment date when the receipt gave one,
 * otherwise the day the row was written. The ingest runs daily with a two day
 * overlap, so for a receipt read on the normal schedule that is within a day
 * or two of when it arrived. A row with neither is not countable on any day.
 */
export function effectiveDay(r: Pick<LedgerRow, 'paid_at' | 'created_at'>): string | null {
  if (r.paid_at) return String(r.paid_at).slice(0, 10)
  if (r.created_at) return String(r.created_at).slice(0, 10)
  return null
}

const hasAmount = (r: LedgerRow) => r.amount_usd != null

/** First row with an amount, else the first row. */
function pickBest<T extends LedgerRow>(rows: T[]): T | null {
  return rows.find(hasAmount) || rows[0] || null
}

/**
 * One row per real receipt.
 *
 * Rows that share a vendor and a receipt number are one receipt. When the
 * vendor's original email is among them, every forward and reply is dropped:
 * a reply that quotes receipt #2444-4882 and talks about a refund is not a
 * refund (the real one arrives with its own number). With no original, one
 * copy per kind is kept. Either way a copy that carries the amount stands in
 * for an original that could not be read, so money is never swapped for a
 * blank. Rows with no number are all kept: there is nothing to match them on.
 */
export function dedupeReceipts<T extends LedgerRow>(rows: T[]): { kept: T[]; dropped: T[] } {
  const groups = new Map<string, T[]>()
  const numbered = new Set<T>()
  for (const r of rows) {
    const num = receiptNumber(r.raw_subject)
    if (!num) continue
    numbered.add(r)
    const key = `${r.service_key || compact(r.vendor_raw)}|${num}`
    const g = groups.get(key) || []
    g.push(r)
    groups.set(key, g)
  }
  const keep = new Set<T>()
  for (const g of groups.values()) {
    if (g.length === 1) { keep.add(g[0]); continue }
    const originals = g.filter(r => !isCopySubject(r.raw_subject))
    const copies = g.filter(r => isCopySubject(r.raw_subject))
    const pool = originals.length ? originals : copies
    for (const kind of [...new Set(pool.map(r => r.kind))]) {
      let best = pickBest(pool.filter(r => r.kind === kind))
      if (best && !hasAmount(best)) {
        const stand = copies.find(r => r.kind === kind && hasAmount(r))
        if (stand) best = stand
      }
      if (best) keep.add(best)
    }
  }
  const kept: T[] = []
  const dropped: T[] = []
  for (const r of rows) (!numbered.has(r) || keep.has(r) ? kept : dropped).push(r)
  return { kept, dropped }
}

/**
 * Match, then dedupe: the one preparation every reader of the ledger runs.
 *
 * Matching happens at read time as well as at ingest, so a row written before
 * a matching rule existed (every Brave and ElevenLabs receipt so far) lands on
 * its service without anyone rewriting the table.
 */
export function prepareLedger<T extends LedgerRow>(rows: T[], registry: RegistryMatch[]): T[] {
  const matched = rows.map(r => r.service_key ? r : {
    ...r,
    service_key: matchService(registry, r.vendor_raw || '', r.raw_from || '', r.raw_subject || ''),
  })
  return dedupeReceipts(matched).kept
}

/** The review note a parse with an amount but no payment date gets. The reader looks for it. */
export const NO_PAID_DATE_NOTE = 'no payment date in the email, dated by when it arrived'

/** Notes from a parse that failed for a reason a later run can fix (key down, cap hit, bad output). */
export function isTransientFailure(note: string | null | undefined): boolean {
  const n = (note || '').toLowerCase()
  return n.startsWith('parse failed') || n.startsWith('parser returned no vendor')
}

/**
 * Whether an existing row should be read again rather than skipped.
 *
 * Only rows that never yielded an amount qualify. A transient failure (the
 * parser's own Anthropic key rejected, or its spend cap hit, which is how 43
 * Anthropic receipts went unread in September) is retried on every run. An
 * unclear receipt, such as a Google Workspace invoice whose amount is only in
 * the PDF, reads the same way every time, so it is retried only on an explicit
 * backfill rather than paying for the same answer daily.
 */
export function isRetryable(
  r: { needs_review?: boolean | null; amount?: number | string | null; review_note?: string | null },
  opts: { backfill: boolean },
): boolean {
  if (!r.needs_review || r.amount != null) return false
  return opts.backfill || isTransientFailure(r.review_note)
}

export interface ParsedLike {
  amount: number | null
  currency: string | null
  paid_at: string | null
  confidence: number | null
}

/**
 * What a parse is worth.
 *
 * Confident needs an amount, a currency, a payment date and confidence of at
 * least 0.6. An amount with no payment date is still money: the row is dated
 * by the day the email arrived and flagged, so it counts in the right month
 * AND shows in the review list, instead of being called confident with no
 * date and then filtered out of every total.
 */
export function judgeParse(
  p: ParsedLike | null,
  failNote: string | null,
  receivedMs: number | null,
): { confident: boolean; paidAt: string | null; note: string | null } {
  if (!p) return { confident: false, paidAt: null, note: failNote || 'low confidence' }
  const money = p.amount != null && Boolean(p.currency)
  const sure = (p.confidence ?? 0) >= 0.6
  if (money && sure && p.paid_at) return { confident: true, paidAt: p.paid_at, note: null }
  if (money && !p.paid_at) {
    const arrived = receivedMs && Number.isFinite(receivedMs) ? new Date(receivedMs).toISOString().slice(0, 10) : null
    return { confident: false, paidAt: arrived, note: sure ? NO_PAID_DATE_NOTE : `${NO_PAID_DATE_NOTE}; low confidence` }
  }
  return { confident: false, paidAt: p.paid_at ?? null, note: failNote || 'low confidence' }
}

export interface ReviewItem {
  vendor: string
  /** The day it counts on (see effectiveDay), or null. */
  date: string | null
  subject: string | null
  /** Signed USD when known. */
  usd: number | null
  /** Whether the totals include it. */
  counted: boolean
  /** Why it needs a look, in plain words. */
  reason: string
}

/** A row needs a look when the parser flagged it, or when it has money and no payment date. */
export function needsLook(r: LedgerRow): boolean {
  return Boolean(r.needs_review) || (!r.paid_at && r.amount_usd != null)
}

export function reviewReason(r: LedgerRow): string {
  const note = (r.review_note || '').toLowerCase()
  if ((!r.paid_at && r.amount_usd != null) || note.startsWith(NO_PAID_DATE_NOTE)) {
    return 'Counted. The email has no payment date, so it uses the day it arrived.'
  }
  if (isTransientFailure(note)) return 'Not counted. The reader failed on this one, and it tries again on the next run.'
  if (note.includes('no fx rate')) return 'Not counted. There was no exchange rate for its currency.'
  if (note.includes('no readable body')) return 'Not counted. The email has no text to read.'
  if (note.includes('pdf')) return 'Not counted. The amount is only in the attached PDF.'
  if (r.amount_usd != null) return 'Counted, but the reader was unsure of it.'
  return 'Not counted. The amount was not clear in the email.'
}

/** The review list, newest first. `label` turns a service key into its display name. */
export function reviewItems(rows: LedgerRow[], label: (key: string) => string | null = () => null): ReviewItem[] {
  return rows
    .filter(needsLook)
    .map(r => ({
      // A failed parse leaves the sender's domain as the vendor ("stripe.com"),
      // which names the processor, not the company. The From name is better.
      vendor: (r.service_key && label(r.service_key))
        || (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(r.vendor_raw || '') && fromName(r.raw_from || ''))
        || r.vendor_raw || 'Unknown sender',
      date: effectiveDay(r),
      subject: r.raw_subject ? String(r.raw_subject).slice(0, 160) : null,
      usd: r.amount_usd == null ? null : Math.round(netUsd(r) * 100) / 100,
      counted: r.amount_usd != null,
      reason: reviewReason(r),
    }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.vendor.localeCompare(b.vendor))
}
