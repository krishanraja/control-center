// The theory layer for the Focus & Purpose home. Curated and static on
// purpose, exactly like the stoic library (src/lib/pilotStoic.ts): it sits on
// interaction paths that must never wait on a network call, it works offline,
// and it cannot drift from what was actually agreed.
//
// PROVENANCE. Every entry distils one of two committed sources:
//   docs/focus-purpose/OPERATING-MANUAL.md   the evidence-graded communication
//                                            and commercial operating manual
//   docs/focus-purpose/PURPOSE-WORKBOOK.md   the ranked ikigai answers, the
//                                            decision rules, and the wealth
//                                            route synthesis
// Edit those documents first, then reflect the change here. This file is the
// on-tap slice; the documents are the corpus.
//
// TONE, non-negotiable and inherited from the pilot layer: direct, calm, zero
// reassurance, zero motivational language, no exclamation marks. The operator
// ruminates and over-monitors; a system that adds self-consciousness makes him
// worse. Every surface built from this file therefore ends in one move, keeps
// no archive, and never scores him.

// ── The diagnosis ────────────────────────────────────────────────────────────

/**
 * The mechanism in one line, from the manual's executive diagnosis. Not "bad at
 * selling": avoidance of interpersonal exposure under status uncertainty,
 * compensated for with intellectual performance.
 */
export const DIAGNOSIS =
  'The pattern is not a capability gap. When stakes become personal, analysis, completeness and preparation stand in for making a testable ask and tolerating the answer.'

/** The three highest-leverage changes, in the manual's order. */
export const LEVERAGE = [
  'Question, summarize, then offer a hypothesis.',
  'Make explicit, bounded asks without apology.',
  'Train with exposure, not with more preparation.',
] as const

// ── Purpose: one line a day, rotated deterministically ───────────────────────

export interface PurposeLine {
  line: string
  /** Where in the corpus this comes from, shown faintly so it reads as his own record, not a poster. */
  source: string
}

/**
 * Drawn from the workbook: the ranked answers, the four contradictions, the
 * wealth route synthesis. These are his own conclusions, surfaced back one at a
 * time. Never more than one on screen.
 */
export const PURPOSE_LINES: PurposeLine[] = [
  {
    line: 'The engagement is the collection mechanism. The collection is the asset. The audience is distribution for both.',
    source: 'Scoring workbook, the shape that survived',
  },
  {
    line: 'Own a collection nobody else can assemble. Audience, equity and acquisition are delivery mechanisms, not the asset.',
    source: 'Wealth routes synthesis',
  },
  {
    line: 'Foresight is the edge people already come to you for. The ask is the part that needs practice.',
    source: 'Ikigai batch one, B1 to B5',
  },
  {
    line: 'You want ownership that runs without you. Fee-only work never gets there.',
    source: 'Decision rule 5',
  },
  {
    line: 'Teaching at scale is repetition. Either a system carries the repetition or the plan dies by month four.',
    source: 'Contradiction 1',
  },
  {
    line: 'The nearest risk is the one you rank least painful. Watch the runway before the vision.',
    source: 'Contradiction 4',
  },
  {
    line: 'A no means this request did not obtain agreement under these conditions. It does not establish your value.',
    source: 'Operating manual, anti-self-rejection rules',
  },
  {
    line: 'Preparation is not exposure. One relevant ask today beats another pass on the materials.',
    source: 'Operating manual, thirty-day programme',
  },
]

/** Deterministic per civil day, matching how stoicFor picks its line. */
export function purposeFor(ymd: string): PurposeLine {
  let hash = 0
  for (let i = 0; i < ymd.length; i += 1) hash = (hash * 31 + ymd.charCodeAt(i)) >>> 0
  return PURPOSE_LINES[hash % PURPOSE_LINES.length]
}

// ── The traps: name what is running, get the counter-move ────────────────────

export type TrapHandoff = 'ask' | 'compile' | null

export interface Trap {
  id: string
  /** Chip label. Phrased as the state, not an accusation. */
  chip: string
  /** The counter-move. Imperative, at most two sentences, then stop. */
  move: string
  /** The if-then line that makes the move automatic next time. */
  ifThen: string
  /** Where the move continues, when it does: the ask card or the worry compiler. */
  handoff: TrapHandoff
}

/**
 * The manual's real-time diagnostic and if-then plans, compressed to the six
 * states that actually recur. Naming the trap IS the intervention; the move
 * ends the interaction. Nothing here is logged, counted, or charted.
 */
export const TRAPS: Trap[] = [
  {
    id: 'correcting',
    chip: 'About to correct someone',
    move: 'Ask one question first: what leads you to that conclusion? If the point does not change the decision, let it pass.',
    ifThen: 'If I notice the urge to correct, then I ask before I state.',
    handoff: null,
  },
  {
    id: 'overexplaining',
    chip: 'Explaining too much',
    move: 'Stop at ninety seconds. Ask which part is most relevant, and let silence do some of the work.',
    ifThen: 'If I pass ninety seconds uninvited, then I stop and ask what matters most.',
    handoff: null,
  },
  {
    id: 'avoiding_ask',
    chip: 'Avoiding an ask',
    move: 'The burden belief is a prediction, not a fact, and people underestimate compliance by half. Send the bounded version now, with one easy decline.',
    ifThen: 'If I catch myself waiting to feel less burdensome, then I make the ask while the feeling is still there.',
    handoff: 'ask',
  },
  {
    id: 'polishing',
    chip: 'Building instead of asking',
    move: 'Productive-looking work is the disguise avoidance wears. One relevant ask leaves the machine before any more preparation.',
    ifThen: 'If I delay outreach to improve materials, then I send one ask first.',
    handoff: 'ask',
  },
  {
    id: 'relitigating',
    chip: 'Reopening a decided thing',
    move: 'One question only: what new evidence arrived since it was decided? Discomfort is not evidence.',
    ifThen: 'If a settled decision reopens itself, then I compile it and let the evidence question close it.',
    handoff: 'compile',
  },
  {
    id: 'spiralling',
    chip: 'Spiralling on a worry',
    move: 'A worry is a prediction wearing a disguise. Compile it into one terminal state and put it down.',
    ifThen: 'If a worry loops twice, then it goes through the compiler, not another lap.',
    handoff: 'compile',
  },
]

// ── Situations: the script bank, at the point of use ─────────────────────────

export interface Situation {
  id: string
  chip: string
  /** The better sequence, three to five short lines, spoken in order. */
  sequence: string[]
  /** What not to say. One line. */
  not: string
  /** The stop-talking point. One line. */
  stop: string
}

/**
 * The manual's script and situation bank, cut to the ten that recur in his
 * commercial life. Sequences are near-verbatim; wording stays his register:
 * blunt, evidence-first, no ingratiating filler.
 */
export const SITUATIONS: Situation[] = [
  {
    id: 'discovery',
    chip: 'Opening discovery',
    sequence: [
      'What decision are you under the most pressure to make this quarter?',
      'What would make that decision defensible to the board?',
      'Let me test a hypothesis based on that.',
    ],
    not: 'Here is what you need to do.',
    stop: 'Stop after the first question.',
  },
  {
    id: 'selling',
    chip: 'Selling the work',
    sequence: [
      'What is the decision you cannot afford to get wrong?',
      'If that is the issue, I recommend a defined diagnostic, not a broad engagement.',
      'State the price. Then stop.',
    ],
    not: 'We do advisory, workshops, cohorts, software, strategy, agents, data.',
    stop: 'Stop after the proposed next step, and price if asked.',
  },
  {
    id: 'intro',
    chip: 'Asking for an intro',
    sequence: [
      'Would you be comfortable introducing me to [name]? I would like to discuss [specific issue].',
      'I will send a three-sentence forwardable note.',
      'If it is not appropriate, please say so.',
    ],
    not: 'No worries at all, I know you are busy, this is probably too much to ask.',
    stop: 'Stop after the easy-decline sentence.',
  },
  {
    id: 'referral',
    chip: 'Asking for a referral',
    sequence: [
      'Do you know one CEO or transformation leader accountable for an AI investment decision this quarter?',
      'I would value an introduction if someone specific comes to mind.',
    ],
    not: 'Please keep me in mind.',
    stop: 'Stop after the category and one ask.',
  },
  {
    id: 'fee',
    chip: 'Stating a fee',
    sequence: [
      'For this scope, the fee is X. It includes three concrete outputs.',
      'If the budget is lower, we reduce scope to a defined alternative.',
    ],
    not: 'I know this may sound high, but I can probably make something work.',
    stop: 'Stop after the scope-price tradeoff. No discount before an objection.',
  },
  {
    id: 'decision',
    chip: 'Asking for a decision',
    sequence: [
      'Based on what we have discussed, do you want to proceed at X, decline, or decide after [missing input] by [date]?',
    ],
    not: 'Let me know your thoughts. Take your time.',
    stop: 'Stop after the three-option question.',
  },
  {
    id: 'followup',
    chip: 'Following up',
    sequence: [
      'Following up on [decision]. You said [context].',
      'Is this still active, should we schedule the next step, or should I close the loop?',
    ],
    not: 'Sorry to chase. Just bumping this in case it got lost.',
    stop: 'Stop after the three-way close. Two follow-ups, then done.',
  },
  {
    id: 'challenge',
    chip: 'Challenging an assumption',
    sequence: [
      'I agree with the goal of moving quickly.',
      'I think the assumption that [X] may be carrying too much weight.',
      'What evidence would we need before committing on that basis?',
    ],
    not: 'You are misunderstanding the market.',
    stop: 'Stop after proposing the test.',
  },
  {
    id: 'boundary',
    chip: 'Saying no',
    sequence: [
      'I cannot take this on in the form proposed.',
      'I can offer [bounded alternative], or we should leave it there.',
    ],
    not: 'I am so sorry, I wish I could, maybe later.',
    stop: 'Stop after one alternative. No essay.',
  },
  {
    id: 'repair',
    chip: 'Repairing a rupture',
    sequence: [
      'I interrupted and pushed past your point. Please finish.',
      'After they finish: thank you. My response is [one sentence].',
    ],
    not: 'I only interrupted because I thought.',
    stop: 'Stop immediately after the repair. No apology essay.',
  },
]

// ── The decision rules: test an impulse against who he is ────────────────────

export interface DecisionRule {
  id: string
  /** The failure condition, phrased as something the idea does. Tap what applies. */
  chip: string
  /** What the rule says about an idea that trips it. His own conclusion, quoted back. */
  verdict: string
}

/** The seven rules from the workbook, derived from his own ranked answers. */
export const DECISION_RULES: DecisionRule[] = [
  {
    id: 'repetition',
    chip: 'Needs me to say the same thing twice',
    verdict: 'Repeating yourself is your biggest drain. Either a system carries the repetition or this dies by month four.',
  },
  {
    id: 'cold',
    chip: 'Needs cold outbound',
    verdict: 'Cold outbound will not happen and never has. Warm intros and published thinking are the only motions that sustain.',
  },
  {
    id: 'slow_pay',
    chip: 'Pays after 90 days',
    verdict: 'With the current runway, anything that pays past one quarter can be the parallel asset. It cannot be the plan.',
  },
  {
    id: 'alone',
    chip: 'I would be alone in it',
    verdict: 'Working alone ranked dead last, below leading a large team. Solo ventures stall. Put people in it or expect it to.',
  },
  {
    id: 'no_ownership',
    chip: 'Income only, no ownership',
    verdict: 'Fee-only work is a job with extra steps. The proudest outcome is owning something that runs without you.',
  },
  {
    id: 'no_authority',
    chip: 'Builds no public authority',
    verdict: 'Becoming a genuine public voice is the regret you named first. Work that hides you wastes it.',
  },
  {
    id: 'maintenance',
    chip: 'Heavy to maintain',
    verdict: 'Maintenance is your second biggest drain. It is a cost, never a feature.',
  },
]

/** The verdict beneath the rule chips, sized to how many tripped. */
export function rulesVerdict(trippedCount: number): string {
  if (trippedCount === 0) {
    return 'It passes your rules. The next move is the smallest paid test, this week, with a named failure condition.'
  }
  if (trippedCount <= 2) {
    return 'Fixable if the design changes. Resolve what it trips before anything gets built.'
  }
  return 'That is three or more of your own rules. Kill it, or name what changed since you wrote them.'
}

// ── The daily ask: the number one intervention ───────────────────────────────

/**
 * From the manual's intervention stack, rank 1: explicit asks plus graduated
 * exposure. One clean ask per working day. The prediction makes it a test
 * instead of a performance: requesters underestimate compliance by as much as
 * half, and the only way that belief updates is a recorded prediction meeting
 * a recorded outcome.
 */
// Short on purpose: the old placeholder packed the whole method into three
// clipped lines inside a two-row textarea. The method lives in the card's
// subtitle now; the placeholder is just the sentence frame.
export const ASK_PLACEHOLDER = 'Would you be willing to \u2026?'

export interface PredictionChip {
  pct: number
  label: string
}

/**
 * The prediction, phrased the way he would say it: how likely is a yes. The
 * stored value stays % chance of a NO (the burden-belief calibration), so the
 * labels invert: "Likely" a yes = 20% no. Four chips, one row on a phone.
 */
export const PREDICTION_CHIPS: PredictionChip[] = [
  { pct: 20, label: 'Likely' },
  { pct: 40, label: 'Lean yes' },
  { pct: 60, label: 'Lean no' },
  { pct: 80, label: 'Unlikely' },
]

export type AskOutcome = 'yes' | 'no' | 'alternative' | 'no_reply'

export const OUTCOME_CHIPS: Array<{ outcome: AskOutcome; label: string }> = [
  { outcome: 'yes', label: 'Yes' },
  { outcome: 'no', label: 'No' },
  { outcome: 'alternative', label: 'Offered something else' },
  { outcome: 'no_reply', label: 'Nothing yet' },
]

/**
 * The correct learning, matched to what actually happened. One line, then the
 * review is over. The manual caps reviews at five minutes; this caps them at
 * one sentence.
 */
export function learningFor(outcome: AskOutcome, predictedNoPct: number | null): string {
  switch (outcome) {
    case 'yes':
      return predictedNoPct !== null && predictedNoPct >= 60
        ? `You gave this a ${100 - predictedNoPct}% chance of a yes. It was a yes. Asking costs less than it feels.`
        : 'A yes, as predicted. Asks are cheaper than they feel.'
    case 'no':
      return 'A clean no. It prevented false pipeline, and it says nothing about your value.'
    case 'alternative':
      return 'They set their own boundary and offered a route. That is the request working, not failing.'
    case 'no_reply':
      return 'Silence is not a verdict. One three-way follow-up at the interval, then close the loop.'
  }
}

// ── The self-rejection scan ──────────────────────────────────────────────────

/**
 * The manual's if-then: if I write sorry, just, maybe, no pressure, or if
 * useful, then I delete it. Deterministic, client-side, advisory only. It
 * never blocks the ask; it names the softener so deleting it is one decision.
 */
export const SELF_REJECTION_MARKERS: string[] = [
  'sorry to bother',
  'sorry to chase',
  'sorry for',
  'no worries if',
  'no pressure',
  'if useful',
  'i completely understand if',
  'i know you are busy',
  'this is probably too much',
  'just checking',
  'just wondering',
  'just a quick',
  'maybe we could',
  'would it be at all possible',
]

/** The first softener found, or null when the ask stands clean. */
export function findSelfRejection(text: string): string | null {
  const lower = (text || '').toLowerCase()
  return SELF_REJECTION_MARKERS.find(m => lower.includes(m)) ?? null
}

export function selfRejectionHint(marker: string): string {
  return `Delete "${marker}". The request stands on its own, and the easy decline already protects them.`
}

// ── The anxious reading ──────────────────────────────────────────────────────

/**
 * High anxiety is the low-focus state: the reading where a list becomes a loop
 * and strengths turn into the traps above. Threshold matches computeMode's red
 * boundary (anxiety >= 4) so there is one state model, not two.
 */
export function isAnxiousReading(anxiety: number | null | undefined): boolean {
  return typeof anxiety === 'number' && anxiety >= 4
}
