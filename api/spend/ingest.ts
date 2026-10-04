import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { guardCronRoute } from '../_auth.js'
import { googleConfigured, googleAccessToken } from '../_google.js'
import { callClaude, usageCost } from '../_content.js'
import { notifyOps, logApiCall } from '../_alert.js'
import { JUDGE_MODEL } from '../_models.js'
import {
  matchService, judgeParse, isRetryable, prepareLedger, effectiveDay, netUsd,
  type RegistryMatch, type LedgerRow,
} from '../_spendLedger.js'
import { readPaged } from '../_paged.js'

// Receipts -> spend_invoices. The money-out twin of /api/revenue/sync.
//
// Every subscription receipt already lands in krish@themindmaker.ai under the
// Gmail label "Subscriptions" (many forwarded in from other inboxes, so the
// real vendor lives inside the body, not the envelope sender). This cron
// reads that label through the existing domain-wide-delegation service
// account — with the gmail.readonly scope added to its grant, a manual
// Google Admin step; until that lands this route 503s rather than reporting
// a green month nobody measured — parses each message body with one Haiku
// call, and writes one idempotent row per message. A receipt the parser
// cannot read still lands, flagged needs_review: an unread receipt must
// never silently vanish from the month's total.
//
//   GET (CRON_SECRET) — daily 07:15 UTC   ·   POST — manual
//   ?backfill=<months 1-12> — widen the window (idempotent re-runs)
//
// A receipt the parser could not read is read again, in place, on a later
// run. Before that, a row once written was skipped forever, and the cursor
// had already moved past it, so when the parser's Anthropic key was rejected
// and then capped in September, 43 Anthropic receipts, 2 Apify invoices and
// more were unread for good: not even a backfill could reach them. A
// transient failure now retries on every run (fetched by id, so the cursor
// cannot hide it); an unclear receipt retries on a backfill. See
// isRetryable in api/_spendLedger.ts.

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'
const LABEL_ID = process.env.GMAIL_SPEND_LABEL_ID || 'Label_863902844335276794' // "Subscriptions"
const CURSOR_KEY = 'spend_gmail_cursor'
const FX_KEY = 'fx_aud_usd'
const PARSE_MODEL = JUDGE_MODEL
const MAX_PARSES_PER_RUN = 200
/** Old unread receipts read again per run. Leaves most of the run for new mail. */
const MAX_RETRIES_PER_RUN = 60
/**
 * No new parse starts after this long. The route has 300s (vercel.json) and
 * writes nothing until the parse loop ends, so a run that overruns loses every
 * row it read and leaves the cursor where it was. Up to 60 old receipts read
 * again on top of the day's new mail, at up to 20s a parse while the parser's
 * API is slow, would overrun every day for as long as the API stayed slow and
 * take the day's new receipts down with it. Stopping early keeps what was read;
 * the rest is read on the next run.
 */
const PARSE_BUDGET_MS = 200_000

interface GmailHeader { name: string; value: string }
interface GmailPart { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] }
interface GmailMessage {
  id: string
  internalDate?: string
  payload?: GmailPart & { headers?: GmailHeader[] }
}

const b64urlDecode = (s: string): string =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')

/** Minimal entity decode for receipt bodies (Hetzner writes "&dollar; 17.47"). */
function decodeEntities(s: string): string {
  return s
    .replace(/&dollar;/gi, '$')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
}

function findPart(part: GmailPart | undefined, mime: string): string | null {
  if (!part) return null
  if (part.mimeType === mime && part.body?.data) return b64urlDecode(part.body.data)
  for (const p of part.parts || []) {
    const hit = findPart(p, mime)
    if (hit) return hit
  }
  return null
}

function extractBody(msg: GmailMessage): string {
  const plain = findPart(msg.payload, 'text/plain')
  if (plain) return decodeEntities(plain)
  const html = findPart(msg.payload, 'text/html')
  if (html) return decodeEntities(html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))
  return ''
}

function header(msg: GmailMessage, name: string): string {
  return msg.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

async function gmail<T>(token: string, pathAndQuery: string): Promise<T> {
  const r = await fetch(`${GMAIL}${pathAndQuery}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`gmail ${pathAndQuery.split('?')[0]} -> HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
  return r.json() as Promise<T>
}

interface Parsed {
  is_receipt: boolean
  vendor: string
  amount: number | null
  currency: string | null
  kind: 'charge' | 'refund'
  paid_at: string | null
  period_start: string | null
  period_end: string | null
  cadence: 'monthly' | 'annual' | 'one_off' | 'unknown'
  plan_label: string | null
  confidence: number
}

const PARSE_SYSTEM = `You extract billing facts from one email. Reply with ONLY a JSON object, no prose, no code fence:
{"is_receipt": true|false, "vendor": string, "amount": number|null, "currency": "USD"|"AUD"|"EUR"|...|null, "kind": "charge"|"refund", "paid_at": "YYYY-MM-DD"|null, "period_start": "YYYY-MM-DD"|null, "period_end": "YYYY-MM-DD"|null, "cadence": "monthly"|"annual"|"one_off"|"unknown", "plan_label": string|null, "confidence": 0..1}

Rules:
- is_receipt is true ONLY for a record of money that actually moved or will be auto-charged with no action needed: a receipt, a paid invoice, a refund, or an "invoice available, will be charged automatically" notice. It is false for newsletters, product updates, dunning/failed-payment warnings, and amount-DUE notices asking for payment (a due notice's money shows up again as a real receipt and must not count twice). When false, still fill vendor if obvious and set every money field null.
- Forwarded emails: the real vendor and dates are inside the forwarded body ("From: Vendor <...>"), never the forwarding sender.
- vendor is the company billing the money (e.g. "Anthropic", "Hetzner", "n8n"), not a payment processor. "Powered by Stripe"/"via paddle.com" are processors.
- amount is the total actually paid/refunded this time, tax included. For an auto-charge invoice notice whose amount is only in a PDF attachment, leave amount null and confidence below 0.6.
- currency: "A$" means AUD. "US$" means USD. A bare "$" with a US company, US tax, or "USD" cues means USD; with clear Australian cues it means AUD.
- kind is "refund" when money went back (refund confirmation, credit note).
- paid_at is the payment/refund date from the ORIGINAL email, not the forward date.
- period_start/period_end: the service period when stated (e.g. "Aug 20 - Sep 20, 2026"). Retrospective billing (Hetzner) covers the PREVIOUS month.
- cadence: from the period length or wording ("yearly", "annual" -> annual; a one-month period or recurring subscription -> monthly; a top-up, credit purchase or one-time buy -> one_off).
- confidence below 0.6 when the amount or vendor is genuinely unclear.`

interface FxCache { date: string; usd_per: Record<string, number> }

/** USD per 1 unit of each currency, ECB daily via frankfurter (keyless), cached
 *  in system_config. A missing rate stays missing — never assumed 1.0. */
async function loadFx(currencies: string[]): Promise<FxCache | null> {
  const today = new Date().toISOString().slice(0, 10)
  const wanted = [...new Set(currencies.filter(c => c && c !== 'USD'))]
  const { data } = await supabase.from('system_config').select('value').eq('key', FX_KEY).maybeSingle()
  let cached: FxCache | null = null
  try {
    const v = data && (data as { value?: unknown }).value
    if (typeof v === 'string') cached = JSON.parse(v) as FxCache
  } catch { /* rebuild below */ }
  const cacheFresh = cached && (Date.now() - Date.parse(cached.date)) < 7 * 86_400_000
  const missing = wanted.filter(c => !(cacheFresh && cached && cached.usd_per[c] != null))

  if (cached?.date === today && missing.length === 0) return cached

  const usd_per: Record<string, number> = cacheFresh && cached ? { ...cached.usd_per } : {}
  let fetchedAny = false
  for (const c of wanted) {
    try {
      const r = await fetch(`https://api.frankfurter.dev/v1/latest?from=${encodeURIComponent(c)}&to=USD`)
      if (!r.ok) continue
      const j = await r.json() as { rates?: { USD?: number } }
      if (typeof j.rates?.USD === 'number') { usd_per[c] = j.rates.USD; fetchedAny = true }
    } catch { /* keep cached value if any */ }
  }
  if (!fetchedAny && !cacheFresh) return cached // possibly stale or null; caller flags rows
  const next: FxCache = { date: fetchedAny ? today : (cached?.date || today), usd_per }
  await supabase.from('system_config').upsert({ key: FX_KEY, value: JSON.stringify(next), updated_at: new Date().toISOString() })
  return next
}

interface ExistingRow { gmail_message_id: string; needs_review: boolean | null; amount: number | null; review_note: string | null }

/**
 * Listed ids that already have a row and should be skipped. A row that never
 * yielded an amount is NOT skipped when isRetryable says so: it is read again
 * and upserted over itself, so a retry updates the row instead of adding one.
 */
async function alreadyIngested(ids: string[], backfill: boolean): Promise<{ skip: Set<string>; retry: Set<string> }> {
  const skip = new Set<string>()
  const retry = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { data, error } = await supabase.from('spend_invoices')
      .select('gmail_message_id, needs_review, amount, review_note').in('gmail_message_id', chunk)
    // A failed read must not turn every listed message into a fresh parse.
    if (error) throw new Error(`spend_invoices read failed: ${error.message}`)
    for (const r of (data || []) as ExistingRow[]) {
      if (isRetryable(r, { backfill })) retry.add(r.gmail_message_id)
      else skip.add(r.gmail_message_id)
    }
  }
  return { skip, retry }
}

/**
 * Unread receipts older than the Gmail window, by id. The daily run lists
 * only from two days behind the cursor, so without this a receipt that failed
 * last month is never listed again however many times the cron runs.
 */
async function retryableIds(backfill: boolean): Promise<string[]> {
  const { data, error } = await supabase.from('spend_invoices')
    .select('gmail_message_id, needs_review, amount, review_note')
    .eq('needs_review', true).is('amount', null)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) return []
  return ((data || []) as ExistingRow[])
    .filter(r => isRetryable(r, { backfill }))
    .slice(0, MAX_RETRIES_PER_RUN)
    .map(r => r.gmail_message_id)
}

/** One deduped Telegram nudge per condition, the audit_log look-before-write
 *  pattern from fleet-reconcile. */
async function nudgedRecently(eventType: string, target: string, days: number): Promise<boolean> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data } = await supabase.from('audit_log')
    .select('id').eq('event_type', eventType).eq('target', target).gte('created_at', since).limit(1)
  return Boolean(data && data.length)
}

async function renewalRadar(): Promise<number> {
  const { data } = await supabase.from('spend_invoices')
    .select('service_key, vendor_raw, amount, currency, paid_at, period_end, cadence, kind')
    .eq('cadence', 'annual').eq('kind', 'charge').not('paid_at', 'is', null)
    .order('paid_at', { ascending: false }).limit(200)
  const latest = new Map<string, { name: string; amount: number | null; currency: string | null; renewsOn: Date }>()
  for (const r of (data || []) as Array<{ service_key: string | null; vendor_raw: string; amount: number | null; currency: string | null; paid_at: string; period_end: string | null; }>) {
    const id = r.service_key || r.vendor_raw
    if (latest.has(id)) continue
    const base = r.period_end ? new Date(r.period_end) : new Date(new Date(r.paid_at).setFullYear(new Date(r.paid_at).getFullYear() + 1))
    latest.set(id, { name: r.vendor_raw, amount: r.amount, currency: r.currency, renewsOn: base })
  }
  let sent = 0
  for (const [id, r] of latest) {
    const days = Math.floor((r.renewsOn.getTime() - Date.now()) / 86_400_000)
    if (days < 0 || days > 14) continue
    if (await nudgedRecently('renewal_nudge', id, 20)) continue
    await notifyOps([
      '📅 Annual renewal closing in',
      '',
      `${r.name} renews in ${days} day${days === 1 ? '' : 's'}${r.amount ? ` (${r.currency || ''} ${r.amount})` : ''}.`,
      'Cancel before it bills if you do not want another year.',
    ].join('\n'))
    await supabase.from('audit_log').insert({
      event_type: 'renewal_nudge', actor: 'spend-ingest', target: id,
      display_message: `Renewal nudge sent: ${r.name} in ${days}d`,
    }).then(() => undefined, () => undefined)
    sent++
  }
  return sent
}

async function balloonCheck(registry: RegistryMatch[]): Promise<boolean> {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const threeBack = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1))
  const threeBackDay = threeBack.toISOString().slice(0, 10)
  // The same rows, dates and dedupe the Intel tab counts (api/_spend.ts), so
  // the alert and the tab cannot disagree about the month. Unpriced rows are
  // read too, not filtered out first: the dedupe decides which copy of a
  // receipt stands, and it has to see the same group the tab sees to decide
  // the same way. They add nothing to the sums.
  const { rows: data, error } = await readPaged<LedgerRow>((from, to) => supabase.from('spend_invoices')
    .select('gmail_message_id, service_key, vendor_raw, amount_usd, kind, paid_at, created_at, raw_subject, raw_from')
    .or(`paid_at.gte.${threeBackDay},and(paid_at.is.null,created_at.gte.${threeBackDay})`)
    .order('created_at', { ascending: false })
    .order('gmail_message_id')
    .range(from, to), { max: 20_000 })
  // A failed read is no evidence of a balloon either way.
  if (error) return false
  let mtd = 0
  const prior: Record<string, number> = {}
  const monthStartDay = monthStart.toISOString().slice(0, 10)
  for (const r of prepareLedger(data, registry)) {
    const day = effectiveDay(r)
    // An unread receipt is not a $0 month: it must not make a month exist.
    if (!day || r.amount_usd == null) continue
    const v = netUsd(r)
    if (day >= monthStartDay) mtd += v
    else prior[day.slice(0, 7)] = (prior[day.slice(0, 7)] || 0) + v
  }
  const priorMonths = Object.values(prior)
  if (priorMonths.length < 2) return false // not enough history to call a balloon
  const avg = priorMonths.reduce((a, b) => a + b, 0) / priorMonths.length
  // Month-to-date already 25% past a typical FULL month, and by more than
  // $100: that is a balloon whatever the remaining days add.
  if (!(mtd > avg * 1.25 && mtd - avg > 100)) return false
  const monthKey = monthStart.toISOString().slice(0, 7)
  if (await nudgedRecently('spend_balloon', monthKey, 32)) return false
  await notifyOps([
    '🎈 OS spend is ballooning',
    '',
    `$${mtd.toFixed(0)} out so far this month, against a ~$${avg.toFixed(0)}/month average.`,
    'Open Intel -> Spend and connections to see which services moved.',
  ].join('\n'))
  await supabase.from('audit_log').insert({
    event_type: 'spend_balloon', actor: 'spend-ingest', target: monthKey,
    display_message: `Balloon alert: $${mtd.toFixed(0)} MTD vs $${avg.toFixed(0)} avg`,
  }).then(() => undefined, () => undefined)
  return true
}

async function ingest(token: string, backfillMonths: number | null) {
  const startedMs = Date.now()
  const { data: cfg } = await supabase.from('system_config').select('value').eq('key', CURSOR_KEY).maybeSingle()
  let cursorMs = 0
  try {
    const v = cfg && (cfg as { value?: unknown }).value
    if (typeof v === 'string') cursorMs = Number((JSON.parse(v) as { last_internal_ms?: number }).last_internal_ms) || 0
  } catch { /* first run */ }

  const sinceMs = backfillMonths
    ? Date.now() - backfillMonths * 30 * 86_400_000
    // A 2-day overlap behind the cursor so a late-labelled message is not
    // skipped; the unique message id makes the overlap free.
    : (cursorMs ? cursorMs - 2 * 86_400_000 : Date.now() - 45 * 86_400_000)
  const afterSec = Math.floor(sinceMs / 1000)

  // List the label's BILLING messages in the window (ids only). The
  // "Subscriptions" label is a catch-all — newsletters, digests and meeting
  // recaps outnumber receipts 100:1 in it (verified live 2026-08-25) — so the
  // subject filter does the heavy lifting and the parser's is_receipt guard
  // catches stragglers. Every real receipt in the label matches it: Stripe
  // ("Your receipt from X"), Paddle ("Your n8n receipt"), Google ("invoice is
  // available", "Order Receipt"), Hetzner ("Invoice ..."), Apify ("invoice
  // ... payment successful"), refunds ("Your refund from X").
  const SUBJECT_FILTER = 'subject:{receipt invoice refund}'
  const ids: string[] = []
  let pageToken = ''
  for (let i = 0; i < 20; i++) {
    const q = `?labelIds=${encodeURIComponent(LABEL_ID)}&q=${encodeURIComponent(`after:${afterSec} ${SUBJECT_FILTER}`)}&maxResults=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    const page = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(token, `/messages${q}`)
    ids.push(...(page.messages || []).map(m => m.id))
    if (!page.nextPageToken) break
    pageToken = page.nextPageToken
  }

  const backfill = backfillMonths != null
  const { skip, retry: listedRetries } = await alreadyIngested(ids, backfill)
  const fresh = ids.filter(id => !skip.has(id))
  // Unread receipts the window no longer lists, by id. A listed one is
  // already in `fresh`, so it is not fetched twice.
  const retries = (await retryableIds(backfill)).filter(id => !fresh.includes(id))

  // New mail first, oldest first, so a capped or stopped run advances the
  // cursor without skipping. Old receipts read again go last: they never move
  // the cursor, and they must not use up the run before the day's new mail.
  const byDate = (a: GmailMessage, b: GmailMessage) => Number(a.internalDate || 0) - Number(b.internalDate || 0)
  const freshDetailed: GmailMessage[] = []
  for (const id of fresh) {
    freshDetailed.push(await gmail<GmailMessage>(token, `/messages/${id}?format=full`))
  }
  const retryDetailed: GmailMessage[] = []
  let retryFetchFailed = 0
  for (const id of retries) {
    // An old message can be gone (deleted, relabelled). That must cost one
    // retry, not the whole run.
    try { retryDetailed.push(await gmail<GmailMessage>(token, `/messages/${id}?format=full`)) } catch { retryFetchFailed++ }
  }
  const detailed = [...freshDetailed.sort(byDate), ...retryDetailed.sort(byDate)]
  const toParse = detailed.slice(0, MAX_PARSES_PER_RUN)
  // Every message being read AGAIN. A non-receipt verdict on one of these has
  // to update its row, because skipping it would leave it flagged forever.
  const rereads = new Set([...listedRetries, ...retries])

  const { data: reg } = await supabase.from('service_registry').select('key, vendor_match')
  const registry = (reg || []) as RegistryMatch[]

  let parsedOk = 0, review = 0, matched = 0, nonReceipts = 0, llmCost = 0, retried = 0, recovered = 0
  let maxProcessedMs = cursorMs
  const currenciesSeen = new Set<string>()
  const rows: Record<string, unknown>[] = []

  // Messages left unread because the time budget ran out; the next run reads them.
  let stoppedEarly = 0
  for (let i = 0; i < toParse.length; i++) {
    if (Date.now() - startedMs > PARSE_BUDGET_MS) { stoppedEarly = toParse.length - i; break }
    const msg = toParse[i]
    const from = header(msg, 'From')
    const subject = header(msg, 'Subject')
    const body = extractBody(msg).slice(0, 6000)
    let parsed: Parsed | null = null
    let note: string | null = null

    if (body.trim()) {
      try {
        const raw = await callClaude({
          agent: 'spend-ingest',
          // A cron that reconciles spend. Nobody is waiting on it, and paying a
          // second provider to measure the first one's bill is a poor trade.
          fallback: false,
          system: PARSE_SYSTEM,
          user: `Subject: ${subject}\nFrom: ${from}\n\n${body}`,
          model: PARSE_MODEL,
          temperature: 0,
          maxTokens: 500,
          timeoutMs: 20_000,
          onUsage: u => { llmCost += usageCost(u) },
        })
        const jsonText = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
        const p = JSON.parse(jsonText) as Parsed
        if (p && typeof p.vendor === 'string') parsed = p
        else note = 'parser returned no vendor'
      } catch (err) {
        note = `parse failed: ${String((err as Error)?.message || err).slice(0, 200)}`
      }
    } else {
      note = 'no readable body'
    }

    const reread = rereads.has(msg.id)
    if (reread) retried++
    // A message fetched by id from an older failure sits behind the window;
    // it says nothing about how far the window has been read.
    const advance = () => {
      if (!retries.includes(msg.id)) maxProcessedMs = Math.max(maxProcessedMs, Number(msg.internalDate || 0))
    }
    const vendor = parsed?.vendor?.trim() || from.replace(/.*@/, '').replace(/>.*/, '').trim() || subject.slice(0, 60) || 'unknown'

    // The subject filter lets the odd non-billing email through; the parser
    // names it and the message is skipped entirely — a newsletter is not
    // unread money, so it earns no needs_review row. Parse failures fall
    // through to the honest row below, never here. A message read AGAIN
    // already has a row, so the verdict is written onto it: left alone it
    // would stay flagged and be read again on every run.
    if (parsed && parsed.is_receipt === false) {
      nonReceipts++
      if (reread) {
        // Every column, because a batched upsert sends missing keys as NULL
        // and kind and cadence are NOT NULL.
        rows.push({
          gmail_message_id: msg.id, vendor_raw: vendor, service_key: matchService(registry, vendor, from, subject),
          amount: null, currency: null, amount_usd: null, amount_aud: null, fx_rate: null,
          kind: 'charge', paid_at: null, period_start: null, period_end: null, cadence: 'unknown', plan_label: null,
          parse_confidence: parsed.confidence ?? null, needs_review: false, review_note: 'not a receipt (read again)',
          raw_subject: subject.slice(0, 300), raw_from: from.slice(0, 200), parsed_by: PARSE_MODEL,
        })
      }
      advance()
      continue
    }

    // Confident needs a payment date as well as an amount. An amount with no
    // date used to be called confident and then vanished from every total,
    // which filters on paid_at; it is now dated by the email and flagged.
    const verdict = judgeParse(parsed, note, Number(msg.internalDate || 0) || null)
    const confident = verdict.confident
    if (parsed?.currency) currenciesSeen.add(parsed.currency.toUpperCase())
    const serviceKey = matchService(registry, vendor, from, subject)
    if (serviceKey) matched++
    if (confident) parsedOk++
    else review++
    if (reread && parsed?.amount != null) recovered++

    rows.push({
      gmail_message_id: msg.id,
      vendor_raw: vendor,
      service_key: serviceKey,
      amount: parsed?.amount ?? null,
      currency: parsed?.currency?.toUpperCase() ?? null,
      kind: parsed?.kind === 'refund' ? 'refund' : 'charge',
      paid_at: verdict.paidAt,
      period_start: parsed?.period_start ?? null,
      period_end: parsed?.period_end ?? null,
      cadence: parsed?.cadence && ['monthly', 'annual', 'one_off'].includes(parsed.cadence) ? parsed.cadence : 'unknown',
      plan_label: parsed?.plan_label ?? null,
      parse_confidence: parsed?.confidence ?? null,
      needs_review: !confident,
      review_note: confident ? null : verdict.note,
      raw_subject: subject.slice(0, 300),
      raw_from: from.slice(0, 200),
      parsed_by: PARSE_MODEL,
    })
    advance()
  }

  // FX after the parse pass so one fetch covers every currency seen this run.
  const fx = await loadFx([...currenciesSeen])
  for (const row of rows) {
    const cur = row.currency as string | null
    const amount = row.amount as number | null
    if (amount == null || !cur) continue
    if (cur === 'USD') {
      row.amount_usd = amount
      row.fx_rate = 1
      const audPer = fx?.usd_per['AUD']
      row.amount_aud = audPer ? Math.round((amount / audPer) * 100) / 100 : null
    } else {
      const usdPer = fx?.usd_per[cur]
      if (usdPer) {
        row.amount_usd = Math.round(amount * usdPer * 100) / 100
        row.fx_rate = usdPer
        row.amount_aud = cur === 'AUD' ? amount : null
      } else {
        // No rate is no rate — flag it rather than pretending parity.
        row.needs_review = true
        row.review_note = [(row.review_note as string) || null, `no FX rate for ${cur}`].filter(Boolean).join('; ')
      }
      if (cur === 'AUD') row.amount_aud = amount
    }
  }

  if (rows.length) {
    const { error: upErr } = await supabase.from('spend_invoices').upsert(rows, { onConflict: 'gmail_message_id' })
    if (upErr) throw new Error(`spend_invoices upsert failed: ${upErr.message}`)
  }

  if (maxProcessedMs > cursorMs) {
    await supabase.from('system_config').upsert({
      key: CURSOR_KEY, value: JSON.stringify({ last_internal_ms: maxProcessedMs }), updated_at: new Date().toISOString(),
    })
  }

  const nudges = await renewalRadar()
  const ballooned = await balloonCheck(registry)

  await supabase.from('audit_log').insert({
    event_type: 'spend_ingested', actor: 'spend-ingest', target: 'gmail:Subscriptions',
    display_message: `Ingested ${rows.length} receipts — ${parsedOk} parsed, ${review} need review`,
    details: JSON.stringify({
      listed: ids.length, fresh: fresh.length, parsed: rows.length, parsed_ok: parsedOk,
      needs_review: review, matched, non_receipts_skipped: nonReceipts,
      retried, recovered, retry_fetch_failed: retryFetchFailed, stopped_early: stoppedEarly,
      est_llm_cost_usd: Math.round(llmCost * 10000) / 10000,
      capped: detailed.length > toParse.length, renewal_nudges: nudges, ballooned,
      backfill_months: backfillMonths,
    }),
  }).then(() => undefined, () => undefined)

  if (llmCost > 0) {
    await logApiCall({ api: 'anthropic', endpoint: 'spend-parse', units: toParse.length - stoppedEarly, estCostUsd: llmCost, source: 'spend-ingest' })
  }

  return {
    listed: ids.length,
    already_had: ids.length - fresh.length,
    parsed: rows.length,
    parsed_ok: parsedOk,
    needs_review: review,
    non_receipts_skipped: nonReceipts,
    matched_to_services: matched,
    retried,
    recovered,
    retry_fetch_failed: retryFetchFailed,
    stopped_early: stoppedEarly,
    est_llm_cost_usd: Math.round(llmCost * 10000) / 10000,
    capped: detailed.length > toParse.length,
    renewal_nudges: nudges,
    ballooned,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return

  if (!googleConfigured()) {
    return res.status(503).json({ ok: false, error: 'Google service account not configured; receipts are UNREAD, not absent' })
  }
  const token = await googleAccessToken(['https://www.googleapis.com/auth/gmail.readonly'])
  if (!token) {
    return res.status(503).json({
      ok: false,
      error: 'gmail.readonly token exchange failed — add https://www.googleapis.com/auth/gmail.readonly to the service account\'s domain-wide delegation grant in Google Admin. Receipts are UNREAD, not absent.',
    })
  }

  const rawBackfill = Array.isArray(req.query.backfill) ? req.query.backfill[0] : req.query.backfill
  const backfill = rawBackfill ? Math.min(12, Math.max(1, Number(rawBackfill) || 0)) || null : null

  try {
    const result = await ingest(token, backfill)
    return res.status(200).json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ ok: false, error: msg })
  }
}
