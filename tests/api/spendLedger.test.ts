import test from 'node:test'
import assert from 'node:assert/strict'
import {
  matchService, receiptNumber, dedupeReceipts, prepareLedger, effectiveDay, netUsd,
  judgeParse, isRetryable, reviewItems, NO_PAID_DATE_NOTE, type LedgerRow, type RegistryMatch,
} from '../../api/_spendLedger.js'

// The registry rows these tests match against are the live ones as of
// 2026-10-04 (service_registry.vendor_match), trimmed to the services in play.
const REGISTRY: RegistryMatch[] = [
  { key: 'anthropic', vendor_match: ['anthropic.com', 'mail.anthropic.com'] },
  { key: 'apify', vendor_match: ['apify.com'] },
  { key: 'brave', vendor_match: ['brave.com'] },
  { key: 'elevenlabs', vendor_match: ['elevenlabs.io'] },
  { key: 'exa', vendor_match: ['exa.ai'] },
  { key: 'expo', vendor_match: ['expo.dev'] },
  { key: 'hetzner', vendor_match: ['hetzner.com'] },
  { key: 'relume', vendor_match: ['relume.io', 'relume'] },
  { key: 'xai', vendor_match: ['x.ai'] },
]

const row = (over: Partial<LedgerRow>): LedgerRow => ({
  service_key: null, vendor_raw: 'unknown', amount_usd: null, kind: 'charge', paid_at: null,
  needs_review: false, review_note: null, raw_subject: null, raw_from: null, created_at: null, ...over,
})

// ── 1. A parse with an amount but no payment date ─────────────────────────

test('an amount with no payment date is flagged and dated by when the email arrived', () => {
  // Citi Bike, 2026-09-09: amount 260.21 USD, confidence high, paid_at null.
  // This used to be called confident, written with paid_at NULL, and then
  // filtered out of every total by the reader.
  const arrived = Date.parse('2026-09-09T14:03:00Z')
  const v = judgeParse({ amount: 260.21, currency: 'USD', paid_at: null, confidence: 0.95 }, null, arrived)
  assert.equal(v.confident, false)
  assert.equal(v.paidAt, '2026-09-09')
  assert.equal(v.note, NO_PAID_DATE_NOTE)
})

test('a full parse is confident and keeps the receipt date', () => {
  const v = judgeParse({ amount: 4.5, currency: 'USD', paid_at: '2026-10-01', confidence: 0.9 }, null, Date.parse('2026-10-02T00:00:00Z'))
  assert.deepEqual(v, { confident: true, paidAt: '2026-10-01', note: null })
})

test('a failed parse keeps its failure note and no date', () => {
  const v = judgeParse(null, 'parse failed: anthropic_401:API key is invalid.', Date.now())
  assert.deepEqual(v, { confident: false, paidAt: null, note: 'parse failed: anthropic_401:API key is invalid.' })
})

test('the reader counts a dateless row on the day it was written, and lists it', () => {
  // The three live rows that vanished: Hetzner $17.47, Apify $54.87, Citi Bike $260.21.
  const rows = [
    row({ vendor_raw: 'Hetzner', service_key: 'hetzner', amount_usd: 17.47, created_at: '2026-09-01T07:15:02Z', raw_subject: 'Hetzner Online GmbH - Invoice 088001134956 (K0281443826)' }),
    row({ vendor_raw: 'Apify', service_key: 'apify', amount_usd: '54.87', created_at: '2026-09-04T07:15:09Z', raw_subject: 'Apify invoice #202609032892 payment successful' }),
    row({ vendor_raw: 'Citi Bike', amount_usd: 260.21, created_at: '2026-09-09T07:15:11Z', raw_subject: 'Your membership renewal receipt' }),
  ]
  const kept = prepareLedger(rows, REGISTRY)
  const sept = kept.filter(r => effectiveDay(r)?.startsWith('2026-09')).reduce((a, r) => a + netUsd(r), 0)
  assert.equal(Math.round(sept * 100) / 100, 332.55)
  const items = reviewItems(kept)
  assert.equal(items.length, 3)
  assert.ok(items.every(i => i.counted))
  assert.ok(items.every(i => /no payment date/.test(i.reason)))
})

// ── 2. Failed parses are retryable ───────────────────────────────────────

test('a transient failure is read again on every run', () => {
  const r = { needs_review: true, amount: null, review_note: 'parse failed: anthropic_400:You have reached your specified API usage limits' }
  assert.equal(isRetryable(r, { backfill: false }), true)
  assert.equal(isRetryable(r, { backfill: true }), true)
})

test('an unclear receipt is read again only on a backfill', () => {
  const r = { needs_review: true, amount: null, review_note: 'amount only in the PDF attachment' }
  assert.equal(isRetryable(r, { backfill: false }), false)
  assert.equal(isRetryable(r, { backfill: true }), true)
})

test('a row with an amount, or one never flagged, is never read again', () => {
  assert.equal(isRetryable({ needs_review: true, amount: 12, review_note: 'parse failed: x' }, { backfill: true }), false)
  assert.equal(isRetryable({ needs_review: false, amount: null, review_note: 'not a receipt (read again)' }, { backfill: true }), false)
})

// ── 6. Stripe-sent receipts land on their service ────────────────────────

test('Stripe-sent Brave and ElevenLabs receipts match their services', () => {
  assert.equal(matchService(REGISTRY, 'Brave Software, Inc.',
    '"Brave Software, Inc." <invoice+statements+acct_1MBh97BLZ1V6RGX9@stripe.com>',
    'Your receipt from Brave Software, Inc. #2716-1599'), 'brave')
  assert.equal(matchService(REGISTRY, 'Eleven Labs Inc.',
    '"Eleven Labs Inc." <invoice+statements+acct_1M07hSLmdOdiMXBs@stripe.com>',
    'Your receipt from Eleven Labs Inc. #2981-8840-4128'), 'elevenlabs')
})

test('a failed parse still matches by the sender display name', () => {
  // When the parser fails, vendor_raw falls back to the sender domain.
  assert.equal(matchService(REGISTRY, 'stripe.com',
    '"Brave Software, Inc." <invoice+statements+acct_1MBh97BLZ1V6RGX9@stripe.com>',
    'Your receipt from Brave Software, Inc. #2574-8543'), 'brave')
})

test('short domain names never claim a vendor: X is not xAI', () => {
  assert.equal(matchService(REGISTRY, 'stripe.com',
    'X <invoice+statements+acct_1Ika5JA3KZ32dPo1@stripe.com>',
    'Your receipt from X #2424-3322-0122'), null)
  // "expo" is four letters, under the floor, so Exponent Inc. stays unmatched.
  assert.equal(matchService(REGISTRY, 'Exponent Inc.', 'billing@exponent.example', 'Your receipt'), null)
})

test('the existing needles still win first', () => {
  assert.equal(matchService(REGISTRY, 'mail.anthropic.com',
    '"Anthropic, PBC" <invoice+statements@mail.anthropic.com>',
    'Your receipt from Anthropic, PBC #2084-2534-2420'), 'anthropic')
})

test('the reader matches rows written before the matcher knew them', () => {
  const kept = prepareLedger([row({
    vendor_raw: 'Eleven Labs Inc.', amount_usd: 23.95, paid_at: '2026-09-10',
    raw_from: '"Eleven Labs Inc." <invoice+statements+acct_1M07hSLmdOdiMXBs@stripe.com>',
    raw_subject: 'Your receipt from Eleven Labs Inc. #2981-8840-4128',
  })], REGISTRY)
  assert.equal(kept[0].service_key, 'elevenlabs')
})

// ── 8. One row per real receipt ──────────────────────────────────────────

test('receipt numbers come out of every subject shape in the ledger', () => {
  assert.equal(receiptNumber('Your receipt from Relume #2444-4882'), '2444-4882')
  assert.equal(receiptNumber('Re: Re: Your receipt from Relume #2444-4882'), '2444-4882')
  assert.equal(receiptNumber('Your Exa Labs, Inc. receipt [#1817-5354]'), '1817-5354')
  assert.equal(receiptNumber('Apify invoice #202609032892 payment successful'), '202609032892')
  assert.equal(receiptNumber('Hetzner Online GmbH - Invoice 088001134956 (K0281443826)'), '088001134956')
  assert.equal(receiptNumber('Payment received for Supabase Pte. Ltd. invoice (#PBPHAR-00008)'), 'PBPHAR-00008')
  assert.equal(receiptNumber('Your payment has been processed for the invoice IN-007-943-816'), 'IN-007-943-816')
  assert.equal(receiptNumber('Your Google Play Order Receipt from Sep 27, 2026'), null)
  assert.equal(receiptNumber('Google Workspace: Your invoice is available for themindmaker.ai'), null)
})

test('forwarded and replied copies of one Relume receipt count once', () => {
  // The five live rows for one $480 Relume purchase and its refund. Before,
  // all five were summed: two charges and two refunds that cancelled by luck.
  const rows = [
    row({ service_key: 'relume', vendor_raw: 'Relume', amount_usd: 480, kind: 'charge', paid_at: '2026-08-16', raw_subject: 'Your receipt from Relume #2444-4882' }),
    row({ service_key: 'relume', vendor_raw: 'Relume', amount_usd: 480, kind: 'charge', paid_at: '2026-08-16', raw_subject: 'Re: Your receipt from Relume #2444-4882' }),
    row({ service_key: 'relume', vendor_raw: 'Relume', amount_usd: 480, kind: 'refund', paid_at: '2026-08-19', raw_subject: 'Re: Re: Your receipt from Relume #2444-4882' }),
    row({ service_key: 'relume', vendor_raw: 'Relume', amount_usd: null, kind: 'refund', needs_review: true, review_note: 'low confidence', raw_subject: 'Re: Re: Your receipt from Relume #2444-4882' }),
    row({ service_key: 'relume', vendor_raw: 'Relume', amount_usd: 480, kind: 'refund', paid_at: '2026-08-20', raw_subject: 'Your refund from Relume #3709-6382' }),
  ]
  const { kept, dropped } = dedupeReceipts(rows)
  assert.equal(kept.length, 2)
  assert.equal(dropped.length, 3)
  assert.deepEqual(kept.map(r => r.raw_subject), ['Your receipt from Relume #2444-4882', 'Your refund from Relume #3709-6382'])
  assert.equal(kept.reduce((a, r) => a + netUsd(r), 0), 0)
  // The unread reply is a duplicate, not a receipt to chase.
  assert.equal(reviewItems(kept).length, 0)
})

test('a forward with the amount stands in for an original that could not be read', () => {
  const rows = [
    row({ service_key: 'apify', vendor_raw: 'apify.com', amount_usd: null, needs_review: true, review_note: 'parse failed: x', raw_subject: 'Apify invoice #202609153171 payment successful' }),
    row({ service_key: 'apify', vendor_raw: 'Apify', amount_usd: 61.2, paid_at: '2026-09-15', raw_subject: 'Fwd: Apify invoice #202609153171 payment successful' }),
  ]
  const { kept } = dedupeReceipts(rows)
  assert.equal(kept.length, 1)
  assert.equal(kept[0].amount_usd, 61.2)
})

test('a lone forward is the receipt, and rows with no number are all kept', () => {
  const rows = [
    row({ service_key: 'anthropic', vendor_raw: 'Anthropic', amount_usd: 240.72, paid_at: '2026-08-20', raw_subject: 'Fwd: Your receipt from Anthropic, PBC #2097-0596-3738' }),
    row({ vendor_raw: 'Google Workspace', paid_at: '2026-07-01', raw_subject: 'Google Workspace: Your invoice is available for themindmaker.ai' }),
    row({ vendor_raw: 'Google Workspace', paid_at: '2026-08-01', raw_subject: 'Google Workspace: Your invoice is available for themindmaker.ai' }),
  ]
  assert.equal(dedupeReceipts(rows).kept.length, 3)
})

// ── 5. The review list says what the totals did ──────────────────────────

test('unread receipts are listed as not counted, newest first', () => {
  const items = reviewItems([
    row({ service_key: 'anthropic', vendor_raw: 'mail.anthropic.com', needs_review: true, review_note: 'parse failed: anthropic_401:API key is invalid.', created_at: '2026-09-20T07:15:00Z', raw_subject: 'Your receipt from Anthropic, PBC #2335-5631-7768' }),
    row({ service_key: 'google-workspace', vendor_raw: 'Google Workspace', needs_review: true, review_note: 'amount only in the PDF attachment', paid_at: '2026-08-01', created_at: '2026-08-25T07:15:00Z', raw_subject: 'Google Workspace: Your invoice is available' }),
    row({ vendor_raw: 'Brave Software, Inc.', amount_usd: 4.5, paid_at: '2026-10-01' }),
  ], k => ({ anthropic: 'Anthropic', 'google-workspace': 'Google Workspace' } as Record<string, string>)[k] ?? null)
  assert.equal(items.length, 2)
  assert.deepEqual(items.map(i => [i.vendor, i.date, i.counted]), [
    ['Anthropic', '2026-09-20', false],
    ['Google Workspace', '2026-08-01', false],
  ])
  assert.match(items[0].reason, /tries again/)
  assert.match(items[1].reason, /PDF/)
})

test('an unread receipt from a processor is named by its sender, not the processor', () => {
  const [item] = reviewItems([row({
    vendor_raw: 'stripe.com', needs_review: true, review_note: 'parse failed: anthropic_401:API key is invalid.',
    created_at: '2026-09-17T07:15:00Z', raw_from: 'X <invoice+statements+acct_1Ika5JA3KZ32dPo1@stripe.com>',
    raw_subject: 'Your receipt from X #2424-3322-0122',
  })])
  assert.equal(item.vendor, 'X')
  assert.equal(item.counted, false)
  assert.equal(item.usd, null)
})
