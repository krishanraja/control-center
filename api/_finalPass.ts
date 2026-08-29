// _finalPass — the per-venture Final Pass rubric, prompt, and parse helpers.
//
// The Final Pass is the ship-moment editor. When Krish hits Save Draft, Cleo
// reads the WHOLE piece one last time against the rubric for THAT venture and
// returns:
//   - instant_fail  → a hard block (the Save button is disabled until cleared)
//   - autofixes     → real errors (spelling/grammar/syntax/voice-mechanical),
//                     applied automatically, each undoable
//   - suggestions   → content improvements, dismissible one by one
//   - lenses        → (investigation) which investigative lenses are present
//   - verify        → claims to source before shipping ([VERIFY])
//   - standards     → the Five Standards, scored, so this reads as one system
//                     with the mid-iteration Standards tab, not a second one
//
// This is the richer, per-venture sibling of the /score gate. /score is the
// optional gut-check mid-iteration; this is the gate at the door. Both speak the
// Five Standards so the language stays coherent across the whole flow.
//
// Source of truth for the rubric content is the channel corpus
// (OneDrive/Documents/content corpus.txt → system_config.content_corpus) plus
// Krish's interview answers (2026-06-19). The corpus is still loaded at runtime
// and handed to the model; this file encodes the venture-specific JUDGEMENT the
// corpus prose implies, in a form the prompt can lean on hard.

// ── Ventures ────────────────────────────────────────────────────────────────
// the publication is one venture carrying two formats in `slot`: 'built' (how a
// thing was actually built) and 'paid' (how it actually makes money). The house
// register, 'publication', grades anything that is neither. The LinkedIn
// field-learning post is its own shape.
//
// Until 2026-08-12 this file had no rubric for either format and still graded
// against MYMU's retired taxonomy (headlines / perspectives / resources), which
// is why the engine kept producing Perspectives long after the brand retired.
//
// 'investigation' is the Teardown shape: the long-form teardown that
// takes a claim apart, checks each part against dated evidence, and publishes
// where the knowable ends. It used to be a separate brand (Techonomic, retired
// 2026-08-06). It is a FORMAT now, not a destination, and it keeps the hardest
// evidence bar in the OS because that bar is the whole point of it.

export type VentureKey =
  | 'investigation'
  | 'signal_noise'
  | 'built'
  | 'paid'
  | 'publication'
  | 'mindmake_field'
  | 'builder_economy'
  | 'dynamic'

/** lane (+slot) -> venture rubric key. Mirrors laneToCorpusChannel / save-draft.
 *
 *  One media venture, two formats carried in `slot` (Krish, 2026-08-06): venture
 *  is what I am working on, format is what shape this is, channel is where it
 *  goes. api/_content.ts has spoken this since the split; this grader had not
 *  caught up, and was still judging drafts against MYMU's retired
 *  headlines/perspectives/resources taxonomy. */
export function laneToVenture(lane?: string | null, slot?: string | null): VentureKey {
  if (lane === 'signal_noise') return 'signal_noise'
  // THE LIVE MODEL.
  if (lane === 'publication') {
    if (slot === 'teardown' || slot === 'investigation') return 'investigation'
    if (slot === 'paid') return 'paid'
    if (slot === 'built') return 'built'
    if (slot === 'field_learning') return 'mindmake_field'
    return 'publication'
  }
  if (lane === 'mindmake') {
    if (slot === 'field_learning') return 'mindmake_field'
    if (slot === 'investigation' || slot === 'teardown') return 'investigation'
    if (slot === 'paid') return 'paid'
    if (slot === 'built') return 'built'
    return 'publication'
  }
  // Legacy stored values, mapped rather than rejected. Rows laned to the retired
  // Techonomic brand keep the investigation rubric they were written against.
  if (lane === 'builder_economy_ig' || lane === 'builder_economy') return 'built'
  if (lane === 'techonomic') return 'investigation'
  if (lane === 'mymu' || lane === 'makeyourmindup') {
    if (slot === 'teardown' || slot === 'investigation') return 'investigation'
    if (slot === 'paid') return 'paid'
    if (slot === 'built') return 'built'
    return 'publication'
  }
  return 'dynamic'
}

export interface Lens {
  key: string
  label: string
  desc: string
  /** Default on: the lens Cleo demands unless Krish dials it off in the review. */
  defaultOn: boolean
}

export interface VentureRubric {
  key: VentureKey
  label: string
  /** The corpus channel key whose playbook to slice in (api/_content corpusForChannel). */
  corpusChannel: string | null
  /** One line: what this venture is for. */
  mandate: string
  /** What the piece must LEAD with. */
  leadWith: string
  /** Hard blocks. If any is true, the Save button is disabled until fixed. */
  instantFail: string[]
  /** The evidence bar Cleo holds the draft to. */
  evidenceBar: string
  /** Things every piece in this venture must carry. */
  mustHave: string[]
  /** Investigative lenses (the investigation format). Dial-able in the review UI. */
  lenses?: Lens[]
  /** Extra venture-specific guidance for the editor. */
  notes: string[]
  /** How strict to be on an unverifiable claim: 'block' folds it into instant_fail. */
  unverifiedClaim: 'block' | 'flag'
}

// The voice rules that are ABSOLUTE on every venture (Krish, Q13). These are
// never "improved" away by the pass, and a violation is always at least a
// high-severity suggestion (em dashes are auto-fixed deterministically too).
export const VOICE_ABSOLUTES: string[] = [
  'No em dashes anywhere. Use commas, periods, or parentheses.',
  'No two-word sentence stacks. Staccato fragment stacking ("Ship it. Done. Move on.") is an AI tell, break it up.',
  'Dropped subject pronouns where natural ("Been thinking", not "I have been thinking").',
  'No warm-up and never bury the lede. The first sentence is already mid-argument.',
  'End on a hard, forward-looking verdict. Never a summary, a rhetorical question, or a CTA.',
]

// The improvement dimensions a suggestion can belong to (Krish, Q4: cover all,
// each dismissible). Drives the chips in the review UI.
export const PASS_DIMENSIONS = [
  { key: 'clarity', label: 'Clearer' },
  { key: 'evidence', label: 'Evidenced' },
  { key: 'narration', label: 'Narrated' },
  { key: 'harden', label: 'Hardened' },
  { key: 'soften', label: 'Softened' },
  { key: 'impact', label: 'More impactful' },
  { key: 'structure', label: 'Structure' },
  { key: 'factual', label: 'Factual risk' },
  { key: 'voice', label: 'Voice' },
  { key: 'kind', label: 'Kindness' },
] as const

export type PassDimension = typeof PASS_DIMENSIONS[number]['key']

// ── The rubrics ─────────────────────────────────────────────────────────────

const INVESTIGATION_LENSES: Lens[] = [
  { key: 'economic', label: 'Economic', desc: 'The unit economics, the money mechanic, who pays and who captures. The spine of every investigation.', defaultOn: true },
  { key: 'operator', label: 'Operator-insider', desc: 'What this looks like from inside a P&L Krish has run. The unclone-able artifact angle.', defaultOn: true },
  { key: 'precedent', label: 'Historical precedent', desc: 'The prior cycle this rhymes with. What happened last time the same force moved.', defaultOn: true },
  { key: 'contrarian', label: 'Contrarian', desc: 'The lazy consensus take, discarded out loud, then the spikier read that holds.', defaultOn: true },
  { key: 'second_order', label: 'Second-order', desc: 'The consequence of the consequence. What this does two moves downstream that nobody is pricing in.', defaultOn: true },
]

const RUBRICS: Record<VentureKey, VentureRubric> = {
  investigation: {
    key: 'investigation',
    label: 'MYMU: Teardown',
    corpusChannel: 'investigation',
    mandate: 'Long-form investigation on the economics of AI, published to MYMU as a Teardown. Take a claim, decompose it, verify each part against dated evidence, say where the knowable ends. Exec-to-exec authority (Gear A). The flagship format.',
    leadWith: 'Evidence and proof, layered through a unique combination of lenses. Open on a fact, a number, or a primary source, never an opinion.',
    instantFail: [
      'The piece is opinion-only: it asserts a position without evidence, proof, or a primary source behind it.',
      'A load-bearing claim is factually incorrect or cannot be substantiated.',
    ],
    evidenceBar:
      'Primary sources only for the load-bearing claims: a filing, a study, a dashboard, a P&L Krish has run. A vendor blog or a summary of a summary is NOT enough, demand the primary source or convert the claim to Krish\'s lived framing ("from the P&Ls I have run..."). Bold predictions are allowed only when they are substantiated; an unsubstantiated bold prediction is clickbait, soften it.',
    mustHave: [
      'At least two distinct lenses layered onto the same fact (economic + one more).',
      'Every number cited to a real source or owned as lived experience. Never "studies show" without the study.',
    ],
    lenses: INVESTIGATION_LENSES,
    notes: [
      'This is investigation, not commentary. If it leans only on "a thing I read", it failed.',
      'An investigation can almost always be repurposed into Signal & Noise, keep it that portable.',
    ],
    unverifiedClaim: 'block',
  },

  signal_noise: {
    key: 'signal_noise',
    label: 'Signal & Noise',
    corpusChannel: 'signal_noise',
    mandate: 'AI in media, marketing, AdTech, and the economics and monetization of the internet. Separate durable signal from noise. Exec-to-exec (Gear A).',
    leadWith: 'The durable signal, named plainly, with what most people get wrong ("Not X, Y").',
    instantFail: [
      'No practical real-world example: the piece is abstract from start to finish with nothing the reader can picture.',
    ],
    evidenceBar:
      'Real numbers, named companies, dated events. Every piece must touch the ground at least once with a concrete, real-world example a reader can picture.',
    mustHave: [
      'A practical real-world example (named company, real campaign, real mechanic). Always.',
      'A clean separation of the durable signal from the transient noise.',
    ],
    notes: [
      'This is the natural home for a repurposed investigation. Hold the same evidence bar, lighter structure.',
      'Stay on AI x media / marketing / AdTech / internet monetization. Drift off that beat is a content miss.',
    ],
    unverifiedClaim: 'flag',
  },

  built: {
    key: 'built',
    label: 'Built',
    corpusChannel: 'built',
    mandate: 'How a thing was actually built. One artifact, taken apart: what it does, how it was assembled, what it cost, what broke. Builder-in-the-room (Gear B), from inside the work.',
    leadWith: 'The thing itself, already in motion. What it is and what it does, before any framing.',
    instantFail: [
      'Describes something that was not actually built, or that Krish did not build or watch being built.',
    ],
    evidenceBar:
      'Grounded in a real build: real tools, real sequence, real numbers where numbers are claimed. "I wired X to Y and it broke on Z" beats any amount of theory. No invented stacks, no imagined costs.',
    mustHave: [
      'The actual mechanism: not that it works, but HOW it works.',
      'At least one thing that did not go to plan. A build with no friction reads as marketing.',
    ],
    notes: [
      'Built is the answer to "how did you do that", and the reader should be able to go and do it.',
      'Cost, time and tool names are the texture. Vague competence is the failure mode.',
      'If the piece is really about whether the thing makes money, it is Paid, not Built.',
    ],
    unverifiedClaim: 'flag',
  },

  paid: {
    key: 'paid',
    label: 'Paid',
    corpusChannel: 'paid',
    mandate: 'How a thing actually makes money. The economics taken apart: who pays, for what, how much, and whether the model holds. Exec-to-exec (Gear A).',
    leadWith: 'The claim about the money. Not the company, not the market, the mechanism by which cash arrives.',
    instantFail: [
      'A revenue or pricing figure presented as fact without a dated, checkable source.',
    ],
    evidenceBar:
      'Every number is dated and sourced. Where the public record stops, say so plainly rather than estimating into the gap. An unverifiable load-bearing number is not a rounding problem, it is the whole argument failing.',
    mustHave: [
      'Who pays, for what, and how often. The unit of revenue, named.',
      'The part of the model that is fragile, not just the part that works.',
    ],
    notes: [
      'Paid is the answer to "does this actually work as a business".',
      'Counter-evidence belongs in the piece. A one-sided economic case is a pitch, not an analysis.',
      'If the piece is really about how it was assembled, it is Built, not Paid.',
    ],
    unverifiedClaim: 'block',
  },

  publication: {
    key: 'publication',
    label: 'the publication (house register)',
    corpusChannel: 'publication',
    mandate: 'The house register: what a leader must be across right now, and what it means. Used when the draft is neither a Built teardown nor a Paid economic case.',
    leadWith: 'The thing that happened and why it matters today. No warm-up.',
    instantFail: [],
    evidenceBar:
      'Anything presented as current must be real, dated and accurately summarized. No invented detail. Opinion is allowed and welcome, but it is labelled as judgement, not smuggled in as fact.',
    mustHave: [
      'A clear so-what for a busy leader: why this is on their radar today.',
    ],
    notes: [
      'This is the register, not a dumping ground. If the draft is really about how something was built, grade it as Built; if about how it makes money, grade it as Paid.',
      'Flexes on tone and structure. Does NOT flex on the voice absolutes (no em dashes, no two-word stacks, dropped pronouns, no warm-up, hard ending).',
      'A full teardown belongs in the investigation rubric, which has the harder bar.',
    ],
    unverifiedClaim: 'flag',
  },

  mindmake_field: {
    key: 'mindmake_field',
    label: 'Mindmake (LinkedIn field-learning)',
    corpusChannel: 'linkedin',
    mandate: 'A short field-learning post: one thing learned from inside the work, told in the builder-in-the-room voice (Gear B). 150 to 250 words.',
    leadWith: 'A scroll-stopping claim or scene. No context-setting, no warm-up.',
    instantFail: [],
    evidenceBar: 'Grounded in a real moment from the work: a thing built, shipped, watched break, or observed. Specific over general.',
    mustHave: [
      'One sharp angle, one lesson. Not a list.',
      'A real artifact or moment, not a generic reflection.',
    ],
    notes: [
      'No hashtags, no "thoughts?" closer. End on a hard verdict.',
      'Compression is the whole game here. If the thought fits in four words, six is wrong.',
    ],
    unverifiedClaim: 'flag',
  },

  builder_economy: {
    key: 'builder_economy',
    label: 'Builder Economy',
    corpusChannel: 'builder_economy',
    mandate: 'Daily, build-in-the-room. A founder outsizing themselves by partnering with AI. Upbeat by default, but the tougher side of building is fair game.',
    leadWith: 'The build moment: what got made, tried, or broken today.',
    instantFail: [
      'Sensationalist: built for shock or outrage rather than to show a real build.',
      'It attacks a named person or company.',
      'It has nothing to do with a founder outsizing themselves by partnering with AI.',
    ],
    evidenceBar: 'A real artifact or a real moment from building. The tougher side of building counts, as long as it stays about the build, not about dunking on anyone.',
    mustHave: [
      'A concrete build moment (something made, tried, shipped, or broken).',
      'The founder-plus-AI throughline.',
    ],
    notes: [
      'Cover the hard parts of building too, that is honest and on-brand. It just must not become sensationalist, an attack, or off-thesis.',
      'Upbeat is the default register, not a hard requirement. A hard day, told straight, is fine.',
    ],
    unverifiedClaim: 'flag',
  },

  dynamic: {
    key: 'dynamic',
    label: 'Unassigned',
    corpusChannel: null,
    mandate: 'No venture set yet. Hold it to the Five Standards and the voice absolutes.',
    leadWith: 'A specific, arguable claim. No warm-up.',
    instantFail: [],
    evidenceBar: 'Specific over general, sourced over asserted, dated over timeless-sounding. Never invent a number, outcome, or quote.',
    mustHave: ['A real angle, not a topic or a summary.'],
    notes: ['Pick a venture/lane to get the full per-venture rubric.'],
    unverifiedClaim: 'flag',
  },
}

export function rubricFor(venture: VentureKey): VentureRubric {
  return RUBRICS[venture] || RUBRICS.dynamic
}

// ── Prompt ──────────────────────────────────────────────────────────────────

export interface PassRequestCfg {
  /** Lens keys Krish wants demanded this run (investigation). Defaults to the rubric's defaultOn set. */
  lenses?: string[]
}

/** Build the system prompt for the Final Pass. Grounded in voice + corpus + rubric. */
export function buildFinalPassSystem(args: {
  rubric: VentureRubric
  voice: string
  channelCorpus: string
  materialsBlock: string
  cfg?: PassRequestCfg
}): string {
  const { rubric, voice, channelCorpus, materialsBlock, cfg } = args

  const activeLenses = rubric.lenses
    ? rubric.lenses.filter(l => (cfg?.lenses ? cfg.lenses.includes(l.key) : l.defaultOn))
    : []
  const lensBlock = rubric.lenses
    ? [
      'INVESTIGATIVE LENSES for this venture. Layer a UNIQUE COMBINATION onto the same facts, do not just pick one. The reader should feel the piece looked at the subject from several angles at once.',
      ...rubric.lenses.map(l => {
        const on = activeLenses.some(a => a.key === l.key)
        return `- ${l.label}${on ? ' [DEMANDED this run]' : ' [optional this run]'}: ${l.desc}`
      }),
      'For each lens, report whether it is genuinely present (not just gestured at). A DEMANDED lens that is absent is a high-severity suggestion.',
    ].join('\n')
    : ''

  return [
    `You are Cleo, Krish Raja's content editor, running the FINAL PASS before this piece is saved to a Google Doc and published. This is the last read before it ships. Be exacting. You are not rewriting the piece wholesale, you are catching what would make a sharp reader, or Krish himself, wince after it is out.`,
    '',
    `VENTURE: ${rubric.label}`,
    `MANDATE: ${rubric.mandate}`,
    `MUST LEAD WITH: ${rubric.leadWith}`,
    `EVIDENCE BAR: ${rubric.evidenceBar}`,
    rubric.mustHave.length ? `MUST HAVE:\n${rubric.mustHave.map(s => `- ${s}`).join('\n')}` : '',
    rubric.notes.length ? `VENTURE NOTES:\n${rubric.notes.map(s => `- ${s}`).join('\n')}` : '',
    '',
    rubric.instantFail.length
      ? `INSTANT-FAIL (a HARD BLOCK, the piece cannot ship until fixed). Mark instant_fail.failed = true ONLY if one of these is genuinely true, and say which:\n${rubric.instantFail.map(s => `- ${s}`).join('\n')}`
      : 'INSTANT-FAIL: none defined for this venture. Set instant_fail.failed = false unless the piece is empty or incoherent.',
    rubric.unverifiedClaim === 'block'
      ? 'For THIS venture, a load-bearing claim that cannot be verified is itself an instant-fail, not just a flag.'
      : 'An unverifiable claim is a [VERIFY] flag, not a block.',
    '',
    lensBlock,
    '',
    'VOICE ABSOLUTES (never "improve" these away, a violation is at least a high-severity voice suggestion):',
    VOICE_ABSOLUTES.map(s => `- ${s}`).join('\n'),
    '',
    voice ? `VOICE REFERENCE (how Krish writes):\n${voice}` : '',
    '',
    channelCorpus ? `CHANNEL CORPUS (the mandate, audience, and bar, judge against THIS):\n${channelCorpus}` : '',
    materialsBlock,
    '',
    'IMPROVEMENT DIMENSIONS for suggestions: clarity (clearer), evidence (better evidenced/proven), narration (told/narrated better), harden (a soft claim that should be made bolder and is substantiated), soften (an overclaim that outruns its evidence), impact (sharper, more memorable, retellable at dinner), structure (a weak open or a soft ending), factual (a factual risk), voice (a voice-absolute or kill-list violation), kind (warm with people, critical of ideas, raise it, never enforce it).',
    '',
    'OUTPUT: return ONLY a JSON object, no prose around it, no code fence, with this exact shape:',
    `{
  "instant_fail": { "failed": boolean, "reasons": string[] },
  "autofixes": [ { "kind": "spelling"|"grammar"|"syntax"|"voice", "before": string, "after": string, "note": string } ],
  "suggestions": [ { "dimension": one of the dimension keys, "severity": "high"|"med"|"low", "quote": "the exact passage from the draft", "issue": "what is wrong, one line", "suggestion": "the move to make, one line", "rewrite": "optional: the exact replacement text for quote, only if a clean drop-in exists" } ],
  "lenses": [ { "key": string, "label": string, "present": boolean, "note": string } ],
  "verify": [ { "quote": string, "claim": string, "why": string } ],
  "standards": { "unique": {"score": 1-5, "note": string}, "researched": {...}, "thoughtful": {...}, "kind": {...}, "helpful": {...} },
  "verdict": "one honest line on whether this is ready to ship"
}`,
    'Rules for the output:',
    '- autofixes are ONLY real errors: spelling, grammar, syntax, and mechanical voice violations (em dashes, two-word stacks). "before" must be an EXACT substring of the draft so it can be replaced. Do NOT put stylistic preferences here, those are suggestions.',
    '- suggestions are content improvements Krish accepts or dismisses. "quote" must be an exact substring of the draft. Order them most important first. Do not invent more than ~8, surface the ones that matter.',
    '- Never invent a number, source, quote, or fact to "fix" a gap. Flag the gap in verify[] instead.',
    '- If the piece is genuinely strong, say so in verdict and keep suggestions short. Do not manufacture problems.',
    rubric.lenses ? '' : '- This venture has no lenses, return "lenses": [].',
  ].filter(Boolean).join('\n')
}

// ── Parse + apply ───────────────────────────────────────────────────────────

export interface Autofix { kind: string; before: string; after: string; note?: string }
export interface PassSuggestion {
  id: string
  dimension: string
  severity: 'high' | 'med' | 'low'
  quote: string
  issue: string
  suggestion: string
  rewrite?: string | null
}
export interface LensCoverage { key: string; label: string; present: boolean; note?: string }
export interface VerifyFlag { quote: string; claim: string; why: string }
export interface PassResult {
  instant_fail: { failed: boolean; reasons: string[] }
  autofixes: Autofix[]
  suggestions: PassSuggestion[]
  lenses: LensCoverage[]
  verify: VerifyFlag[]
  standards: Record<string, { score: number; note: string }>
  verdict: string
}

const DIM_KEYS = new Set(PASS_DIMENSIONS.map(d => d.key))

/** Coerce the model's JSON into a safe, typed PassResult. Tolerant of omissions. */
export function normalizePass(raw: any): PassResult {
  const o = raw && typeof raw === 'object' ? raw : {}
  const arr = (v: any) => (Array.isArray(v) ? v : [])
  const str = (v: any) => (typeof v === 'string' ? v : '')

  const autofixes: Autofix[] = arr(o.autofixes)
    .filter((f: any) => f && typeof f.before === 'string' && typeof f.after === 'string' && f.before)
    .map((f: any) => ({ kind: str(f.kind) || 'voice', before: f.before, after: f.after, note: str(f.note) }))

  const suggestions: PassSuggestion[] = arr(o.suggestions)
    .filter((s: any) => s && (s.quote || s.issue || s.suggestion))
    .map((s: any, i: number) => ({
      id: `s${i}`,
      dimension: DIM_KEYS.has(s.dimension) ? s.dimension : 'impact',
      severity: ['high', 'med', 'low'].includes(s.severity) ? s.severity : 'med',
      quote: str(s.quote),
      issue: str(s.issue),
      suggestion: str(s.suggestion),
      rewrite: typeof s.rewrite === 'string' && s.rewrite.trim() ? s.rewrite : null,
    }))

  const lenses: LensCoverage[] = arr(o.lenses)
    .filter((l: any) => l && (l.key || l.label))
    .map((l: any) => ({ key: str(l.key), label: str(l.label) || str(l.key), present: !!l.present, note: str(l.note) }))

  const verify: VerifyFlag[] = arr(o.verify)
    .filter((v: any) => v && (v.quote || v.claim))
    .map((v: any) => ({ quote: str(v.quote), claim: str(v.claim), why: str(v.why) }))

  const standardsIn = o.standards && typeof o.standards === 'object' ? o.standards : {}
  const standards: Record<string, { score: number; note: string }> = {}
  for (const k of ['unique', 'researched', 'thoughtful', 'kind', 'helpful']) {
    const v = standardsIn[k]
    const score = v && typeof v.score === 'number' ? Math.max(1, Math.min(5, Math.round(v.score))) : 0
    standards[k] = { score, note: str(v?.note) }
  }

  const ifIn = o.instant_fail && typeof o.instant_fail === 'object' ? o.instant_fail : {}
  const instant_fail = {
    failed: !!ifIn.failed,
    reasons: arr(ifIn.reasons).map(str).filter(Boolean),
  }
  // A "failed" with no reason is noise, downgrade it.
  if (instant_fail.failed && !instant_fail.reasons.length) instant_fail.failed = false

  return { instant_fail, autofixes, suggestions, lenses, verify, standards, verdict: str(o.verdict) }
}

/** Apply the auto-fixes to the draft (literal string replacement, first match each). */
export function applyAutofixes(draft: string, fixes: Autofix[]): string {
  let out = draft
  for (const f of fixes) {
    if (f.before && out.includes(f.before)) out = out.replace(f.before, f.after)
  }
  return out
}
