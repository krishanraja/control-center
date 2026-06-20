// _finalPass — the per-venture Final Pass rubric, prompt, and parse helpers.
//
// The Final Pass is the ship-moment editor. When Krish hits Save Draft, Cleo
// reads the WHOLE piece one last time against the rubric for THAT venture and
// returns:
//   - instant_fail  → a hard block (the Save button is disabled until cleared)
//   - autofixes     → real errors (spelling/grammar/syntax/voice-mechanical),
//                     applied automatically, each undoable
//   - suggestions   → content improvements, dismissible one by one
//   - lenses        → (Techonomic) which investigative lenses are present
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
// Mindmaker is one lane with two shapes, so it is two ventures here: the Live
// roundup/perspective/resource surface and the LinkedIn field-learning post.

export type VentureKey =
  | 'techonomic'
  | 'signal_noise'
  | 'mindmaker_live'
  | 'mindmaker_field'
  | 'builder_economy'
  | 'dynamic'

/** lane (+slot) -> venture rubric key. Mirrors laneToFactoryChannel / save-draft. */
export function laneToVenture(lane?: string | null, slot?: string | null): VentureKey {
  if (lane === 'techonomic') return 'techonomic'
  if (lane === 'signal_noise') return 'signal_noise'
  if (lane === 'mindmaker') return slot === 'field_learning' ? 'mindmaker_field' : 'mindmaker_live'
  if (lane === 'builder_economy_ig') return 'builder_economy'
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
  /** Investigative lenses (Techonomic). Dial-able in the review UI. */
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

const TECHONOMIC_LENSES: Lens[] = [
  { key: 'economic', label: 'Economic', desc: 'The unit economics, the money mechanic, who pays and who captures. The spine of every Techonomic piece.', defaultOn: true },
  { key: 'operator', label: 'Operator-insider', desc: 'What this looks like from inside a P&L Krish has run. The unclone-able artifact angle.', defaultOn: true },
  { key: 'precedent', label: 'Historical precedent', desc: 'The prior cycle this rhymes with. What happened last time the same force moved.', defaultOn: true },
  { key: 'contrarian', label: 'Contrarian', desc: 'The lazy consensus take, discarded out loud, then the spikier read that holds.', defaultOn: true },
  { key: 'second_order', label: 'Second-order', desc: 'The consequence of the consequence. What this does two moves downstream that nobody is pricing in.', defaultOn: true },
]

const RUBRICS: Record<VentureKey, VentureRubric> = {
  techonomic: {
    key: 'techonomic',
    label: 'Techonomic',
    corpusChannel: 'techonomic',
    mandate: 'Investigative essay on the economics of AI. Exec-to-exec authority (Gear A). The flagship.',
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
    lenses: TECHONOMIC_LENSES,
    notes: [
      'This is investigation, not commentary. If it leans only on "a thing I read", it failed.',
      'A Techonomic piece can almost always be repurposed into Signal & Noise, keep it that portable.',
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
      'This is the natural home for a repurposed Techonomic piece. Hold the same evidence bar, lighter structure.',
      'Stay on AI x media / marketing / AdTech / internet monetization. Drift off that beat is a content miss.',
    ],
    unverifiedClaim: 'flag',
  },

  mindmaker_live: {
    key: 'mindmaker_live',
    label: 'Mindmaker Live',
    corpusChannel: 'mindmaker_live',
    mandate: 'One of three shapes: (1) current headlines a leader must be across, (2) perspectives on the future of AI in business (opinion and experience led), or (3) resources (kits, packs, videos, templates).',
    leadWith: 'The shape decides the open. Headlines: the headline and why it matters now. Perspective: the claim. Resource: what it is and who it is for.',
    instantFail: [],
    evidenceBar:
      'Headlines must be real and current, dated, and accurately summarized (no invented detail). Perspectives are opinion and experience led, lighter evidence bar, but still grounded in something Krish has seen. Resources must describe a real asset.',
    mustHave: [
      'A clear so-what for a busy leader: why this is on their radar today.',
    ],
    notes: [
      'This venture flexes on tone and structure across its three shapes. It does NOT flex on the voice absolutes (no em dashes, no two-word stacks, dropped pronouns, no warm-up, hard ending).',
      'Detect the shape first (headline / perspective / resource) and judge it against that shape, not a generic essay.',
    ],
    unverifiedClaim: 'flag',
  },

  mindmaker_field: {
    key: 'mindmaker_field',
    label: 'Mindmaker (LinkedIn field-learning)',
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
  /** Lens keys Krish wants demanded this run (Techonomic). Defaults to the rubric's defaultOn set. */
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
