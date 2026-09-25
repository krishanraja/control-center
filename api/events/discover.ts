import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { raiseQuotaAlert } from '../_alert.js'
import { isBlocking, outcomeFrom, ok, empty, errored, summarise, type ProviderOutcome } from '../_quota.js'
import { SCHEDULED_CITIES, isHomeCity, type HomeCity } from '../_homeCity.js'

// GET /api/events/discover   cron, 45 6 * * * (vercel.json)
//
// Sourcing for the attend lane, in git.
//
// Until now this ran as /root/.openclaw/workspace/scripts/discover-events.py on
// the OpenClaw VPS (scripts/cron/crontab.txt), which is not in version control,
// is not reachable from CI, and is watched by nothing. It stopped writing rows
// on 2026-09-09 and nobody noticed for fifteen days. That is the whole reason
// the lane reads stale: not a bad scraper, an invisible one.
//
// Two sources, both measured rather than assumed (architecture doc section 3):
// Luma city pages and Meetup search are server-rendered and parse without auth.
// EVENTBRITE IS DELIBERATELY NOT ATTEMPTED: it serves an AWS WAF bot wall to
// datacenter IPs. It works from residential and is blocked from a VPS, so no
// browser choice and no retry fixes it on a cron, and pretending otherwise just
// buys a source that reports zero forever.
//
// This route sources and dedupes only. It writes date_verified honestly and
// never scores: /api/events/score is the judge. A row landing here with
// date_verified=false is invisible to events_recommendable by design, which is
// the point — an unverified date is worse than no date.

export const config = { maxDuration: 300 }

/** Per city, per run. Small on purpose: the scoring pass costs a model call per
 *  row, so flooding the table faster than it can be judged just moves the
 *  backlog. */
const PER_CITY_CAP = 40
const FETCH_TIMEOUT_MS = 20_000

interface Candidate {
  title: string
  url: string
  host: string | null
  city: HomeCity
  starts_at: string | null
  description: string | null
  venue: string | null
  cost_kind: 'free' | 'cheap' | 'paid' | 'unknown'
  source: 'luma' | 'meetup'
  source_ref: string
}

/** Luma city slugs. Kept beside the host watchlist rather than inside it because
 *  a city page is not a host: it is the whole city's feed. */
const LUMA_CITY: Record<HomeCity, string> = {
  london: 'london',
  new_york: 'nyc',
  sydney: 'sydney',
}

/** Meetup search needs a lat/lon rather than a name. */
const MEETUP_GEO: Record<HomeCity, { lat: string; lon: string }> = {
  london: { lat: '51.5074', lon: '-0.1278' },
  new_york: { lat: '40.7128', lon: '-74.0060' },
  sydney: { lat: '-33.8688', lon: '151.2093' },
}

/**
 * The queries discovery actually asks.
 *
 * The old pipeline had no query list of its own: it walked an EMPTY event_hosts
 * table, which is why 242 rows claim source='host_watchlist' and the watchlist
 * has nothing in it. These terms are pointed at owners and operators, which is
 * the half the corpus was missing. There is no "AI" term in here on purpose:
 * the AI rooms were never the thing that was hard to find.
 */
const OPERATOR_QUERIES = [
  'founders',
  'entrepreneurs',
  'business owners',
  'CEO roundtable',
  'scaleup leaders',
  'founder dinner',
  'investor and founder',
  'managing director network',
]

async function fetchText(url: string): Promise<{ text: string; outcome: ProviderOutcome }> {
  const api = url.includes('lu.ma') ? 'luma' : 'meetup'
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS)
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: {
        // A plain UA gets served the bot page by both hosts. This is the same
        // string a headless Chrome sends, which is the browser tier the
        // architecture note names for JS-rendered pages.
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml',
        'accept-language': 'en-GB,en;q=0.9',
      },
    })
    const body = await r.text()
    if (!r.ok) return { text: '', outcome: outcomeFrom(api, r.status, body.slice(0, 500)) }
    if (!body || body.length < 500) return { text: body, outcome: empty(api, 'body too short to parse') }
    return { text: body, outcome: ok(api) }
  } catch (e: unknown) {
    const msg = (e as Error)?.name === 'AbortError' ? 'timeout' : ((e as Error)?.message || 'fetch_failed')
    return { text: '', outcome: errored(api, msg) }
  } finally {
    clearTimeout(t)
  }
}

/**
 * Both hosts embed their event list as JSON in the served HTML (Next.js
 * __NEXT_DATA__ on Luma, Apollo state on Meetup). Pulling the JSON out beats a
 * DOM walk: a class name changes with every redeploy and a payload key does not.
 * Falls back to nothing rather than to a regex over prose, because a
 * half-parsed event is a row with a wrong date, and a wrong date is the failure
 * this lane is least able to absorb.
 */
function jsonBlobs(html: string): unknown[] {
  const out: unknown[] = []
  const re = /<script[^>]*type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    try { out.push(JSON.parse(m[1])) } catch { /* a non-JSON script tag is not a failure */ }
  }
  const next = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html)
  if (next) { try { out.push(JSON.parse(next[1])) } catch { /* noop */ } }
  return out
}

/** Walk any parsed JSON for schema.org Event objects, which both hosts emit. */
function harvestEvents(node: unknown, found: Record<string, unknown>[], depth = 0): void {
  if (!node || depth > 8 || found.length > 300) return
  if (Array.isArray(node)) {
    for (const v of node) harvestEvents(v, found, depth + 1)
    return
  }
  if (typeof node !== 'object') return
  const o = node as Record<string, unknown>
  const type = o['@type'] ?? o.type
  const t = Array.isArray(type) ? type.join(' ') : String(type ?? '')
  if (/event/i.test(t) && (o.name || o.title)) found.push(o)
  for (const v of Object.values(o)) harvestEvents(v, found, depth + 1)
}

function asText(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    for (const k of ['name', 'text', 'description', 'address', 'addressLocality']) {
      const s = asText(o[k])
      if (s) return s
    }
  }
  return null
}

function asIso(v: unknown): string | null {
  const s = typeof v === 'string' ? v : null
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** Free is a signal, not a nicety: a free room hosted by a software company is
 *  usually a room of sellers, and the scrub already treats a free event more
 *  than 90 days out as unbookable noise. */
function costOf(o: Record<string, unknown>): { cost_kind: Candidate['cost_kind']; price: number | null } {
  const offers = o.offers
  const list = Array.isArray(offers) ? offers : offers ? [offers] : []
  let price: number | null = null
  for (const off of list) {
    const p = Number((off as Record<string, unknown>)?.price)
    if (Number.isFinite(p)) { price = price === null ? p : Math.min(price, p); }
  }
  if (price === null) return { cost_kind: 'unknown', price: null }
  if (price === 0) return { cost_kind: 'free', price: 0 }
  if (price < 50) return { cost_kind: 'cheap', price }
  return { cost_kind: 'paid', price }
}

function toCandidate(o: Record<string, unknown>, city: HomeCity, source: 'luma' | 'meetup'): Candidate | null {
  const title = asText(o.name) || asText(o.title)
  const url = asText(o.url) || asText(o['@id'])
  if (!title || !url || !/^https?:\/\//.test(url)) return null
  const starts_at = asIso(o.startDate) || asIso(o.start_date) || asIso(o.dateTime)
  const { cost_kind } = costOf(o)
  return {
    title: title.slice(0, 500),
    url: url.split('?')[0],
    host: asText(o.organizer) || asText(o.performer),
    city,
    starts_at,
    description: (asText(o.description) || '').slice(0, 4000) || null,
    venue: asText(o.location),
    cost_kind,
    source,
    // The canonical URL is the identity. events has UNIQUE (source, source_ref),
    // so a re-run updates nothing and inserts nothing rather than duplicating.
    source_ref: url.split('?')[0].replace(/\/+$/, ''),
  }
}

async function harvestCity(city: HomeCity, outcomes: ProviderOutcome[]): Promise<Candidate[]> {
  const found: Candidate[] = []

  // Luma: one city feed.
  const luma = await fetchText(`https://lu.ma/${LUMA_CITY[city]}`)
  outcomes.push(luma.outcome)
  if (luma.text) {
    const raw: Record<string, unknown>[] = []
    for (const b of jsonBlobs(luma.text)) harvestEvents(b, raw)
    for (const o of raw) {
      const c = toCandidate(o, city, 'luma')
      if (c) found.push(c)
    }
  }

  // Meetup: one search per operator query.
  const geo = MEETUP_GEO[city]
  for (const q of OPERATOR_QUERIES) {
    const u = `https://www.meetup.com/find/?keywords=${encodeURIComponent(q)}&source=EVENTS&lat=${geo.lat}&lon=${geo.lon}`
    const r = await fetchText(u)
    outcomes.push(r.outcome)
    if (!r.text) continue
    const raw: Record<string, unknown>[] = []
    for (const b of jsonBlobs(r.text)) harvestEvents(b, raw)
    for (const o of raw) {
      const c = toCandidate(o, city, 'meetup')
      if (c) found.push(c)
    }
  }

  // Dedupe within the run before hitting the table.
  const seen = new Set<string>()
  const unique: Candidate[] = []
  for (const c of found) {
    const k = `${c.source}:${c.source_ref}`
    if (seen.has(k)) continue
    seen.add(k)
    unique.push(c)
  }
  return unique.slice(0, PER_CITY_CAP)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'OPTIONS') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  if (guardCronRoute(req, res)) return

  const started = new Date()
  const outcomes: ProviderOutcome[] = []
  const inserted: string[] = []
  const skipped: string[] = []
  const failed: { url: string; error: string }[] = []

  // A caller may scope to one city. Sydney is temporary and fires on a button
  // press only (architecture doc section 3), so it is never in the scheduled
  // sweep and only reachable by asking for it.
  const asked = (req.query?.city as string | undefined)
  const cities: HomeCity[] = isHomeCity(asked) ? [asked] : SCHEDULED_CITIES

  try {
    for (const city of cities) {
      const candidates = await harvestCity(city, outcomes)
      for (const c of candidates) {
        try {
          const { error } = await supabase.from('events').insert({
            title: c.title,
            host: c.host,
            // Unknown, not guessed. The scorer judges the room; a host kind
            // invented here would be read as evidence downstream.
            host_kind: 'unknown',
            url: c.url,
            description: c.description,
            starts_at: c.starts_at,
            city: c.city,
            venue: c.venue,
            // Both sources publish a machine-readable start date, so a parsed
            // date IS verified and its source is the page it came from. No date
            // means the row stays out of events_recommendable until something
            // verifies one, which is the rule rather than a gap.
            date_verified: !!c.starts_at,
            date_source_url: c.starts_at ? c.url : null,
            item_kind: 'durable',
            cost_kind: c.cost_kind,
            can_attend: true,
            can_speak: false,
            source: c.source,
            source_ref: c.source_ref,
          })
          if (error) {
            // 23505 is the UNIQUE (source, source_ref) hit: already known, which
            // is the normal case on a daily sweep and not a failure.
            if (error.code === '23505') skipped.push(c.title)
            else failed.push({ url: c.url, error: error.message.slice(0, 120) })
          } else {
            inserted.push(c.title)
          }
        } catch (e: unknown) {
          failed.push({ url: c.url, error: (e as Error)?.message?.slice(0, 120) || 'insert_failed' })
        }
      }
    }

    // Honesty, per scripts/check-enrichment-honesty.mts: a blocked source and
    // nothing found is a stop-and-alert, not a quiet zero. A blocked source with
    // rows found keeps the rows and still alerts, because "we got some" is not
    // the same as "we looked everywhere".
    const summary = summarise(outcomes)
    const blocked = outcomes.filter(isBlocking)
    if (blocked.length && !inserted.length && !skipped.length) {
      await raiseQuotaAlert({ blocked, subject: `events discovery (${cities.join(', ')})`, source: 'api/events/discover' })
      await supabase.from('workflow_runs').insert({
        workflow_id: 'events-discover',
        workflow_name: 'Events discovery',
        agent_id: 'nova',
        run_at: started.toISOString(),
        duration_ms: Date.now() - started.getTime(),
        outcome: `blocked: every source refused (${blocked.map(b => b.api).join(', ')}). Nothing sourced.`,
        outcome_count: 0,
        status: 'error',
        metadata: { blocked: blocked.map(b => ({ api: b.api, status: b.status })), cities },
      })
      return res.status(502).json({ ok: false, error: 'sources_blocked', blocked, summary })
    }
    if (blocked.length) {
      await raiseQuotaAlert({ blocked, subject: `events discovery degraded (${cities.join(', ')})`, source: 'api/events/discover' })
    }

    await supabase.from('workflow_runs').insert({
      workflow_id: 'events-discover',
      workflow_name: 'Events discovery',
      agent_id: 'nova',
      run_at: started.toISOString(),
      duration_ms: Date.now() - started.getTime(),
      outcome: `${inserted.length} new event(s), ${skipped.length} already known, ${failed.length} failed${blocked.length ? `, ${blocked.length} source(s) blocked` : ''}`,
      outcome_count: inserted.length,
      status: failed.length && !inserted.length && !skipped.length ? 'error' : 'success',
      metadata: { cities, inserted: inserted.length, skipped: skipped.length, failed: failed.length, degraded: blocked.length > 0 },
    })

    return res.status(200).json({
      ok: true,
      cities,
      inserted,
      skipped: skipped.length,
      failed,
      // Named rather than swallowed, in the shape api/_networkSearch.ts uses:
      // a caller can see which source went quiet.
      degraded: blocked.length ? blocked.map(b => ({ api: b.api, status: b.status })) : [],
      summary,
    })
  } catch (e: unknown) {
    const msg = (e as Error)?.message?.slice(0, 200) || 'discover_failed'
    return res.status(500).json({ ok: false, error: msg, inserted, failed })
  }
}
