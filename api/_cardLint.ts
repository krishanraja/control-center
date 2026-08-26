// The card contract, enforced. Final brief section 2 (27 Aug), superseding the
// four-field contract in the 26 Aug brief.
//
// Six fields now. The two new ones exist because the ranked slate rejected
// items for two repeated reasons that the old contract had no field for:
//
//   backward-looking   "too opinion based and not enough analysis + prediction"
//                      -> where_this_goes
//   no consequence     "so what? ... I dont understand why it matters or who
//                      it matters to"
//                      -> reader_decision
//
// And four hard gates. Three are new and come straight from the commentary
// (legibility, saturation, tone); the fourth is the_opening lint from the
// previous brief, unchanged and still the largest single source of rejections.
//
// The design rule throughout: a gate is only worth having if it can fail
// mechanically. Anything needing judgment is a krish-voice handoff, not a lint,
// because a check that quietly passes everything is worse than no check.
//
// ---------------------------------------------------------------------------
// One contradiction in the source brief, resolved and flagged:
//
// Section 2's heading says the contract "gains two fields and loses one", but
// the body adds two, explicitly keeps the_opening, and never names a loss.
// Section 10 step 3 then says "Six fields, four gates", and 4 + 2 = 6. So the
// body and the sequence agree on six and only the heading disagrees. Six is
// implemented. If a field was meant to be dropped, it needs naming.
// ---------------------------------------------------------------------------

export interface Card {
  headline: string
  what_changed: string
  why_now: string
  the_opening: string
  /** A falsifiable forward claim. Continuation of the current trend is not one. */
  where_this_goes: string
  /** A decision the reader already owns, whose inputs this changes. Not an action. */
  reader_decision: string
}

export interface LintContext {
  /** 0 to 1. How saturated the story already is in general AI and media press.
   *  Absent means unmeasured, and an unmeasured card is not failed on it. */
  coverageDensity?: number
}

export interface LintFailure {
  field: keyof Card | 'card'
  rule: string
  detail: string
}

/** Above this, the story is already everywhere. "a million people will do a
 *  linkedin post on this one". Tune against the golden ten once it exists. */
export const SATURATION_LIMIT = 0.7

const BANNED_OPENERS = [
  'Audit', 'Treat', 'Reassess', 'Stop', 'Scrutinise', 'Scrutinize', 'Secure',
  'Establish', 'Reforecast', 'Model your', 'Do not wait', 'Prepare for',
  'Ensure', 'Consider', 'Make sure', 'It is important to', 'Organisations should',
  'Organizations should', 'Leaders must',
]

/** The general case the banned list is a special case of. A sentence opening
 *  with a bare verb and no subject is an order. Closed list on purpose: a wrong
 *  auto-fail on a real card costs more than a miss. */
const IMPERATIVE_OPENERS = [
  'build', 'buy', 'sell', 'start', 'begin', 'create', 'add', 'remove', 'move',
  'shift', 'switch', 'route', 'check', 'review', 'assess', 'evaluate', 'measure',
  'track', 'monitor', 'watch', 'plan', 'budget', 'forecast', 'invest', 'spend',
  'cut', 'reduce', 'increase', 'raise', 'lower', 'negotiate', 'renegotiate',
  'demand', 'require', 'insist', 'push', 'pull', 'run', 'test', 'pilot',
  'adopt', 'drop', 'avoid', 'protect', 'defend', 'harden', 'lock', 'limit',
  'cap', 'gate', 'own', 'take', 'get', 'make', 'use', 'apply', 'expect',
  'assume', 'remember', 'note', 'look', 'ask', 'tell', 'talk',
  'rethink', 'revisit', 'rewrite', 'redesign', 'rebuild', 'refactor',
]

const RISK_OWNER_TERMS = [
  'compliance', 'governance', 'risk register', 'audit trail', 'red-team',
  'red team', 'exposure', 'posture', 'mitigate', 'mitigation', 'liability',
  'incident response', 'controls', 'policy document', 'oversight framework',
]

const POLICY_SATISFIABLE = [
  'policy', 'framework', 'process', 'guidelines', 'guidance', 'standards',
  'documentation', 'checklist', 'training', 'awareness', 'best practice',
]

const BUZZWORDS = [
  'unlock', 'transform', 'revolutionise', 'revolutionize', 'paradigm',
  'game-changer', 'game changer', 'landscape', 'journey',
]

/** Technical vocabulary a general-business reader would have to look up.
 *  Deliberately NOT commercial vocabulary: a revenue chief knows ARPU, take
 *  rate, churn and margin, and banning those would fail the exact sentences the
 *  Money channel exists to write. Jargon in what_changed is fine; the brief
 *  says jargon in the evidence is allowed and jargon in the claim is not. */
const TECHNICAL_JARGON = [
  'inference', 'token', 'tokens', 'rag', 'retrieval-augmented', 'fine-tune',
  'fine-tuning', 'embedding', 'embeddings', 'vector', 'orchestration',
  'harness', 'eval', 'evals', 'agentic', 'llm', 'llms', 'context window',
  'multimodal', 'throughput', 'latency', 'sdk', 'middleware', 'inference stack',
  'prompt injection', 'sandbox', 'parameter', 'parameters', 'quantisation',
  'quantization', 'checkpoint', 'weights', 'open-weight', 'transformer',
]

/** Moral framing. Present on its own this is fine; present with nothing
 *  underneath it is a crusade. "I dont want to sound like I'm outraged or on a
 *  crusade." */
const INDIGNATION = [
  'outrageous', 'outrage', 'shameful', 'shameless', 'scandal', 'scandalous',
  'disgrace', 'disgraceful', 'appalling', 'unacceptable', 'egregious',
  'must be stopped', 'should not be allowed', 'nobody should', 'it is wrong that',
  'exploitative', 'predatory', 'cynical', 'brazen',
]

/** Explicit continuation. "A claim that the current direction continues is not
 *  a forward claim and fails the field." */
const CONTINUATION = [
  'will continue', 'continues to', 'will keep', 'keeps going', 'more of the same',
  'further consolidation', 'this trend will', 'the trend continues',
  'will only accelerate', 'shows no sign of', 'is here to stay',
]

/** Something a forward claim can be checked against later. */
const FALSIFIABLE_MARK = /\d|\b(by|within|before|during)\s+(the\s+)?(20\d\d|next|this|end|first|second|third|fourth|q[1-4]|\d+\s*(month|year|quarter|week))/i

/** Decision framing, as opposed to instruction. */
const DECISION_MARK = /\b(whether|which|how much|how many|when to|who to|what to|trade[- ]off|choose|chooses|choice|decide|decides|decision|weigh|weighs|between)\b/i

const HEDGE_STACK = /\b(may|might|could)\s+(potentially|possibly)\b|\b(may|might|could)\s+\w+\s+to\s+(begin|start)\b/i

const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean)
const firstWord = (s: string) => (s.trim().match(/^[A-Za-z'-]+/) || [''])[0].toLowerCase()
const has = (hay: string, needles: string[]) =>
  needles.find(n => new RegExp(`\\b${n.replace(/[-\s]/g, '[-\\s]')}\\b`, 'i').test(hay))

export function lintCard(card: Card, ctx: LintContext = {}): LintFailure[] {
  const fails: LintFailure[] = []
  const add = (field: LintFailure['field'], rule: string, detail: string) =>
    fails.push({ field, rule, detail })

  const all = [card.headline, card.what_changed, card.why_now, card.the_opening,
    card.where_this_goes, card.reader_decision].filter(Boolean).join('\n')

  // The CLAIM, as distinct from the evidence. what_changed is deliberately
  // excluded: that is where the evidence lives and jargon is allowed there.
  const claim = [card.headline, card.the_opening, card.where_this_goes,
    card.reader_decision].filter(Boolean).join('\n')

  // ── whole card ──────────────────────────────────────────────────────────
  if (/[—–]/.test(all)) add('card', 'no_em_dash', 'em dash or en dash in generated copy')
  const buzz = has(all, BUZZWORDS)
  if (buzz) add('card', 'buzzword', `"${buzz}"`)
  if (/\bleverag(e|es|ed|ing)\b(?!\s+(ratio|effect|point))/i.test(all)) {
    add('card', 'buzzword', '"leverage" as a verb')
  }
  if (/\bat scale\b/i.test(all)) add('card', 'buzzword', '"at scale" as filler')

  // ── gate: legibility ────────────────────────────────────────────────────
  // "if the card cannot be restated in two sentences using no term a general
  //  business reader would need to look up, it fails"
  const jargon = has(claim, TECHNICAL_JARGON)
  if (jargon) {
    add('card', 'legibility',
      `the claim uses "${jargon}", which a general-business reader would look up. Jargon belongs in the evidence, not the claim`)
  }

  // ── gate: saturation ────────────────────────────────────────────────────
  if (typeof ctx.coverageDensity === 'number' && ctx.coverageDensity > SATURATION_LIMIT) {
    add('card', 'saturation',
      `coverage density ${ctx.coverageDensity.toFixed(2)} is above ${SATURATION_LIMIT}. Everyone is already writing this one`)
  }

  // ── gate: tone ──────────────────────────────────────────────────────────
  // "strip the moral framing and see whether a claim remains. If nothing
  //  remains, discard."
  //
  // Runs on the headline and the opening only, NOT the whole claim. The first
  // version read where_this_goes too, and a separate rule requires that field
  // to carry a number or a date, so the survival test passed on that number
  // every time and this gate could essentially never fire. One required rule
  // silently disabling another is the kind of fault a green test suite hides,
  // which is why the guard asserts the gate fires rather than only that it exists.
  const crusade = [card.headline, card.the_opening].filter(Boolean).join(' ')
  const moral = has(crusade, INDIGNATION)
  if (moral) {
    const stripped = INDIGNATION.reduce(
      (acc, w) => acc.replace(new RegExp(w.replace(/[-\s]/g, '[-\\s]'), 'ig'), ''), crusade)
    // Lowercase each sentence's first letter so a sentence-initial capital is
    // not mistaken for a named party.
    const noLead = stripped.replace(/(^|[.!?]\s+)([A-Z])/g, (_m, p, c) => p + c.toLowerCase())
    const survives = /\d/.test(noLead) || /\b[A-Z][a-zA-Z]{2,}\b/.test(noLead)
    if (!survives) {
      add('card', 'tone',
        `"${moral}" is carrying the claim. Strip the moral framing and no number or named party is left`)
    }
  }

  // ── headline ────────────────────────────────────────────────────────────
  if (!card.headline?.trim()) add('headline', 'required', 'missing')
  if (card.headline?.includes(':')) add('headline', 'no_colon', 'a colon turns the shift into a label plus a topic')
  if (/\bthe week (that|when|ai)\b/i.test(card.headline || '')) {
    add('headline', 'no_week_framing', '"the week that ..." dates the shift to one week')
  }

  // ── what_changed ────────────────────────────────────────────────────────
  const wc = sentences(card.what_changed || '')
  if (!wc.length) add('what_changed', 'required', 'missing')
  else if (wc.length < 2 || wc.length > 4) add('what_changed', 'length', `${wc.length} sentences, needs 2 to 4`)
  const hasNumber = /\d/.test(card.what_changed || '')
  const hasName = /(?:^|[.!?]\s+|\s)([A-Z][a-zA-Z]+)/.test(
    (card.what_changed || '').replace(/^[A-Z]/, c => c.toLowerCase()))
  if (!hasNumber && !hasName) add('what_changed', 'no_evidence', 'contains no number, name or date')
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
  if (banned) add('the_opening', 'banned_opener', `opens with "${banned}", which instructs rather than shows`)
  else if (IMPERATIVE_OPENERS.includes(firstWord(op))) {
    add('the_opening', 'imperative_mood',
      `opens with the command "${firstWord(op)}". Show the opening, do not issue it`)
  }
  const risk = has(op, RISK_OWNER_TERMS)
  if (risk) add('the_opening', 'risk_owner', `"${risk}" addresses the person who owns exposure, not revenue`)
  const policy = has(op, POLICY_SATISFIABLE)
  if (policy) add('the_opening', 'satisfiable_by_doing_nothing', `"${policy}" can be complied with by writing a document`)

  // ── where_this_goes ─────────────────────────────────────────────────────
  const wtg = (card.where_this_goes || '').trim()
  if (!wtg) {
    add('where_this_goes', 'required', 'missing: a card with no forward claim is a summary of the past')
  } else {
    const cont = has(wtg, CONTINUATION)
    if (cont) {
      add('where_this_goes', 'continuation_not_claim',
        `"${cont}" says the current direction continues, which is not a forward claim`)
    }
    if (!FALSIFIABLE_MARK.test(wtg)) {
      add('where_this_goes', 'not_falsifiable',
        'no number and no timeframe, so nobody could ever say it was wrong')
    }
  }

  // ── reader_decision ─────────────────────────────────────────────────────
  const rd = (card.reader_decision || '').trim()
  if (!rd) {
    add('reader_decision', 'required', 'missing: name the decision this changes the inputs to')
  } else {
    // "Reprice your AI features before the next renewal" is an instruction, and
    // no enumerated verb list will ever contain every verb. The structural tell
    // is a bare verb aimed at the reader's own things: "<verb> your ...". That
    // plus the enumerated openers catches the shape rather than the vocabulary.
    const instructing = IMPERATIVE_OPENERS.includes(firstWord(rd)) ||
      BANNED_OPENERS.some(b => rd.toLowerCase().startsWith(b.toLowerCase())) ||
      /^[A-Za-z'-]+\s+(your|their)\b/i.test(rd)
    if (!DECISION_MARK.test(rd)) {
      // The two are mutually exclusive: name the specific fault where it is
      // recognisable, and fall back to the general one where it is not.
      if (instructing) {
        add('reader_decision', 'action_not_decision',
          `"${firstWord(rd)}" is an instruction. Name a decision the reader already owns, not one you are giving them`)
      } else {
        add('reader_decision', 'no_decision_named',
          'no decision here. It should read as a choice the reader faces, such as whether, which, how much or when')
      }
    }
  }

  return fails
}

export const cardPasses = (card: Card, ctx: LintContext = {}) => lintCard(card, ctx).length === 0

export const LINT_VOCAB = {
  BANNED_OPENERS, IMPERATIVE_OPENERS, RISK_OWNER_TERMS, POLICY_SATISFIABLE,
  BUZZWORDS, TECHNICAL_JARGON, INDIGNATION, CONTINUATION,
}
