// Guards the two things the attend lane cannot be allowed to lie about.
//
// The lane was rebuilt on 2026-09-24 because it had been wrong in four ways at
// once, and two of those are the kind that come back. They are both the same
// shape of defect as the one scripts/check-enrichment-honesty.mts exists for: a
// row that claims to have been judged, or to have a real date, when nothing
// checked. Krish's words about the enrichment version of it apply here verbatim:
// "if there are not enough api credits anywhere, I need an alert rather than just
// half enriching."
//
//   1. AN UNVERIFIED DATE IS WORSE THAN NO DATE. A row with date_verified=false
//      can never be recommended. It costs an evening when it is wrong, and it is
//      invisibly wrong: the card looks identical either way. The rule lives in the
//      events_recommendable view so the DATABASE enforces it, and this guard is
//      what keeps a future reader from going round the view to the table.
//
//   2. A BLOCKED SOURCE DEGRADES AND ALERTS. It never writes a clean status and
//      never writes a zero. A zero on either axis reads on the card as a verdict
//      on the room for as long as it sits there, and it is the same pixels as an
//      honest zero. That asymmetry is exactly what made the old pipeline's silence
//      survive fifteen days.
//
// Static where it can be, behavioural where it must be: a shape check cannot tell
// whether the arithmetic actually rejects a developer meetup, so the last section
// runs computeAxes over a table of real rooms.
//
//   npx tsx scripts/check-events-honesty.mts

import { readFileSync } from 'node:fs'
import { computeAxes, WEIGHTS, SCORE_VERSION } from '../api/_eventScore.ts'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }
const read = (p: string) => readFileSync(p, 'utf8')

const MIGRATION = 'supabase/migrations/20260924120000_events_attend_lane.sql'
const SCORE_ROUTE = 'api/events/score.ts'
const DISCOVER_ROUTE = 'api/events/discover.ts'
const SCRUB_ROUTE = 'api/events/scrub.ts'
const SCORE_LIB = 'api/_eventScore.ts'
const HOOK = 'src/hooks/useEvents.ts'

/** The body of the brace-delimited block whose opening brace is at or after `from`. */
function blockAt(src: string, from: number): string {
  const open = src.indexOf('{', from)
  if (open < 0) return ''
  let d = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(open, i + 1) }
  }
  return src.slice(open)
}

// ── 1. The view is the gate, and it still carries the date rule ──────────────
{
  const src = read(MIGRATION)
  const view = src.slice(src.indexOf('create or replace view public.events_recommendable'))
  if (!view) {
    bad(`${MIGRATION}: events_recommendable is not defined here. The date rule has to live in the view, because every reader goes through it and no reader remembers a rule.`)
  } else {
    const head = view.slice(0, 600)
    if (!/date_verified\s*=\s*true/.test(head)) {
      bad(`${MIGRATION}: events_recommendable no longer requires date_verified = true. An unverified date is worse than no date: it costs an evening and the card looks identical either way.`)
    }
    if (!/archived_at is null/i.test(head)) {
      bad(`${MIGRATION}: events_recommendable no longer excludes archived rows, so a dead event would be recommended.`)
    }
    if (!/starts_at is not null/i.test(head)) {
      bad(`${MIGRATION}: events_recommendable no longer requires a start date, so a row with no date at all could rank.`)
    }
  }
}

// ── 2. Nothing reads the table where it should read the view ─────────────────
//
// This is the hole the view cannot close by itself. A hook that selects from
// 'events' instead of 'events_recommendable' silently re-admits every unverified
// row, and nothing about the resulting card says so.
{
  const src = read(HOOK)
  if (!/from\('events_recommendable'\)/.test(src)) {
    bad(`${HOOK}: the lane does not read events_recommendable. Selecting from 'events' directly re-admits unverified dates and archived rows, and the card cannot tell the difference.`)
  }
  if (/\.from\('events'\)/.test(src)) {
    bad(`${HOOK}: reads the events table directly. Reads go through the view; writes go through api/events/[id].`)
  }
}

// ── 3. No key means no score, not a zero ────────────────────────────────────
//
// The defect this prevents is precise: a scoring pass with no model available
// that writes draw_score = 0 on every row. Those rows then look judged and rank
// last forever, and nothing distinguishes them from rooms honestly judged empty.
{
  const src = read(SCORE_ROUTE)
  const guardIdx = src.indexOf('if (!hasAnthropicKey())')
  if (guardIdx < 0) {
    bad(`${SCORE_ROUTE}: no \`if (!hasAnthropicKey())\` guard. Without a model, this route must do nothing and say so; a written zero is indistinguishable from a judgement.`)
  } else {
    const body = blockAt(src, guardIdx)
    if (!/return res\.status\(503\)/.test(body)) {
      bad(`${SCORE_ROUTE}: the no-key guard does not return 503, so the route would fall through and score against nothing.`)
    }
    if (!/workflow_runs/.test(body) || !/status: 'error'/.test(body)) {
      bad(`${SCORE_ROUTE}: the no-key path does not record a failed workflow_runs row. A pass that scored nothing and said nothing is how this lane went stale for fifteen days.`)
    }
    const firstUpdate = src.indexOf(`.from('events')\n`) >= 0 ? src.indexOf(`.from('events')`) : src.indexOf('.update(')
    if (firstUpdate >= 0 && guardIdx > firstUpdate) {
      bad(`${SCORE_ROUTE}: the no-key guard appears AFTER the first write to events.`)
    }
  }

  // A failure per row must be recorded as a failure, never written as a score.
  if (!/failed\.push\(/.test(src)) {
    bad(`${SCORE_ROUTE}: a per-row scoring failure is not collected, so a model returning nonsense would pass through unremarked.`)
  }
  if (/draw_score:\s*0\b/.test(src)) {
    bad(`${SCORE_ROUTE}: writes a literal draw_score: 0. A zero is a verdict on the room; an unscored row must stay null.`)
  }
  if (!/raiseQuotaAlert\(/.test(src)) {
    bad(`${SCORE_ROUTE}: a blocked provider is never alerted, so a credit wall would be recorded and never mentioned.`)
  }
}

// ── 4. Discovery: blocked and empty stops; blocked with rows still alerts ────
{
  const src = read(DISCOVER_ROUTE)
  const GUARD = 'if (blocked.length && !inserted.length && !skipped.length) {'
  const guardIdx = src.indexOf(GUARD)
  if (guardIdx < 0) {
    bad(`${DISCOVER_ROUTE}: the blocked-and-found-nothing guard is missing or reshaped. It must read exactly \`${GUARD}\` — any other condition can disable it without looking disabled.`)
  } else {
    const body = blockAt(src, guardIdx + GUARD.length - 1)
    if (!/raiseQuotaAlert\(/.test(body)) bad(`${DISCOVER_ROUTE}: the blocked-and-empty path does not alert.`)
    if (!/return res\.status\(502\)/.test(body)) bad(`${DISCOVER_ROUTE}: the blocked-and-empty path does not fail the run, so every source refusing would report success with zero rows — the exact shape of a silent outage.`)
    if (!/status: 'error'/.test(body)) bad(`${DISCOVER_ROUTE}: the blocked-and-empty path records a workflow_runs row that is not an error.`)
  }

  // The degraded path has to be noisy too. Stopping quietly was the original
  // failure; succeeding quietly on a partial sweep is the same failure, later.
  const degraded = src.indexOf('if (blocked.length) {', guardIdx >= 0 ? guardIdx + 1 : 0)
  if (degraded < 0 || !/raiseQuotaAlert\(/.test(blockAt(src, degraded))) {
    bad(`${DISCOVER_ROUTE}: a sweep where one source refused but another answered does not alert. "We got some" is not the same as "we looked everywhere".`)
  }

  // Eventbrite is blocked for datacenter IPs by an AWS WAF. Adding it back buys a
  // source that reports zero forever and reads as "nothing on this week".
  if (/eventbrite/i.test(src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''))) {
    bad(`${DISCOVER_ROUTE}: Eventbrite is being fetched. It serves an AWS WAF wall to datacenter IPs, so on a cron it can only ever return nothing, which is indistinguishable from a quiet week.`)
  }

  // A parsed date is what makes a row visible. Writing date_verified true
  // unconditionally would put every unparsed row into the lane.
  if (/date_verified:\s*true\b/.test(src)) {
    bad(`${DISCOVER_ROUTE}: writes date_verified: true unconditionally. It must be derived from whether a date actually parsed.`)
  }
}

// ── 5. The scrub archives the dead only, and never knows where he is ─────────
//
// Getting this wrong destroyed 26 New York rows once already. An away-city event
// is unactionable, not dead. The route passing no city is what makes the mistake
// impossible rather than merely unlikely.
{
  const src = read(SCRUB_ROUTE)
  if (/p_home_city/.test(src.replace(/\/\/[^\n]*/g, ''))) {
    bad(`${SCRUB_ROUTE}: passes a home city to scrub_dead_events. Actionability is a query-time concern (events_for), never destructive: an away-city row becomes live the moment a trip is booked.`)
  }
  if (!/rpc\('scrub_dead_events'\)/.test(src)) {
    bad(`${SCRUB_ROUTE}: does not call scrub_dead_events. A hand-rolled archive here would not carry the four reasons, and a row archived without a reason cannot be argued with.`)
  }
  if (!/unexplained/.test(src)) {
    bad(`${SCRUB_ROUTE}: does not count rows archived with reason 'unknown'. That is the else branch of the function's CASE, so a row landing there means the WHERE clause and the reason list have drifted apart.`)
  }
}

// ── 6. The axes still do the job they were changed to do ────────────────────
//
// A shape check cannot tell whether the arithmetic actually rejects a developer
// meetup, and that is the entire point of the change. These are the real rooms
// that were the live top of the lane on 2026-09-24, with the densities the rubric
// in api/_eventScore.ts asks a judge to produce for them.
{
  const rooms = {
    'London PyTorch #28':            { peer_density: 5, buyer_density: 5, practitioner_density: 95, vendor_density: 10, seniority: 25 },
    'LLMday NYC':                    { peer_density: 8, buyer_density: 10, practitioner_density: 92, vendor_density: 20, seniority: 30 },
    'AWS AI In Practice #7':         { peer_density: 8, buyer_density: 20, practitioner_density: 85, vendor_density: 70, seniority: 30 },
    'Agentic AI Workshop: Claude Code': { peer_density: 10, buyer_density: 10, practitioner_density: 90, vendor_density: 30, seniority: 25 },
    'Model Wrangling Hackathon':     { peer_density: 10, buyer_density: 5, practitioner_density: 98, vendor_density: 15, seniority: 20 },
  }
  for (const [name, room] of Object.entries(rooms)) {
    const { draw_score } = computeAxes(room)
    if (draw_score !== 0) {
      bad(`${SCORE_LIB}: "${name}" scores ${draw_score} on Peers. A practitioner room must be driven to zero, not merely ranked lower: a developer meetup at position nine is still a developer meetup in the attend lane.`)
    }
  }

  // A room of owners has to clear every one of them by a wide margin, or the
  // reordering is theoretical.
  const eo = { peer_density: 92, buyer_density: 45, practitioner_density: 5, vendor_density: 10, seniority: 85 }
  const eoDraw = computeAxes(eo).draw_score
  if (eoDraw < 60) {
    bad(`${SCORE_LIB}: an owner-run room with a revenue floor scores only ${eoDraw} on Peers. The lane would then have nothing at the top.`)
  }

  // Adtech and media LEADERS are the face (api/_mission.ts) and the people the
  // pilot is sold to. If this ever fails, the axes have drifted from the north
  // star and the lane is being aimed away from the one thing being sold.
  const retailMedia = { peer_density: 30, buyer_density: 80, practitioner_density: 10, vendor_density: 45, seniority: 80 }
  const rmDemand = computeAxes(retailMedia).demand_score
  if (rmDemand < 50) {
    bad(`${SCORE_LIB}: a room of media and adtech P&L owners scores only ${rmDemand} on Buyers. "Not adtech people" meant journalists, vendors and practitioners, never the buyers named in FACE.`)
  }

  // The direction of the two penalties. A room of engineers is not a room of
  // peers under any reading; it might still hold someone who could buy.
  if (WEIGHTS.draw.practitioner >= 0) {
    bad(`${SCORE_LIB}: practitioner density is no longer a penalty on Peers. That is the old definition of Draw ("technical-leader density"), and it is what surfaced PyTorch and a hackathon as the top of the attend lane.`)
  }
  if (WEIGHTS.demand.practitioner >= 0) {
    bad(`${SCORE_LIB}: practitioner density is no longer a penalty on Buyers.`)
  }
  if (Math.abs(WEIGHTS.draw.practitioner) <= Math.abs(WEIGHTS.demand.practitioner)) {
    bad(`${SCORE_LIB}: the practitioner penalty is no longer heavier on Peers than on Buyers. It has to be: a room of engineers holds no peers at all, but may still hold a buyer.`)
  }
  if (WEIGHTS.draw.vendor >= 0 || WEIGHTS.demand.vendor >= 0) {
    bad(`${SCORE_LIB}: vendor density is no longer a penalty. A room of people selling is not a room of people owning.`)
  }

  // Bounds. A penalty can drive a raw figure below zero and the bonus can push
  // one over a hundred; either violates the CHECK on events and loses the row.
  const extremes = [
    { peer_density: 0, buyer_density: 0, practitioner_density: 100, vendor_density: 100, seniority: 0 },
    { peer_density: 100, buyer_density: 100, practitioner_density: 0, vendor_density: 0, seniority: 100, named_attendees: ['A, CEO', 'B, CEO', 'C, CEO'] },
  ]
  for (const e of extremes) {
    const { draw_score, demand_score } = computeAxes(e)
    for (const [k, v] of Object.entries({ draw_score, demand_score })) {
      if (!Number.isInteger(v) || v < 0 || v > 100) {
        bad(`${SCORE_LIB}: ${k} came out as ${v}, outside the 0-100 CHECK on events. A write would fail and the row would be lost rather than badly scored.`)
      }
    }
  }

  if (!Number.isInteger(SCORE_VERSION) || SCORE_VERSION < 1) {
    bad(`${SCORE_LIB}: SCORE_VERSION must be a positive integer. It is what makes a corpus scored under two sets of weights detectable instead of quietly incomparable.`)
  }
}

if (fail) {
  console.log(`\n${fail} failure(s).`)
  process.exit(1)
}
console.log('check-events-honesty: OK')
