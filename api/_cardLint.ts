// C3 of the Content Engine rewrite: the card contract, enforced.
//
// The audit found 21 of 22 "New shift" cards opening with a defensive
// imperative — Audit, Treat, Reassess, Stop, Scrutinise, Secure, Reforecast,
// Model your. The engine was writing a risk register wearing a newsletter's
// haircut, addressed to a CISO, for a reader whose job is to create gain.
//
// The brief enumerates the banned openers. Checked against the 17 real
// shift_proposal so-whats in the archive, that list catches 16. The one it
// misses is instructive:
//
//   "Build government-relations and compliance capacity now"
//
// Defensive, instructional, addressed to a risk-owner, and it starts with a
// word no list would ban. An enumerated list of first words will always leak,
// because the defect is not the vocabulary. It is the MOOD: every one of the 17
// is a command issued to the reader.
//
// So the list stays (it names the specific habit, and a named failure teaches
// better than a general one), and underneath it sits the structural rule the
// list is a special case of: `the_opening` may not be an imperative at all.
// The four things the brief says it MAY be are all descriptions of the world —
// an opening someone could take, a mispricing in motion, something a player is
// getting away with, a position nobody owns. None of those is phrased as an
// order. "Inspire, do not tell" is a checkable property, not a vibe.

export interface Card {
  headline: string
  what_changed: string
  why_now: string
  the_opening: string
}

export interface LintFailure {
  field: keyof Card | 'card'
  rule: string
  detail: string
}

/** Named in the brief. Kept explicit so the specific habit is reported by name
 *  rather than folded into the general imperative rule. */
const BANNED_OPENERS = [
  'Audit', 'Treat', 'Reassess', 'Stop', 'Scrutinise', 'Scrutinize', 'Secure',
  'Establish', 'Reforecast', 'Model your', 'Do not wait', 'Prepare for',
  'Ensure', 'Consider', 'Make sure', 'It is important to', 'Organisations should',
  'Organizations should', 'Leaders must',
]

/** The general case. A sentence that starts with a bare verb and no subject is
 *  an order. This is what catches "Build government-relations capacity now".
 *  Deliberately a closed list rather than a part-of-speech guess: a wrong
 *  auto-fail on a real card is worse than a miss, and this list can grow from
 *  observed output. */
const IMPERATIVE_OPENERS = [
  'build', 'buy', 'sell', 'start', 'begin', 'create', 'add', 'remove', 'move',
  'shift', 'switch', 'route', 'check', 'review', 'assess', 'evaluate', 'measure',
  'track', 'monitor', 'watch', 'plan', 'budget', 'forecast', 'invest', 'spend',
  'cut', 'reduce', 'increase', 'raise', 'lower', 'negotiate', 'renegotiate',
  'demand', 'require', 'insist', 'push', 'pull', 'run', 'test', 'pilot',
  'adopt', 'drop', 'avoid', 'protect', 'defend', 'harden', 'lock', 'limit',
  'cap', 'gate', 'own', 'take', 'get', 'make', 'use', 'apply', 'expect',
  'assume', 'remember', 'note', 'watch out', 'look', 'ask', 'tell', 'talk',
  'rethink', 'revisit', 'rewrite', 'redesign', 'rebuild', 'refactor',
]

/** Risk-owner vocabulary. The reader is a revenue-owner; a card written for the
 *  person who owns exposure is mis-addressed even when it is true. */
const RISK_OWNER_TERMS = [
  'compliance', 'governance', 'risk register', 'audit trail', 'red-team',
  'red team', 'exposure', 'posture', 'mitigate', 'mitigation', 'liability',
  'incident response', 'controls', 'policy document', 'oversight framework',
]

/** Satisfiable by writing something down and filing it. If the reader can
 *  comply without spending, pricing, shipping or repositioning anything, the
 *  opening is not an opening. */
const POLICY_SATISFIABLE = [
  'policy', 'framework', 'process', 'guidelines', 'guidance', 'standards',
  'documentation', 'checklist', 'training', 'awareness', 'best practice',
]

const BUZZWORDS = [
  'unlock', 'transform', 'revolutionise', 'revolutionize', 'paradigm',
  'game-changer', 'game changer', 'landscape', 'journey',
]

/** "leverage" only as a verb: the noun is a real financial word and banning it
 *  outright would fail an honest sentence about debt or negotiating position. */
const LEVERAGE_VERB = /\bleverag(e|es|ed|ing)\b(?!\s+(ratio|effect|point))/i

/** "at scale" as filler, i.e. not attached to a number or a named thing. */
const AT_SCALE_FILLER = /\bat scale\b/i

const HEDGE_STACK = /\b(may|might|could)\s+(potentially|possibly)\b|\b(may|might|could)\s+\w+\s+to\s+(begin|start)\b/i

const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean)
const firstWord = (s: string) => (s.trim().match(/^[A-Za-z'-]+/) || [''])[0].toLowerCase()

export function lintCard(card: Card): LintFailure[] {
  const fails: LintFailure[] = []
  const add = (field: LintFailure['field'], rule: string, detail: string) =>
    fails.push({ field, rule, detail })

  const all = `${card.headline}\n${card.what_changed}\n${card.why_now}\n${card.the_opening}`

  // ── Whole card ──────────────────────────────────────────────────────────
  if (/[—–]/.test(all)) {
    add('card', 'no_em_dash', 'em dash or en dash in generated copy')
  }
  for (const w of BUZZWORDS) {
    if (new RegExp(`\\b${w.replace('-', '[- ]')}\\b`, 'i').test(all)) {
      add('card', 'buzzword', `"${w}"`)
    }
  }
  if (LEVERAGE_VERB.test(all)) add('card', 'buzzword', '"leverage" as a verb')
  if (AT_SCALE_FILLER.test(all)) add('card', 'buzzword', '"at scale" as filler')

  // ── headline ────────────────────────────────────────────────────────────
  if (!card.headline?.trim()) add('headline', 'required', 'missing')
  if (card.headline?.includes(':')) {
    add('headline', 'no_colon', 'a colon turns the shift into a label plus a topic')
  }
  if (/\bthe week (that|when|ai)\b/i.test(card.headline || '')) {
    add('headline', 'no_week_framing', '"the week that ..." dates the shift to one week')
  }

  // ── what_changed ────────────────────────────────────────────────────────
  const wc = sentences(card.what_changed || '')
  if (!wc.length) add('what_changed', 'required', 'missing')
  else if (wc.length < 2 || wc.length > 4) {
    add('what_changed', 'length', `${wc.length} sentences, needs 2 to 4`)
  }
  // A mechanism with no number, name or date is a summary of a mood.
  const hasNumber = /\d/.test(card.what_changed || '')
  const hasProperNoun = /(?:^|[.!?]\s+|\s)([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/.test(
    (card.what_changed || '').replace(/^[A-Z]/, c => c.toLowerCase()))
  if (!hasNumber && !hasProperNoun) {
    add('what_changed', 'no_evidence', 'contains no number, name or date')
  }
  if (HEDGE_STACK.test(card.what_changed || '')) {
    add('what_changed', 'hedge_stack', 'stacked hedging ("may potentially begin to")')
  }

  // ── why_now ─────────────────────────────────────────────────────────────
  const wn = sentences(card.why_now || '')
  if (!wn.length) add('why_now', 'required', 'missing: this is what separates a shift from news')
  else if (wn.length > 2) add('why_now', 'length', `${wn.length} sentences, needs 1 or 2`)

  // ── the_opening ─────────────────────────────────────────────────────────
  const op = (card.the_opening || '').trim()
  const ops = sentences(op)
  if (!ops.length) add('the_opening', 'required', 'missing')
  else if (ops.length > 3) add('the_opening', 'length', `${ops.length} sentences, needs 1 to 3`)

  const banned = BANNED_OPENERS.find(b => op.toLowerCase().startsWith(b.toLowerCase()))
  if (banned) {
    add('the_opening', 'banned_opener', `opens with "${banned}", which instructs rather than shows`)
  } else if (IMPERATIVE_OPENERS.includes(firstWord(op))) {
    // The general rule the banned list is a special case of.
    add('the_opening', 'imperative_mood',
      `opens with the command "${firstWord(op)}". Show the opening, do not issue it`)
  }

  const risk = RISK_OWNER_TERMS.find(t => op.toLowerCase().includes(t))
  if (risk) add('the_opening', 'risk_owner', `"${risk}" addresses the person who owns exposure, not revenue`)

  const policy = POLICY_SATISFIABLE.find(t => op.toLowerCase().includes(t))
  if (policy) {
    add('the_opening', 'satisfiable_by_doing_nothing',
      `"${policy}" can be complied with by writing a document`)
  }

  return fails
}

export const cardPasses = (card: Card) => lintCard(card).length === 0

/** Exported for the guard, so the rule lists are testable and countable rather
 *  than restated in a second place that can drift. */
export const LINT_VOCAB = {
  BANNED_OPENERS, IMPERATIVE_OPENERS, RISK_OWNER_TERMS, POLICY_SATISFIABLE, BUZZWORDS,
}
