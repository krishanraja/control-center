// Guards Nova's standard: the four things the visibility lane cannot be allowed
// to lie about, plus the arithmetic, because a shape check cannot tell whether a
// trade title full of journalists is actually refused and that is the whole
// point of the change.
//
// Same class of guard as scripts/check-events-honesty.mts and
// scripts/check-enrichment-honesty.mts, and written for the same reason: every
// rule below is one an edit undoes as a convenience, and none of them is visible
// on the card when it breaks.
//
//   1. THE STANDARD IS A CONJUNCTION, NOT A MEAN. visibility_score must be the
//      MINIMUM of the three axes. A mean lets a famous platform carry a wrong
//      room, which is the exact defect this replaced: a trade title at room 30,
//      standing 90, only-him 35 means 52 and clears a floor of 50.
//
//   2. A REFUSAL CARRIES A REASON, FROM THE ONE TAXONOMY. A rejection with a
//      null reason renders as a silent drop with extra steps, and a code the UI
//      cannot label reaches the learning loop as 'other'.
//
//   3. NO EVIDENCE IS NOT A LOW SCORE. A row the material cannot support is
//      written `unjudged` with the axes NULL. A zero reads on the card as a
//      verdict on the stage for as long as it sits there and is the same pixels
//      as an honest zero.
//
//   4. THE LEGACY COLUMN IS NEVER THE GATE. relevance_score is two scales at
//      once (7-9 from the nell-* sources, 72-95 from the nova_* ones), so a
//      floor on it is a source filter. Nothing may read it raw.
//
//   npx tsx scripts/check-visibility-standard.mts

import { readFileSync } from 'node:fs'
import {
  computeVisibilityAxes,
  visibilityVerdict,
  VISIBILITY_WEIGHTS,
  VISIBILITY_FLOORS,
  VISIBILITY_SCORE_VERSION,
  isDeadDate,
} from '../api/_visibilityScore.ts'
import { STRETCH_CAP } from '../src/lib/visibilityStandard.ts'
import { VISIBILITY_STANDARD_VERSION, legacyRelevanceOutOfTen } from '../src/lib/visibilityScale.ts'
import { SURFACES } from '../src/lib/servedSurfaces.ts'

let fail = 0
const bad = (m: string) => { console.log('FAIL: ' + m); fail++ }
const read = (p: string) => readFileSync(p, 'utf8')

const SCORE_LIB = 'api/_visibilityScore.ts'
const SCORE_ROUTE = 'api/visibility-targets/score.ts'
const MIGRATION = 'supabase/migrations/20261005160000_novas_standard.sql'
const HOOK = 'src/hooks/useVisibilityTargets.ts'
const CLIENT_GATE = 'src/lib/visibilityStandard.ts'
const SCALE = 'src/lib/visibilityScale.ts'
const SURFACE = 'src/components/visibility/WorthTaking.tsx'

// ── 1. The conjunction, proved by arithmetic ────────────────────────────────
//
// The two cases from the module's own header, run for real. If somebody swaps
// Math.min for an average these fail, and nothing else in the suite would.
{
  const tradeTitle = {
    decider_density: 20, practitioner_density: 10, vendor_density: 10, press_density: 85,
    seniority: 60, platform_standing: 92, platform_reach_quality: 70, angle_ownership: 35,
  }
  const a = computeVisibilityAxes(tradeTitle)
  if (a.visibility_score !== Math.min(a.room_score, a.standing_score, a.only_him_score)) {
    bad(`${SCORE_LIB}: visibility_score is not the minimum of the three axes. It is the conjunction, and a mean lets one strong axis carry two weak ones.`)
  }
  if (a.room_score >= VISIBILITY_FLOORS.room) {
    bad(`${SCORE_LIB}: a room that is 85 percent press and 20 percent decision-makers scored ${a.room_score}, at or above the room floor of ${VISIBILITY_FLOORS.room}. 74 of the 129 rows in this table were journalists; that is what this weighting exists to keep out.`)
  }
  const v = visibilityVerdict(tradeTitle)
  if (v.verdict !== 'rejected') {
    bad(`${SCORE_LIB}: the well-known trade title with a room of journalists and a generic angle was judged '${v.verdict}' rather than rejected.`)
  }

  // The mirror case: the small private room that used to be outranked by it.
  const foundersDinner = {
    decider_density: 90, practitioner_density: 5, vendor_density: 10, press_density: 0,
    seniority: 80, platform_standing: 42, platform_reach_quality: 45, angle_ownership: 88,
    feeds_channel: 'built with ai',
  }
  const b = computeVisibilityAxes(foundersDinner)
  if (b.room_score < VISIBILITY_FLOORS.room) {
    bad(`${SCORE_LIB}: a room of ninety percent owners scored ${b.room_score}, below the room floor. The weighting has stopped recognising the audience the standard is pointed at.`)
  }
  const bv = visibilityVerdict(foundersDinner)
  if (bv.verdict !== 'stretch') {
    bad(`${SCORE_LIB}: the right room with the right angle on a small platform was judged '${bv.verdict}' rather than 'stretch'. The marked stretch slot is Krish's own refinement (correction 9380982f, closed 2026-10-05: "Krish refined to keep a marked stretch slot"); removing it restores a filter he removed.`)
  }

  // And the case the floors exist for: everything right except the angle.
  const generic = { ...foundersDinner, platform_standing: 80, platform_reach_quality: 80, angle_ownership: 30 }
  const gv = visibilityVerdict(generic)
  if (gv.verdict !== 'rejected' || gv.reject_reason !== 'visibility_no_relevant_talk') {
    bad(`${SCORE_LIB}: a perfect room on a strong platform with an angle anyone could give was judged '${gv.verdict}'/'${gv.reject_reason}'. "The angle must be one only Krish can deliver" is the condition he stated most strongly and it is an AND, not a tie-breaker.`)
  }
}

// ── 2. Order of the gates, because the reason has to be the right one ───────
//
// A pay-to-play slot in front of a room of engineers is refused as pay-to-play.
// The money is the disqualifier and the room never had to be judged. The fleet
// classifier shipped the equivalent bug the other way round once, where a blown
// plan quota read as a broken credential because the cheaper test ran first.
{
  const paidAndTechnical = {
    decider_density: 5, practitioner_density: 95, vendor_density: 40, press_density: 0,
    seniority: 20, platform_standing: 30, platform_reach_quality: 30, angle_ownership: 90,
    pay_to_play: true,
  }
  const v = visibilityVerdict(paidAndTechnical)
  if (v.reject_reason !== 'visibility_pay_to_play') {
    bad(`${SCORE_LIB}: a bought slot in front of a practitioner room was refused as '${v.reject_reason}' rather than 'visibility_pay_to_play'. The money is the disqualifier and the reason has to be the one Krish would give.`)
  }

  const deadAndPerfect = {
    decider_density: 95, practitioner_density: 0, vendor_density: 0, press_density: 0,
    seniority: 90, platform_standing: 95, platform_reach_quality: 90, angle_ownership: 95,
    dead_date: true,
  }
  if (visibilityVerdict(deadAndPerfect).reject_reason !== 'visibility_bad_timing') {
    bad(`${SCORE_LIB}: a perfect stage whose date has passed was not refused as 'visibility_bad_timing'. Nothing else about a dead row matters.`)
  }

  // A practitioner room and a press room are different wrongs with different
  // words, and both used to arrive as the same undifferentiated low score.
  const technical = {
    decider_density: 10, practitioner_density: 90, vendor_density: 5, press_density: 0,
    seniority: 40, platform_standing: 70, platform_reach_quality: 60, angle_ownership: 85,
    feeds_channel: 'built with ai',
  }
  if (visibilityVerdict(technical).reject_reason !== 'visibility_too_technical') {
    bad(`${SCORE_LIB}: a room that is ninety percent engineers was not refused as 'visibility_too_technical'.`)
  }
  const pressRoom = {
    decider_density: 15, practitioner_density: 5, vendor_density: 5, press_density: 90,
    seniority: 65, platform_standing: 70, platform_reach_quality: 60, angle_ownership: 85,
    feeds_channel: 'the money of ai',
  }
  if (visibilityVerdict(pressRoom).reject_reason !== 'visibility_off_vertical') {
    bad(`${SCORE_LIB}: a room that is ninety percent journalists was not refused as 'visibility_off_vertical'.`)
  }
}

// ── 3. An angle that feeds neither channel is generic by construction ───────
//
// Long-form is the asset and an appearance is distribution for it
// (krishanraja/mindmake, 02_PUBLICATION.md). A stage that feeds neither of the
// two channels is a mark against it, not a neutral fact, and the model is not
// trusted to remember that: the scorer forces it.
{
  const src = read(SCORE_LIB)
  if (!/generic_take:\s*parsed\.generic_take === true \|\|[\s\S]{0,200}feeds_channel === 'neither'/.test(src)) {
    bad(`${SCORE_LIB}: an angle that feeds neither channel is no longer forced generic. Long-form is the asset and an appearance is distribution for it, so "feeds neither" has to cost the stage something.`)
  }
  if (!/!String\(parsed\.angle \|\| ''\)\.trim\(\)/.test(src)) {
    bad(`${SCORE_LIB}: an empty angle is no longer forced generic. A row with no angle cannot be an appearance only he could give.`)
  }
}

// ── 4. No evidence is recorded as no evidence, never as a zero ──────────────
{
  const lib = read(SCORE_LIB)
  if (!/if \(parsed\.evidence_thin === true\) return null/.test(lib)) {
    bad(`${SCORE_LIB}: a thin-evidence response no longer returns null. Scoring it instead writes a number the material never supported, and on the card a low score and a failed judgement are the same pixels.`)
  }

  const route = read(SCORE_ROUTE)
  if (!/verdict: 'unjudged'/.test(route)) {
    bad(`${SCORE_ROUTE}: nothing writes verdict 'unjudged'. "We could not tell" and "we looked and it is wrong" are different facts and the card has to be able to say which.`)
  }
  // The axes must be nulled on that path, not left at whatever was there before.
  const unjudgedBlock = route.slice(route.indexOf("verdict: 'unjudged'"), route.indexOf("verdict: 'unjudged'") + 500)
  for (const col of ['room_score', 'standing_score', 'only_him_score', 'visibility_score']) {
    if (!new RegExp(`${col}:\\s*null`).test(unjudgedBlock)) {
      bad(`${SCORE_ROUTE}: the unjudged path does not null ${col}. A stale number under an 'unjudged' verdict is worse than either on its own.`)
    }
  }
  if (!/hasAnthropicKey\(\)/.test(route) || !/no_anthropic_key/.test(route)) {
    bad(`${SCORE_ROUTE}: no key is not handled as "write nothing and say so". With no way to judge, a corpus of zeroes is a corpus of refusals nothing computed.`)
  }
}

// ── 5. A refusal always carries a reason, from the one taxonomy ─────────────
{
  const sql = read(MIGRATION)
  if (!/verdict <> 'rejected' or reject_reason is not null/.test(sql)) {
    bad(`${MIGRATION}: the database no longer requires a reason on a rejection. A rejection with a null reason is a silent drop with extra steps, and the UI cannot enforce it.`)
  }
  if (!/check \(verdict is null or verdict in \('take', 'stretch', 'rejected', 'unjudged'\)\)/.test(sql)) {
    bad(`${MIGRATION}: the verdict set is no longer closed to the four the UI can label.`)
  }

  // Every code the scorer can emit must exist in the one vocabulary, or a whole
  // class of refusal reaches the learning loop with no usable reason on it.
  const emitted = Array.from(read(SCORE_LIB).matchAll(/reject_reason: '(visibility_[a-z_]+)'/g)).map(m => m[1])
  if (emitted.length < 6) {
    bad(`${SCORE_LIB}: only ${emitted.length} reject reasons are emitted. The judge has stopped distinguishing between the ways a stage can be wrong.`)
  }
  const known = new Set(SURFACES.visibility_targets.reasons.map(r => r.code))
  for (const code of new Set(emitted)) {
    if (!known.has(code)) {
      bad(`${SCORE_LIB} emits '${code}', which is not in the visibility_targets vocabulary in src/lib/servedSurfaces.ts. A code the UI cannot label reaches Vera as 'other'.`)
    }
  }
  // And the SQL constraint has to admit every one of them.
  for (const code of new Set(emitted)) {
    if (!sql.includes(`'${code}'`)) {
      bad(`${MIGRATION}: the reject_reason constraint does not admit '${code}', so that refusal fails to write at all and the row stays in the queue looking unjudged.`)
    }
  }
}

// ── 6. The legacy column is never the gate, and the scale gap still holds ───
{
  const scale = read(SCALE)
  if (!/n > 10 \? n \/ 10 : n/.test(scale)) {
    bad(`${SCALE}: legacyRelevanceOutOfTen no longer normalises the two scales. The column holds 7-9 from the nell-* sources and 72-95 from the nova_* ones, and three call sites once rendered an 88 as "88/10".`)
  }
  // The boundary at 10 is only safe because the corpus is empty between 10 and
  // 69. Assert the function's behaviour at both edges so a future change to it
  // is deliberate rather than incidental.
  if (legacyRelevanceOutOfTen(9) !== 9) bad(`${SCALE}: a 1-10 scale value of 9 no longer reads as 9/10.`)
  if (legacyRelevanceOutOfTen(88) !== 8.8) bad(`${SCALE}: a 0-100 scale value of 88 no longer reads as 8.8/10.`)
  if (legacyRelevanceOutOfTen(null) !== null) {
    bad(`${SCALE}: a missing score now returns a number. A default middling value is how the sweep produced a confident "score 38" for two rows that had no score, and those two rows became the entire evidence base for a proposed hard floor.`)
  }

  // Nothing in the gate may consult the legacy column. Comments are stripped
  // first: both files explain the two-scale history at length, and a guard that
  // punishes the explanation teaches the next reader to delete it.
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const f of [CLIENT_GATE, SURFACE]) {
    if (/relevance_score/.test(stripComments(read(f)))) {
      bad(`${f} reads relevance_score. That column is two scales at once, so any threshold on it is a source filter rather than a quality bar. Read visibility_score, or the legacy value through visibilityScale.`)
    }
  }
  const view = read(MIGRATION)
  const recommendable = view.slice(view.indexOf('create or replace view public.visibility_recommendable'))
  if (/relevance_score/.test(recommendable.slice(0, 700))) {
    bad(`${MIGRATION}: visibility_recommendable filters on relevance_score. The gate is the verdict.`)
  }
  for (const needle of ["verdict in ('take', 'stretch')", 'score_version = 1', 'buried_at is null']) {
    if (!recommendable.slice(0, 700).includes(needle)) {
      bad(`${MIGRATION}: visibility_recommendable no longer requires ${needle}. Every reader goes through the view and no reader remembers a rule.`)
    }
  }
}

// ── 7. The client gate and the server agree about the stretch cap ──────────
{
  if (STRETCH_CAP !== VISIBILITY_FLOORS.stretchCap) {
    bad(`${CLIENT_GATE} caps the stretch lane at ${STRETCH_CAP} and ${SCORE_LIB} at ${VISIBILITY_FLOORS.stretchCap}. A stretch lane that grows is the long tail coming back under a new name, and the two halves disagreeing is how it grows.`)
  }
  if (VISIBILITY_STANDARD_VERSION !== VISIBILITY_SCORE_VERSION) {
    bad(`${SCALE} reads score_version ${VISIBILITY_STANDARD_VERSION} and ${SCORE_LIB} writes ${VISIBILITY_SCORE_VERSION}. A corpus judged under two regimes would be silently mixed, or the surface would show nothing at all and look broken.`)
  }
}

// ── 8. The floors are a conjunction in the client too ──────────────────────
//
// The server writes the verdict; the client must not re-derive it from a number
// or re-admit a row the server refused. This is the hole a view cannot close
// from the other side.
{
  const gate = read(CLIENT_GATE)
  if (!/verdict === 'rejected'/.test(gate) || !/verdict === 'take'/.test(gate)) {
    bad(`${CLIENT_GATE}: the client no longer partitions by verdict. Deriving worth from a score here would mean two different standards, one of which nobody is guarding.`)
  }
  if (/visibility_score\s*>=?\s*\d/.test(gate)) {
    bad(`${CLIENT_GATE}: the client applies its own numeric threshold. The floors live in ${SCORE_LIB} once; a second copy drifts.`)
  }
  if (!/slice\(0, STRETCH_CAP\)/.test(gate)) {
    bad(`${CLIENT_GATE}: the stretch lane is no longer capped.`)
  }
}

// ── 9. The surface is honestly empty, and it never sends ───────────────────
{
  const ui = read(SURFACE)
  if (!/worth-taking-empty/.test(ui)) {
    bad(`${SURFACE}: there is no empty state. Applied to the live corpus today the take lane is EMPTY, and an empty board that names what is missing is the whole point.`)
  }
  for (const state of ['never-run', 'nothing-clears']) {
    if (!ui.includes(state)) {
      bad(`${SURFACE}: the '${state}' empty state is gone. "The standard has never run" is a gap in the system and "nothing cleared the bar" is a verdict on the world, and collapsing them is how a lane goes fifteen days without a row while nothing on screen says so.`)
    }
  }
  if (!/refused-by-standard/.test(ui)) {
    bad(`${SURFACE}: the refusals are no longer shown. A weak target that vanishes teaches nobody anything and hides a generator that cannot justify its output.`)
  }
  if (!/rejectSentence\(/.test(ui)) {
    bad(`${SURFACE}: a refusal no longer prints a sentence. A raw code at a reader is a category name, not an explanation.`)
  }
  for (const banned of ['mailto:', 'sendMail', '/api/bridges/send', 'gmail.users.messages.send']) {
    if (ui.includes(banned)) {
      bad(`${SURFACE} reaches ${banned}. This surface records what Krish did; it never sends. The OS is pull-only.`)
    }
  }
  const route = read(SCORE_ROUTE)
  for (const banned of ['sendMail', 'messages.send', 'emailDraft', 'instantly']) {
    if (route.includes(banned)) {
      bad(`${SCORE_ROUTE} reaches ${banned}. Scoring writes a verdict Krish reads and nothing else.`)
    }
  }
}

// ── 10. The hook declares the standard's columns ────────────────────────────
{
  const hook = read(HOOK)
  for (const col of ['room_score', 'standing_score', 'only_him_score', 'visibility_score', 'verdict', 'reject_reason', 'who_is_in_the_room', 'why_him', 'score_version']) {
    if (!hook.includes(col)) {
      bad(`${HOOK}: ${col} is not declared, so the surface cannot read it and a verdict written by the cron would never reach the screen.`)
    }
  }
}

// ── 11. isDeadDate is arithmetic, not a judgement ──────────────────────────
{
  const past = { event_start_at: '2020-01-01T00:00:00Z', deadline_at: null }
  const future = { event_start_at: '2099-01-01T00:00:00Z', deadline_at: null }
  const rubbish = { event_start_at: 'not a date', deadline_at: null }
  if (!isDeadDate(past)) bad(`${SCORE_LIB}: isDeadDate missed a date in 2020.`)
  if (isDeadDate(future)) bad(`${SCORE_LIB}: isDeadDate called 2099 dead.`)
  if (isDeadDate(rubbish)) {
    bad(`${SCORE_LIB}: isDeadDate treats an unparseable date as passed. An unparseable date is an unknown date, and killing a row for it hides the real defect.`)
  }
  if (isDeadDate({ event_start_at: null, deadline_at: null })) {
    bad(`${SCORE_LIB}: isDeadDate treats a row with no dates as dead. A podcast has no date and is not dead.`)
  }
}

// ── 12. The weights still say the sentences the comment claims ─────────────
{
  const w = VISIBILITY_WEIGHTS
  if (w.room.decider <= 0) bad(`${SCORE_LIB}: the room axis no longer rewards decision-makers.`)
  for (const [k, v] of Object.entries(w.room)) {
    if (k === 'decider' || k === 'seniority') continue
    if (v >= 0) bad(`${SCORE_LIB}: room weight '${k}' is ${v}, no longer a penalty.`)
  }
  if (w.room.press >= 0) {
    bad(`${SCORE_LIB}: press density is no longer a penalty on the room. 74 of 129 rows in this table were journalists, 64 marked green, none ever acted on.`)
  }
  if (Object.values(w.standing).some(v => v <= 0)) {
    bad(`${SCORE_LIB}: a standing weight is not positive. Standing has no penalty terms; pay-to-play is a gate, not a deduction.`)
  }
  if (VISIBILITY_FLOORS.room <= 50 || VISIBILITY_FLOORS.onlyHim <= 50) {
    bad(`${SCORE_LIB}: a floor has dropped to 50 or below. On a conjunction that is lower than the rejected proposal was on a mean, and Krish asked for the standard to be high.`)
  }
  if (VISIBILITY_FLOORS.stretchStanding >= VISIBILITY_FLOORS.standing) {
    bad(`${SCORE_LIB}: the stretch standing floor is not below the take standing floor, so the stretch lane is either empty or the same lane twice.`)
  }
}

console.log(fail === 0
  ? 'check-visibility-standard: OK'
  : `check-visibility-standard: ${fail} failure(s)`)
process.exit(fail === 0 ? 0 : 1)
