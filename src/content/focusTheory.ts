// The theory layer for the Focus & Purpose home. Curated and static on
// purpose, exactly like the stoic library (src/lib/pilotStoic.ts): it sits on
// interaction paths that must never wait on a network call, it works offline,
// and it cannot drift from what was actually agreed.
//
// PROVENANCE. Every entry distils one of two committed sources:
//   docs/focus-purpose/OPERATING-MANUAL.md   the evidence-graded communication
//                                            and commercial operating manual
//   docs/focus-purpose/PURPOSE-WORKBOOK.md   the ranked ikigai answers (v4, 5 Sep
//                                            2026), the mission, the decision
//                                            rules v2 and the stop rule
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
 * NOTE ON WORDING. Three lines here said "the room". Ruling (Krish,
 * 2026-09-17): The Room is retired as vernacular and the motion is called
 * Advisory. The lines are relabelled, not re-argued — the doctrine is
 * unchanged and the `source` attributions still point at the passage each
 * one came from.
 */
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
 * Drawn from the workbook v4: the locked purpose and mission, the face, what
 * v4 changed, and the stop rule, plus two lines the operating manual still
 * owns. These are his own conclusions, surfaced back one at a time. Never
 * more than one on screen.
 */
export const PURPOSE_LINES: PurposeLine[] = [
  {
    line: 'I see what is coming before it is obvious and make it legible to people while it still counts.',
    source: 'Master Ikigai v4, purpose, locked 5 September 2026',
  },
  {
    line: 'Build the company that gives leaders their edge back before what is coming takes it, and sell it at scale with my name on it.',
    source: 'Master Ikigai v4, the mission for the decade',
  },
  {
    line: 'The face: a senior leader who will not admit to anyone that they are not ready for what is happening.',
    source: 'Master Ikigai v4, R12.5, his words',
  },
  {
    line: 'Building is the love and the fire. Building alone and in private is the failure mode.',
    source: 'Master Ikigai v4, what v4 changed, R11.1 and R1.3',
  },
  {
    line: 'Advisory is the door. Cash inside ninety days, sold to people you already know, the face already named.',
    source: 'Master Ikigai v4, double down',
  },
  {
    line: 'Publish to fill Advisory. Do not mistake publishing for the swing.',
    source: 'Master Ikigai v4, what v4 changed, R5.6',
  },
  {
    line: 'Money is the thing keeping you up at night and the first thing to solve. Rule 3 is load bearing.',
    source: 'Master Ikigai v4, R1.4 and R1.6',
  },
  {
    line: 'Fewer than two of twenty five take a call, or no paid pilot by 5 October: that is the stop rule, and it means the network advantage is not real for this offer.',
    source: 'Master Ikigai v4, the twelve month commitment',
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

/** The six trap ids, as a literal union so a read that names one is checked. */
export type TrapId = 'correcting' | 'overexplaining' | 'avoiding_ask' | 'polishing' | 'relitigating' | 'spiralling'

export interface Trap {
  id: TrapId
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
    move: 'Busy work is avoidance in disguise. Send one real ask before you do any more preparing.',
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
    move: 'A worry is just a prediction in disguise. Run it through the compiler once, then put it down.',
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

/**
 * The eight rule ids, as a literal union. DecisionRule.id is typed by it, so
 * a rule added below without a name here fails to compile, and
 * tests/api/strategist.test.ts reads this union back out of the source to
 * catch the other direction: a name here with no rule below.
 */
export type RuleId = 'pushed' | 'cold' | 'slow_pay' | 'alone' | 'no_ownership' | 'private' | 'no_edge' | 'protected'

export interface DecisionRule {
  id: RuleId
  /** The failure condition, phrased as something the idea does. Tap what applies. */
  chip: string
  /** What the rule says about an idea that trips it. His own conclusion, quoted back. */
  verdict: string
}

/** The eight rules v2 from the Master Ikigai v4, derived from his own ranked answers. */
export const DECISION_RULES: DecisionRule[] = [
  {
    id: 'pushed',
    chip: 'The learner is pushed, not pulled',
    verdict: 'The drain was never repetition. It is teaching people who do not want to learn. Anything for people being pushed rather than pulled is wrong.',
  },
  {
    id: 'cold',
    chip: 'Needs cold outbound',
    verdict: 'Cold outbound will not happen and never has. Warm intros, Advisory, and published thinking are the only motions that sustain.',
  },
  {
    id: 'slow_pay',
    chip: 'Pays after 90 days',
    verdict: 'If it does not pay inside ninety days it cannot be the main thing. Load bearing, not tolerated: money is the thing keeping you up at night.',
  },
  {
    id: 'alone',
    chip: 'I would be alone in it',
    verdict: 'If you are alone in it, expect it to stall. A partner who owns or polices the selling is a precondition, not a nice to have.',
  },
  {
    id: 'no_ownership',
    chip: 'Income only, no ownership',
    verdict: 'Fee-only work is a job with extra steps. The proof at ten years is what the company is worth, sold or held.',
  },
  {
    id: 'private',
    chip: 'Built in private',
    verdict: 'If it is built in private, it is hiding. Every build is announced, shown, or sold before it is finished. Repos nobody asked for are the year that went missing.',
  },
  {
    id: 'no_edge',
    chip: 'Does not put a leader\'s edge back',
    verdict: 'If it does not put a leader\'s edge back, it is off mission. Generic AI implementation and tooling for its own sake stay off the calendar.',
  },
  {
    id: 'protected',
    chip: 'Touches music or football',
    verdict: 'Music and football are protected. They enter the work only after the company runs without you.',
  },
]

/** The verdict beneath the rule chips, sized to how many tripped. */
export function rulesVerdict(trippedCount: number): string {
  if (trippedCount === 0) {
    return 'It passes your rules. Next step: the smallest paid test you can run this week, deciding up front what result would kill it.'
  }
  if (trippedCount <= 2) {
    return 'Fixable, but only if the design changes. Sort out what it trips before anything gets built.'
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
        : 'A yes, like you guessed. Asking costs less than it feels.'
    case 'no':
      return 'A clear no. It saved you chasing something that was not going to happen, and it says nothing about your worth.'
    case 'alternative':
      return 'They offered a different way instead. That means the ask worked, it just landed differently.'
    case 'no_reply':
      return 'Silence is not an answer. Follow up once, make it easy to reply either way, then let it go.'
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
  return `Delete "${marker}". The request is fine on its own, and they already have an easy way to say no.`
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

// ── The exposure ladder: how big an ask is, in words ─────────────────────────

export interface LadderLevel {
  level: number
  /** The kind of request at this level. */
  request: string
  /** What it feels like it will cost. Shown so the fear is named, not obeyed. */
  feared: string
  /** The manual's predicted rejection for this level. Kept as data from the
   *  table and never shown or posted: his prediction is his own, and a
   *  machine-filled number would make learningFor() lie to him. */
  pct: number
  /** The correct learning, whatever the answer turns out to be. */
  learning: string
}

/**
 * The twelve rows of the exposure ladder, verbatim from
 * docs/focus-purpose/OPERATING-MANUAL.md section 7 (the feared outcome loses
 * only its quotation marks). tests/api/strategist.test.ts parses the manual's
 * table and fails on any drift, so edit the manual first.
 */
export const EXPOSURE_LADDER: LadderLevel[] = [
  { level: 1, request: 'Ask a colleague for a one-line preference', feared: 'I am annoying', pct: 30, learning: 'A normal request is not a character claim' },
  { level: 2, request: 'Ask for a 15-minute advice call', feared: 'They will think I am incompetent', pct: 40, learning: 'Advice-seeking can signal respect and judgment' },
  { level: 3, request: 'Ask for feedback on one offer sentence', feared: 'They will dismiss the work', pct: 40, learning: 'Specificity lowers effort for the helper' },
  { level: 4, request: 'Ask a warm contact for an introduction', feared: 'I am exploiting the relationship', pct: 50, learning: 'A respectful request gives them agency' },
  { level: 5, request: 'Ask for a referral to one buyer type', feared: 'They will not want to risk reputation', pct: 55, learning: 'Referrals require fit, not universal approval' },
  { level: 6, request: 'Ask for a meeting with a named decision-maker', feared: 'I do not deserve access', pct: 60, learning: 'Access is a commercial variable, not a worth verdict' },
  { level: 7, request: 'Ask for personal help with a bounded practical task', feared: 'I am a burden', pct: 60, learning: 'Capacity differs from care' },
  { level: 8, request: 'Ask a senior person for sponsorship or advocacy', feared: 'They will see me as presumptuous', pct: 65, learning: 'Senior people can decide their own boundaries' },
  { level: 9, request: 'State a fee without discounting', feared: 'They will reject me as overpriced', pct: 65, learning: 'Price tests scope-value fit, not personal value' },
  { level: 10, request: 'Ask for budget and a decision date', feared: 'I will look pushy', pct: 70, learning: 'Clarity is commercially respectful' },
  { level: 11, request: 'Ask for exception or favourable treatment', feared: 'They will resent me', pct: 75, learning: 'A respectful exception request is not entitlement' },
  { level: 12, request: 'Ask for commitment from an economic buyer', feared: 'A direct no will be humiliating', pct: 75, learning: 'A clean no prevents false pipeline' },
]

/** The ladder row for a level, or null when the level is not 1 to 12. */
export function ladderLevel(n: number): LadderLevel | null {
  if (!Number.isInteger(n)) return null
  return EXPOSURE_LADDER.find(l => l.level === n) ?? null
}

// ── The strategist's lenses ──────────────────────────────────────────────────

/**
 * What a strategy consultant who had read his record would check a goal for.
 * Krish, 2026-09-27: he can set a big goal and do micro tasks, but cannot see
 * the middle (a partner model, an investor or co-founder, getting the right
 * people to see the work). Each lens is one of those gaps, tied to the rule it
 * tests and to the jobs a move under it may serve. The six are fixed; a read
 * names each as a move, later, or covered.
 */
export type LensId = 'sell_first' | 'partner' | 'capital_cofounder' | 'distribution' | 'help' | 'isolation'

/** The open jobs a lens move may serve (api/_mission.ts JOBS). run_pilots and
 *  keep_edge are behind closed gates and no lens offers them. */
export type LensJob = 'fill_pilots' | 'keep_honest' | 'feed_demand'

export interface Lens {
  id: LensId
  /** Plain words, shown as the lens's label. */
  label: string
  /** The decision rule this lens tests, or null when its authority is the
   *  operating manual rather than a rule. */
  rule: RuleId | null
  /** The jobs a move under this lens may serve, first is the default. null is
   *  only ever an investor move: no job of the five covers raising money, and
   *  the read says so rather than borrowing one. */
  jobs: ReadonlyArray<LensJob | null>
  /** Where in the corpus the lens comes from, shown faintly as its source. */
  source: string
  /** The question the lens must answer about the goal or the note. */
  asks: string
}

export const LENS_ORDER: LensId[] = ['sell_first', 'partner', 'capital_cofounder', 'distribution', 'help', 'isolation']

export const LENSES: Record<LensId, Lens> = {
  sell_first: {
    id: 'sell_first',
    label: 'Sell before you build',
    rule: 'slow_pay',
    jobs: ['fill_pilots'],
    source: 'Purpose workbook, decision rule 3',
    asks: 'Who pays for this inside ninety days, and what is the smallest pilot they could say yes to this week?',
  },
  partner: {
    id: 'partner',
    label: 'A partner model',
    rule: 'alone',
    jobs: ['fill_pilots', 'keep_honest'],
    source: 'Purpose workbook, decision rule 4 and the binding',
    asks: 'Who could sell this with him, or send him buyers, and what would they get for it?',
  },
  capital_cofounder: {
    id: 'capital_cofounder',
    label: 'An investor or a co-founder',
    rule: 'no_ownership',
    jobs: ['keep_honest', null],
    source: 'Purpose workbook, decision rule 5, and the ruling of 27 September 2026',
    asks: 'Who could fund this or build it with him, and what would they need to see first?',
  },
  distribution: {
    id: 'distribution',
    label: 'The right people seeing the work',
    rule: 'cold',
    jobs: ['feed_demand'],
    source: 'Purpose workbook, decision rule 2',
    asks: 'Which people who already know him should see this work, and by what warm route?',
  },
  help: {
    id: 'help',
    label: 'Asking for help',
    rule: null,
    jobs: ['fill_pilots', 'keep_honest'],
    source: 'Operating manual, the request formula and the exposure ladder',
    asks: 'What one bounded thing could someone he knows do for him this week?',
  },
  isolation: {
    id: 'isolation',
    label: 'Building alone',
    rule: 'private',
    jobs: ['keep_honest'],
    source: 'Purpose workbook, decision rule 6',
    asks: 'What is being built or decided alone right now, and who sees it before it is finished?',
  },
}
