// _gates: the investigation double-check gate set. Pure module: no I/O, no
// clients, no DB. Mirrors the shape of api/_trendGate.ts on purpose, because
// that file is the proven pattern in this codebase for "the model articulates,
// deterministic code decides".
//
// WHY THIS EXISTS. On 2026-08-05 the shift register was measured. Its 3-source
// floor counted source LABELS not domains, so three newsletters summarising one
// press release passed as three sources. The reconstructed evidence contained
// fabrications attributed to real publishers: a marketing training site credited
// with G7 policy stories, a wire service credited with an unnamed manufacturer
// saving exactly $100 million, a publication credited with a product that does
// not exist. All 116 URL-less rows were provenance=reconstructed.
//
// The lesson encoded here: a plausible-sounding fabrication is the DEFAULT
// failure mode, not an edge case. So:
//   1. Deterministic first. A model is consulted only where the deterministic
//      layer is genuinely uncertain, always batched over a set, never per item.
//   2. Absence is failure. A gate that writes no audit row is treated as not
//      having run, and blocks the ship.
//   3. Every check records the VALUE IT OBSERVED, not just a boolean. "Why did
//      this pass" is answerable months later only if the value is on disk.

import { rootDomain, titleJaccard } from './_trendGate.js'

export { rootDomain, titleJaccard }

// ── Shared contract ─────────────────────────────────────────────────────────

export type GateId = 'G1_anchor' | 'G2_grounding' | 'G3_interest' | 'G4_ladder' | 'G5_harness' | 'G6_draft'
export type GateAction = 'pass' | 'flag' | 'downgrade' | 'block'
export type SubjectKind = 'anchor' | 'claim' | 'rung' | 'evidence' | 'analogy' | 'draft'

export interface GateCheck {
  id: string
  passed: boolean
  observed: unknown
  expected: string
  deterministic: boolean
}

export interface GateVerdict {
  gate: GateId
  subject_kind: SubjectKind
  subject_ref: string
  subject_label: string
  action: GateAction
  score: number | null
  checks: GateCheck[]
  model_calls: number
}

export function check(id: string, passed: boolean, observed: unknown, expected: string, deterministic = true): GateCheck {
  return { id, passed, observed, expected, deterministic }
}

/** The worst action wins. A single block is a block. */
export function worstAction(actions: GateAction[]): GateAction {
  const rank: Record<GateAction, number> = { pass: 0, flag: 1, downgrade: 2, block: 3 }
  return actions.reduce<GateAction>((w, a) => (rank[a] > rank[w] ? a : w), 'pass')
}

// ── Text normalization, shared by G2, G5.1 and G6 ───────────────────────────

/** NFKC, curly quotes to straight, zero-width stripped, whitespace collapsed.
 *  Deliberately NOT lowercased: "verbatim" means verbatim, and a case change is
 *  a real edit the decomposer made. */
export function normalizeSpan(s: string): string {
  if (!s) return ''
  return String(s)
    .normalize('NFKC')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(s: string): string[] {
  return normalizeSpan(s).toLowerCase().split(/[^a-z0-9$%.]+/).filter(Boolean)
}

function ngrams(list: string[], n: number): Set<string> {
  const out = new Set<string>()
  if (list.length < n) { if (list.length) out.add(list.join(' ')); return out }
  for (let i = 0; i + n <= list.length; i++) out.add(list.slice(i, i + n).join(' '))
  return out
}

/** Fraction of the needle's 5-grams present in the haystack's 5-gram set. */
export function ngramContainment(needle: string, haystack: string, n = 5): number {
  const a = ngrams(tokens(needle), n)
  if (!a.size) return 0
  const b = ngrams(tokens(haystack), n)
  let hit = 0
  for (const g of a) if (b.has(g)) hit++
  return hit / a.size
}

// ── Numbers ─────────────────────────────────────────────────────────────────

export interface NumberToken {
  raw: string
  /** Canonical magnitude with the scale word applied. 1.2 million -> 1200000. */
  value: number
  percent: boolean
  /** 1900..2100 integers, which are handled by the date check, not the number check. */
  yearLike: boolean
}

const SCALES: Record<string, number> = {
  k: 1e3, thousand: 1e3,
  m: 1e6, mn: 1e6, million: 1e6,
  bn: 1e9, b: 1e9, billion: 1e9,
  tn: 1e12, t: 1e12, trillion: 1e12,
}

const NUM_RE = /([$£€]\s?)?(\d[\d,]*(?:\.\d+)?)\s*(%|percent|k|m|mn|bn|b|tn|t|thousand|million|billion|trillion)?\b/gi

export function extractNumbers(text: string): NumberToken[] {
  const out: NumberToken[] = []
  const s = normalizeSpan(text)
  NUM_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = NUM_RE.exec(s)) !== null) {
    const bare = m[2].replace(/,/g, '')
    let value = Number(bare)
    if (!Number.isFinite(value)) continue
    const suffix = (m[3] || '').toLowerCase()
    const percent = suffix === '%' || suffix === 'percent'
    if (!percent && suffix && SCALES[suffix]) value *= SCALES[suffix]
    const yearLike = !percent && !suffix && !m[1] && /^\d{4}$/.test(bare) && value >= 1900 && value <= 2100
    out.push({ raw: m[0].trim(), value, percent, yearLike })
  }
  return out
}

function sameMagnitude(a: NumberToken, b: NumberToken): boolean {
  if (a.percent !== b.percent) return false
  if (a.value === b.value) return true
  // Float tolerance only, never a rounding allowance: 72 is not 71.
  return Math.abs(a.value - b.value) < 1e-9
}

/** Numbers in `claim` with no same-magnitude counterpart in `source`.
 *  Years are excluded here and adjudicated by datesMissing instead. */
export function numbersMissing(claim: string, source: string): NumberToken[] {
  const want = extractNumbers(claim).filter(n => !n.yearLike)
  const have = extractNumbers(source)
  return want.filter(w => !have.some(h => sameMagnitude(w, h)))
}

const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g
const YEAR_RE = /\b(19\d{2}|20\d{2}|2100)\b/g

/** Four-digit years and ISO dates in `claim` absent from `source`. */
export function datesMissing(claim: string, source: string): string[] {
  const src = normalizeSpan(source)
  const want = new Set<string>()
  const c = normalizeSpan(claim)
  let m: RegExpExecArray | null
  ISO_RE.lastIndex = 0
  while ((m = ISO_RE.exec(c)) !== null) want.add(m[0])
  YEAR_RE.lastIndex = 0
  while ((m = YEAR_RE.exec(c)) !== null) want.add(m[0])
  return [...want].filter(d => !src.includes(d))
}

// ═══════════════════════════════════════════════════════════════════════════
// G1. ANCHOR PROVENANCE. A vendor number can never be a rung-0 thesis.
// ═══════════════════════════════════════════════════════════════════════════
//
// Vendor case studies score beautifully on freshness, specificity and pillar fit
// precisely because they are marketing artifacts engineered to look like
// evidence. The rule does not kill the story, it changes it: not "72%
// resolution" but "a number with no denominator was reprinted by nine outlets
// in five days".

export interface VendorEntry { entity: string; aliases: string[]; tier: 'vendor' | 'analyst' }

/** REVIEWED ARTIFACT. A model may PROPOSE additions (they land in
 *  vendor_lexicon_pending) but may never write this map. */
export const VENDOR_DOMAINS: Record<string, VendorEntry> = {
  'openai.com': { entity: 'OpenAI', aliases: ['openai', 'chatgpt', 'gpt-4', 'gpt-5', 'codex', 'sora'], tier: 'vendor' },
  'anthropic.com': { entity: 'Anthropic', aliases: ['anthropic', 'claude'], tier: 'vendor' },
  'salesforce.com': { entity: 'Salesforce', aliases: ['salesforce', 'agentforce', 'slack'], tier: 'vendor' },
  'microsoft.com': { entity: 'Microsoft', aliases: ['microsoft', 'copilot', 'azure', 'github copilot'], tier: 'vendor' },
  'microsoft.ai': { entity: 'Microsoft', aliases: ['microsoft', 'copilot', 'mai'], tier: 'vendor' },
  'blog.google': { entity: 'Google', aliases: ['google', 'gemini', 'deepmind', 'vertex'], tier: 'vendor' },
  'ai.meta.com': { entity: 'Meta', aliases: ['meta', 'llama'], tier: 'vendor' },
  'nvidia.com': { entity: 'Nvidia', aliases: ['nvidia', 'blackwell', 'cuda', 'nim'], tier: 'vendor' },
  'databricks.com': { entity: 'Databricks', aliases: ['databricks', 'mosaic'], tier: 'vendor' },
  'servicenow.com': { entity: 'ServiceNow', aliases: ['servicenow', 'now assist'], tier: 'vendor' },
  'sierra.ai': { entity: 'Sierra', aliases: ['sierra'], tier: 'vendor' },
  'glean.com': { entity: 'Glean', aliases: ['glean'], tier: 'vendor' },
  'writer.com': { entity: 'Writer', aliases: ['writer.com'], tier: 'vendor' },
  'intercom.com': { entity: 'Intercom', aliases: ['intercom', 'fin'], tier: 'vendor' },
  'aws.amazon.com': { entity: 'AWS', aliases: ['aws', 'amazon web services', 'bedrock'], tier: 'vendor' },
  'cloud.google.com': { entity: 'Google Cloud', aliases: ['google cloud', 'vertex ai'], tier: 'vendor' },
  'a16z.com': { entity: 'Andreessen Horowitz', aliases: ['a16z', 'andreessen'], tier: 'vendor' },
  'a16z.news': { entity: 'Andreessen Horowitz', aliases: ['a16z', 'andreessen'], tier: 'vendor' },
  'bfl.ai': { entity: 'Black Forest Labs', aliases: ['black forest labs', 'flux'], tier: 'vendor' },
  'crowdstrike.com': { entity: 'CrowdStrike', aliases: ['crowdstrike', 'falcon'], tier: 'vendor' },
  'huggingface.co': { entity: 'Hugging Face', aliases: ['hugging face'], tier: 'vendor' },
  // The analyst tier is its own bucket. A consultancy selling the transformation
  // is an interested party in the size of the transformation.
  'mckinsey.com': { entity: 'McKinsey', aliases: ['mckinsey'], tier: 'analyst' },
  'bain.com': { entity: 'Bain', aliases: ['bain'], tier: 'analyst' },
  'bcg.com': { entity: 'BCG', aliases: ['bcg', 'boston consulting'], tier: 'analyst' },
  'gartner.com': { entity: 'Gartner', aliases: ['gartner'], tier: 'analyst' },
  'forrester.com': { entity: 'Forrester', aliases: ['forrester'], tier: 'analyst' },
  'accenture.com': { entity: 'Accenture', aliases: ['accenture'], tier: 'analyst' },
  'deloitte.com': { entity: 'Deloitte', aliases: ['deloitte'], tier: 'analyst' },
  'pwc.com': { entity: 'PwC', aliases: ['pwc', 'pricewaterhouse'], tier: 'analyst' },
  'kpmg.com': { entity: 'KPMG', aliases: ['kpmg'], tier: 'analyst' },
  'ey.com': { entity: 'EY', aliases: ['ernst & young', 'ey'], tier: 'analyst' },
}

/** Bumped by hand whenever the map above is reviewed. Staleness does not stop
 *  the gate, it stamps the run degraded, loudly. */
export const LEXICON_REVIEWED_ON = '2026-08-05'
export const LEXICON_MAX_AGE_DAYS = 90

export function lexiconIsStale(now = new Date()): { stale: boolean; ageDays: number } {
  const age = Math.floor((now.getTime() - new Date(`${LEXICON_REVIEWED_ON}T00:00:00Z`).getTime()) / 86_400_000)
  return { stale: age > LEXICON_MAX_AGE_DAYS, ageDays: age }
}

export type Origin = 'self' | 'self_relayed' | 'independent'

const INDEPENDENT_MEASUREMENT = /\b(we measured|our analysis|we tested|we reviewed|we audited|independently (verified|measured|tested)|our own testing|according to the filing|per the (10-k|10-q|8-k)|court (filing|docket)|regulatory filing|randomi[sz]ed|control group|holdout)\b/i

/** Word-boundary matched, NOT substring. A bare `includes` reported the alias
 *  "aws" inside the word "flaws" and classified a CrowdStrike security story as
 *  an AWS self-relayed vendor claim (observed on the live pool 2026-08-05).
 *  Misattributing origin is the exact failure this gate exists to prevent, so
 *  the match has to be on word boundaries. */
function aliasHit(sentence: string, aliases: string[]): string | null {
  const s = normalizeSpan(sentence).toLowerCase()
  for (const a of aliases) {
    const needle = a.trim().toLowerCase()
    if (!needle) continue
    const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const lead = /^[a-z0-9]/.test(needle) ? '\\b' : ''
    const tail = /[a-z0-9]$/.test(needle) ? '\\b' : ''
    if (new RegExp(`${lead}${esc}${tail}`, 'i').test(s)) return a
  }
  return null
}

export interface OriginResult {
  origin: Origin
  entity: string | null
  entityTier: 'vendor' | 'analyst' | null
  matchedAlias: string | null
  domainInLexicon: boolean
  unknownEntityCandidate: string | null
  /** True only when the entity was matched in an ATTRIBUTIVE position, meaning
   *  the sentence actually says the number came from it. False means a vendor
   *  alias was merely PRESENT, so the row is treated as vendor-sourced (the
   *  conservative call) but the entity is NOT named anywhere that gets printed. */
  attributed: boolean
}

/** Does the sentence attribute the number TO this entity, rather than merely
 *  mention it? Measured on the live pool 2026-08-05: the bare alias scan named
 *  OpenAI as the source of Cisco's cost figure ("Cisco built a model that beats
 *  GPT-5.5 at 172x lower cost"), named OpenAI as the source of Moonshot's
 *  benchmark result ("Kimi K3 took the coding crown from Anthropic and OpenAI"),
 *  and named Anthropic as the source of Simon Willison's vulnerability framework.
 *  Three of the top twelve real candidates. That entity is then interpolated into
 *  rung0Question and terminalStatement, both of which are PUBLISHED, and G6 hard
 *  blocks any draft that omits the terminal statement verbatim. So a mere mention
 *  became a printed attribution: a real company credited with a claim it never
 *  made, which is the exact failure this file exists to prevent. */
function attributiveHit(sentence: string, aliases: string[]): string | null {
  const s = normalizeSpan(sentence)
  // Clause heads, because a possessive is only an attribution when the entity is
  // the SUBJECT. "OpenAI's rogue agent ran 17,600 actions" attributes. The same
  // possessive buried in a list, "CVEs across Microsoft 365 Copilot, Slack AI and
  // Anthropic's Claude iOS app", names a product that got hit, not a measurer.
  // Sentence heads only, NOT comma-separated list items. Splitting on commas too
  // made every item in a list a candidate subject, and "CVEs across Microsoft 365
  // Copilot, Slack AI, and Anthropic's Claude iOS app" then credited Salesforce,
  // because `slack` is a Salesforce alias and "Slack AI" led its own fragment.
  const clauses = s.split(/(?<=[.!?;:])\s+/).map(c => c.trim())
  for (const a of aliases) {
    const needle = a.trim()
    if (!needle) continue
    const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const lead = /^[a-z0-9]/i.test(needle) ? '\\b' : ''
    const tail = /[a-z0-9]$/i.test(needle) ? '\\b' : ''
    const A = `${lead}${esc}${tail}`

    // Attributive wherever it appears: the verb or the credit phrase does the
    // work, so position carries no extra information.
    //   Deliberately NOT here: a bare "from X" or "by X". "Kimi K3 took the
    //   coding crown from Anthropic and OpenAI" credited OpenAI with Moonshot's
    //   benchmark result, because "from" reads as attribution and as dispossession
    //   with the same three letters.
    const anywhere = [
      `${A}\\s+(said|says|announced|reported|reports|claims?|claimed|disclosed|published|releases?d?|found|finds|estimates?|estimated|told|touts?|states?)\\b`,
      `\\b(according to|per|citing)\\s+${A}\\b`,
      `\\b(data|figures?|numbers?|research|analysis|report|study|survey|filing)\\s+(from|by)\\s+${A}\\b`,
    ]
    if (anywhere.some(p => new RegExp(p, 'i').test(s))) return a

    // Subject position only.
    const head = [`^${A}'s\\b`, `^${A}\\b`]
    if (clauses.some(c => head.some(p => new RegExp(p, 'i').test(c)))) return a
  }
  return null
}

/** Classify who is speaking. The MAJORITY case, and the one that killed the old
 *  register, is self_relayed: an independent-looking domain reprinting a vendor
 *  number with no independent measurement of its own. */
export function classifyOrigin(url: string | null, numberSentence: string): OriginResult {
  const domain = rootDomain(url)
  const entry = domain ? VENDOR_DOMAINS[domain] : undefined
  const independentVerb = INDEPENDENT_MEASUREMENT.test(numberSentence)

  if (entry) {
    // The domain IS the entity's own property, so OWNERSHIP is certain from the
    // URL. Attribution is not, and the two were conflated here.
    //
    // `attributed: true` unconditionally meant that any number appearing on a
    // vendor's own domain was recorded as a number FROM that vendor, even when
    // the sentence never named them. On a publisher-shaped vendor domain that
    // is usually wrong: a16z.news carried Stuut's 81.7% figure on B2B
    // collections, and G1 published "how did an undenominated number from
    // Andreessen Horowitz reach 5 outlets across 10 days" - a false statement
    // about whose number it is, in the one layer this pipeline promises to
    // publish honestly. Seen on the 2026-W33 investigation card.
    //
    // The distinction already exists one line up: `hit` is exactly "the
    // sentence names this entity". When it is false the origin is self_relayed
    // - the domain owner is RELAYING someone else's number - and naming them as
    // its source is a guess. So attribution now follows the sentence, which is
    // what the rule at the foot of gateAnchor has always said it must.
    const hit = aliasHit(numberSentence, [...entry.aliases, entry.entity])
    return {
      origin: hit ? 'self' : 'self_relayed',
      entity: entry.entity,
      entityTier: entry.tier,
      matchedAlias: hit,
      domainInLexicon: true,
      unknownEntityCandidate: null,
      attributed: Boolean(hit),
    }
  }

  // Attributive matches first, across the whole lexicon, so a sentence that says
  // "Cisco built ... beats GPT-5.5" cannot be won by OpenAI purely because
  // openai.com sits earlier in the map than cisco does not sit in it at all.
  for (const e of Object.values(VENDOR_DOMAINS)) {
    const hit = attributiveHit(numberSentence, [...e.aliases, e.entity])
    if (hit && !independentVerb) {
      return {
        origin: 'self_relayed', entity: e.entity, entityTier: e.tier,
        matchedAlias: hit, domainInLexicon: false, unknownEntityCandidate: null,
        attributed: true,
      }
    }
  }

  // A vendor alias is present but nothing attributes the number to it. Stay
  // conservative on the GATE (this is still a vendor-adjacent number and does not
  // get to be a rung-0 thesis), but refuse to NAME anyone: entity stays null and
  // every published template degrades to a description instead of a wrong name.
  for (const e of Object.values(VENDOR_DOMAINS)) {
    const hit = aliasHit(numberSentence, [...e.aliases, e.entity])
    if (hit && !independentVerb) {
      return {
        origin: 'self_relayed', entity: null, entityTier: e.tier,
        matchedAlias: hit, domainInLexicon: false, unknownEntityCandidate: null,
        attributed: false,
      }
    }
  }

  return {
    origin: 'independent', entity: null, entityTier: null, matchedAlias: null,
    domainInLexicon: false, unknownEntityCandidate: leadEntity(numberSentence),
    attributed: false,
  }
}

/** First plausible proper-noun subject in a sentence, for the one place G1 is
 *  allowed to ask a model: "is this entity the seller of the thing measured". */
export function leadEntity(sentence: string): string | null {
  const s = normalizeSpan(sentence)
  const m = s.match(/\b([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})\b/)
  if (!m) return null
  const cand = m[1].trim()
  if (COMMON_CAPS.has(cand.toLowerCase())) return null
  return cand.length > 1 ? cand : null
}

export type DenominatorVerdict = 'denominated' | 'bare_ratio' | 'no_number'

export const DENOMINATOR_PATTERNS: { id: string; re: RegExp }[] = [
  { id: 'explicit_n', re: /\bn\s*=\s*\d/i },
  { id: 'of_population', re: /\bof\s+\d[\d,]*\s+(customers|companies|respondents|tickets|users|deployments|surveyed|employees|firms|organisations|organizations)\b/i },
  { id: 'from_to_base', re: /\bfrom\s+[\d.,]+%?\s+to\s+[\d.,]+%?/i },
  { id: 'absolute_with_scope', re: /\b\d[\d,.]*\s*(hours|fte|engineers|seats|tickets|headcount|jobs)\s*(per\s+(month|quarter|year|seat|agent|week))?\b/i },
  { id: 'named_method', re: /\b(measured|audited|filed|10-k|10-q|8-k|s-1|prospectus|randomi[sz]ed|control group|holdout|a\/b)\b/i },
]

export const DENOMINATOR_WINDOW = 240

/** A percentage with no n, no base, no unit-and-scope and no named method is a
 *  bare ratio. That makes "72% resolution" a machine-detectable property, which
 *  is what makes the ratified rule enforceable rather than aspirational. */
export function denominatorVerdict(text: string): { verdict: DenominatorVerdict; matched: string[]; numbers: string[] } {
  const s = normalizeSpan(text)
  const nums = extractNumbers(s).filter(n => !n.yearLike)
  if (!nums.length) return { verdict: 'no_number', matched: [], numbers: [] }
  const matched: string[] = []
  for (const n of nums) {
    const i = s.indexOf(n.raw)
    const from = Math.max(0, i - DENOMINATOR_WINDOW)
    const win = s.slice(from, i + n.raw.length + DENOMINATOR_WINDOW)
    for (const p of DENOMINATOR_PATTERNS) if (p.re.test(win) && !matched.includes(p.id)) matched.push(p.id)
  }
  return { verdict: matched.length ? 'denominated' : 'bare_ratio', matched, numbers: nums.map(n => n.raw) }
}

// The circulation thesis needs its own floor or it is just one press release.
export const MIN_CIRCULATION_DOMAINS = 5
export const CIRCULATION_WINDOW_DAYS = 10
export const MAX_ANCHOR_ATTEMPTS = 3

export interface AnchorGateInput {
  ref: string
  headline: string
  url: string | null
  /** The sentence that carries the number: headline plus snippet is the honest
   *  unit here, because a sweep row splits the claim across both. */
  numberSentence: string
  loadBearingNumber: boolean
  /** Distinct root domains observed carrying the same number, from the
   *  provenance harness. Zero when the harness was skipped. */
  circulationDomains: number
  circulationWindowDays: number
  /** Set by the caller when a model was consulted about an unknown entity. */
  modelEntity?: { entity: string; sells: boolean; confidence: number } | null
}

export interface AnchorGateResult {
  verdict: GateVerdict
  origin: Origin
  denominator: DenominatorVerdict
  thesisMode: 'mechanism' | 'circulation'
  rung0Question: string | null
  entity: string | null
}

export function gateAnchor(input: AnchorGateInput, now = new Date()): AnchorGateResult {
  const checks: GateCheck[] = []
  const dom = rootDomain(input.url)
  let o = classifyOrigin(input.url, input.numberSentence)

  // The one place a model is admitted, and only when the lexicon is silent.
  if (o.origin === 'independent' && input.modelEntity && input.modelEntity.confidence >= 0.7 && input.modelEntity.sells) {
    o = { ...o, origin: 'self_relayed', entity: input.modelEntity.entity, entityTier: 'vendor', attributed: true }
    checks.push(check('vendor_entity_model_adjudicated', true,
      { entity: input.modelEntity.entity, confidence: input.modelEntity.confidence },
      'confidence >= 0.7 and entity sells the thing measured', false))
  }

  const den = denominatorVerdict(input.numberSentence)
  checks.push(check('anchor_domain', Boolean(dom), dom, 'a parseable root domain'))
  checks.push(check('origin_classification', true, { origin: o.origin, entity: o.entity, tier: o.entityTier, alias: o.matchedAlias, domain_in_lexicon: o.domainInLexicon }, 'self | self_relayed | independent'))
  // Recorded even when it passes: an unattributed vendor block is a different
  // animal from an attributed one, and only the attributed kind may print a name.
  checks.push(check('entity_attributed', o.origin === 'independent' || o.attributed,
    { attributed: o.attributed, entity: o.entity, alias: o.matchedAlias },
    'the sentence attributes the number to the entity, rather than merely mentioning it'))
  checks.push(check('denominator', den.verdict !== 'bare_ratio', { verdict: den.verdict, matched: den.matched, numbers: den.numbers }, 'a number carries n, a from/to base, a scoped absolute, or a named method'))

  const stale = lexiconIsStale(now)
  checks.push(check('lexicon_freshness', !stale.stale, { reviewed_on: LEXICON_REVIEWED_ON, age_days: stale.ageDays }, `reviewed within ${LEXICON_MAX_AGE_DAYS} days`))

  const vendorSourced = o.origin === 'self' || o.origin === 'self_relayed'
  const blocked = vendorSourced && input.loadBearingNumber

  if (!blocked) {
    checks.push(check('rung0_admissible', true, { origin: o.origin, load_bearing_number: input.loadBearingNumber }, 'not a vendor-sourced load-bearing number'))
    return {
      verdict: { gate: 'G1_anchor', subject_kind: 'anchor', subject_ref: input.ref, subject_label: input.headline, action: stale.stale ? 'flag' : 'pass', score: null, checks, model_calls: input.modelEntity ? 1 : 0 },
      origin: o.origin, denominator: den.verdict, thesisMode: 'mechanism', rung0Question: null, entity: o.entity,
    }
  }

  // The pivot, not the bin. The story changes shape; it does not disappear.
  const enoughCirculation = input.circulationDomains >= MIN_CIRCULATION_DOMAINS && input.circulationWindowDays <= CIRCULATION_WINDOW_DAYS
  checks.push(check('rung0_admissible', false, { origin: o.origin, entity: o.entity }, 'a vendor-sourced number cannot be a rung-0 thesis'))
  checks.push(check('circulation_floor', enoughCirculation, { domains: input.circulationDomains, window_days: input.circulationWindowDays }, `>= ${MIN_CIRCULATION_DOMAINS} distinct root domains within ${CIRCULATION_WINDOW_DAYS} days`))

  // NEVER name an entity the sentence did not attribute the number to. An
  // unattributed vendor number still pivots to a circulation thesis, it just
  // describes the source instead of guessing at it.
  const entity = o.attributed ? (o.entity || input.modelEntity?.entity || null) : null
  const q = entity
    ? `how did an undenominated number from ${entity} reach ${input.circulationDomains} outlets across ${input.circulationWindowDays} days`
    : `how did an undenominated vendor number reach ${input.circulationDomains} outlets across ${input.circulationWindowDays} days without anyone naming who measured it`

  return {
    verdict: {
      gate: 'G1_anchor', subject_kind: 'anchor', subject_ref: input.ref, subject_label: input.headline,
      action: enoughCirculation ? 'downgrade' : 'block', score: null, checks, model_calls: input.modelEntity ? 1 : 0,
    },
    origin: o.origin, denominator: den.verdict,
    thesisMode: 'circulation',
    rung0Question: enoughCirculation ? q : null,
    entity,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// G2. SPAN GROUNDING. Claims must exist in the source text.
// ═══════════════════════════════════════════════════════════════════════════

export const TIER2_CONTAINMENT = 0.8
export const GROUNDING_FAILURE_LIMIT = 0.4

export const HEDGES = [
  'may', 'might', 'could', 'suggests', 'appears', 'reportedly', 'according to',
  'plans to', 'aims to', 'expects', 'up to', 'as much as', 'on track to',
  'preliminary', 'pilot', 'early',
]
export const ABSOLUTES = [
  'will', 'proves', 'shows', 'confirms', 'eliminates', 'guarantees', 'all',
  'every', 'none', 'never', 'always', 'first ever',
]

function hasAny(text: string, words: string[]): string[] {
  const s = ` ${normalizeSpan(text).toLowerCase()} `
  return words.filter(w => s.includes(` ${w} `) || s.includes(` ${w},`) || s.includes(` ${w}.`))
}

export interface GroundingResult {
  grounding: 'exact' | 'partial' | 'failed'
  containment: number
  strengthInflation: boolean
  hedgesDropped: string[]
  absolutesAdded: string[]
  numbersMissing: string[]
  datesMissing: string[]
  action: GateAction
  checks: GateCheck[]
}

/** Tier 1 exact, tier 2 5-gram containment (downgrade, never citable as a
 *  claim), tier 3 strength inflation. Numeric identity is a BLOCK, not a
 *  downgrade: that single rule catches the fabricated "$100 million". */
export function groundClaim(claimText: string, quote: string, sourceText: string): GroundingResult {
  const checks: GateCheck[] = []
  const q = normalizeSpan(quote)
  const src = normalizeSpan(sourceText)

  const exact = Boolean(q) && src.includes(q)
  const containment = exact ? 1 : ngramContainment(q, src)
  const grounding: GroundingResult['grounding'] = exact ? 'exact' : containment >= TIER2_CONTAINMENT ? 'partial' : 'failed'
  checks.push(check('quote_exact_substring', exact, { quote_len: q.length, found: exact }, 'quote is a verbatim substring of the source'))
  checks.push(check('quote_ngram_containment', containment >= TIER2_CONTAINMENT, Number(containment.toFixed(3)), `>= ${TIER2_CONTAINMENT} of the quote 5-grams present in the source`))

  const qHedges = hasAny(q, HEDGES)
  const cHedges = hasAny(claimText, HEDGES)
  const hedgesDropped = qHedges.filter(h => !cHedges.includes(h))
  const qAbs = hasAny(q, ABSOLUTES)
  const cAbs = hasAny(claimText, ABSOLUTES)
  const absolutesAdded = cAbs.filter(a => !qAbs.includes(a))
  const strengthInflation = hedgesDropped.length > 0 || absolutesAdded.length > 0
  checks.push(check('strength_inflation', !strengthInflation, { hedges_dropped: hedgesDropped, absolutes_added: absolutesAdded }, 'the claim is no stronger than its quote'))

  const nm = numbersMissing(claimText, q).map(n => n.raw)
  const dm = datesMissing(claimText, `${q} ${src}`)
  checks.push(check('numeric_identity', nm.length === 0, nm, 'every number in the claim appears in the quote at the same magnitude'))
  checks.push(check('date_identity', dm.length === 0, dm, 'every year or ISO date in the claim appears in the quote or the source'))

  let action: GateAction = 'pass'
  if (nm.length) action = 'block'
  else if (grounding === 'failed') action = 'block'
  else if (grounding === 'partial' || strengthInflation) action = 'downgrade'
  else if (dm.length) action = 'flag'

  return { grounding, containment, strengthInflation, hedgesDropped, absolutesAdded, numbersMissing: nm, datesMissing: dm, action, checks }
}

// ═══════════════════════════════════════════════════════════════════════════
// G3. INTERESTINGNESS, with verifiability as a MULTIPLIER not an addend.
// ═══════════════════════════════════════════════════════════════════════════
//
// Surprise correlates with being wrong, so the counterweight has to be
// structural: gate first, rank second. A weighted sum would let a 9 on surprise
// carry a 2 on verifiability, which is precisely the failure being guarded.

export const MIN_VERIFIABILITY = 2
export const FALSIFIER_JACCARD_CEILING = 0.6
export const FALSIFIER_HORIZON_DAYS = 90

export const SOURCE_CLASSES = [
  'filing', 'transcript', 'pricing page', 'pricing', 'job board', 'job postings',
  'dataset', 'database', 'regulator', 'court docket', 'docket', 'repo', 'repository', 'benchmark',
  '10-k', '10-q', '8-k', 's-1', 'earnings call', 'changelog', 'api docs', 'prospectus',
]

// Widened 2026-08-06 after the first live run. Five genuinely well-formed
// falsifiers were rejected: "SEC Form D filings ... as of August 2026 showing
// no investment", "showing more than zero earned-media articles", "listing
// fewer than three verticals". The gate was producing false negatives that
// would abort the investigation every week, which is worse than useless: a
// guard that always fires teaches you to switch it off.
// Three specific gaps, each closed narrowly:
//   1. "as of <Month Year>" is a real observation horizon; only by/before/
//      after/within were recognised.
//   2. Comparators followed by a SPELLED-OUT number ("more than zero",
//      "fewer than three") were invisible to a digit-only pattern.
//   3. The artifact list held only SEC's four main forms, so Form D, a
//      registry, a portfolio page and an investor deck all read as vague.
// The tautology, source-class and horizon checks are unchanged, so a vacuous
// falsifier still fails on those.
const NUMWORD = '(?:\\d|zero|one|two|three|four|five|six|seven|eight|nine|ten|no\\b)'
const OBSERVABLE_NUM = new RegExp(
  `\\b(above|below|under|over|at least|at most|fewer than|more than|less than|greater than|no more than|<|>)\\s*[$£€]?\\s*${NUMWORD}`, 'i')
const OBSERVABLE_ARTIFACT = /\b(10-k|10-q|8-k|s-1|form d|form 4|13f|earnings call|headcount|job postings?|pricing page|changelog|api docs|arr|churn|prospectus|docket|annual report|corporate filings?|registry|portfolio page|investor deck|cap table|company website|press release|dataset|database)\b/i
const OBSERVABLE_DATED = /\b(by|before|after|within|as of)\s+(q[1-4]\s*20\d{2}|20\d{2}|\d{1,2}\s+(months|weeks|quarters|days)|(january|february|march|april|may|june|july|august|september|october|november|december)\s+20\d{2})\b/i
const HORIZON_RE = /\b(q[1-4]\s*20\d{2}|20\d{2}-\d{2}-\d{2}|20\d{2}|\d{1,2}\s*(days|weeks|months|quarters|years)|next (quarter|year|earnings))\b/i

export const TAUTOLOGY_BLACKLIST = [
  'if it turns out', 'if this is wrong', 'if the trend does not continue',
  'if the data shows otherwise', 'if it proves false', 'if this does not happen',
  // Generic, because widening `observable` above made "<artifact> shows
  // otherwise" reachable. Naming a source class is not the same as naming what
  // you expect to see in it.
  'shows otherwise', 'says otherwise', 'indicates otherwise', 'proves otherwise',
]

export interface FalsifierResult {
  ok: boolean
  jaccard: number
  checks: GateCheck[]
}

/** Deterministic, or the model emits "this would be falsified if it turned out
 *  not to be true". Four requirements, all checkable in code.
 *  falsifier_jaccard is logged as an observed value even when it passes, so
 *  well-formed-but-vacuous drift is visible over months. */
export function falsifierIsWellFormed(claimText: string, falsifier: string): FalsifierResult {
  const f = normalizeSpan(falsifier || '')
  const lower = f.toLowerCase()
  const checks: GateCheck[] = []

  const observableNum = OBSERVABLE_NUM.test(f)
  const observableArtifact = OBSERVABLE_ARTIFACT.test(f)
  const observableDated = OBSERVABLE_DATED.test(f)
  const observable = observableNum || observableArtifact || observableDated
  checks.push(check('falsifier_observable', observable, { number_comparator: observableNum, artifact_class: observableArtifact, dated_event: observableDated }, 'a number plus comparator, a named artifact class, or a dated event'))

  const classHits = SOURCE_CLASSES.filter(c => lower.includes(c))
  checks.push(check('falsifier_source_class', classHits.length > 0, classHits, `at least one of: ${SOURCE_CLASSES.slice(0, 9).join(', ')}`))

  const tautology = TAUTOLOGY_BLACKLIST.filter(t => lower.includes(t))
  const jac = titleJaccard(claimText || '', f)
  const notTautological = tautology.length === 0 && jac < FALSIFIER_JACCARD_CEILING
  checks.push(check('falsifier_not_tautological', notTautological, { blacklist_hits: tautology, jaccard: Number(jac.toFixed(3)) }, `no blacklisted phrasing and jaccard vs the claim < ${FALSIFIER_JACCARD_CEILING}`))

  const horizon = HORIZON_RE.test(f)
  checks.push(check('falsifier_horizon', horizon, horizon ? (f.match(HORIZON_RE) || [])[0] : null, 'a date, quarter, or duration'))

  return { ok: observable && classHits.length > 0 && notTautological && horizon, jaccard: jac, checks }
}

export interface InterestInput {
  ref: string
  text: string
  surprise: number
  verifiability: number
  falsifier: string
}

export interface InterestResult {
  verdict: GateVerdict
  priority: number
  wellFormed: boolean
  jaccard: number
}

export function gateInterest(input: InterestInput): InterestResult {
  const f = falsifierIsWellFormed(input.text, input.falsifier)
  const checks: GateCheck[] = [...f.checks]
  const verifiable = Number(input.verifiability) >= MIN_VERIFIABILITY
  checks.push(check('verifiability_floor', verifiable, input.verifiability, `>= ${MIN_VERIFIABILITY} on a 0 to 5 scale`))

  // Ranking among SURVIVORS only. Never a weighted sum across the gate.
  const priority = Number(input.surprise || 0) + 2 * Number(input.verifiability || 0)
  checks.push(check('priority_rank', true, priority, 'surprise + 2 * verifiability, computed only after the gate'))

  const action: GateAction = f.ok && verifiable ? 'pass' : 'block'
  return {
    verdict: { gate: 'G3_interest', subject_kind: 'claim', subject_ref: input.ref, subject_label: input.text.slice(0, 160), action, score: priority, checks, model_calls: 0 },
    priority, wellFormed: f.ok, jaccard: f.jaccard,
  }
}

/** The falsifier as a product: when it comes due against the corrections log. */
export function falsifierDueOn(from = new Date(), days = FALSIFIER_HORIZON_DAYS): string {
  const d = new Date(from.getTime() + days * 86_400_000)
  return d.toISOString().slice(0, 10)
}

// ═══════════════════════════════════════════════════════════════════════════
// G4. WHY-LADDER DESCENT. The stopping rule as code.
// ═══════════════════════════════════════════════════════════════════════════
//
// MAX_RUNGS = 3 (rung 0 is the thesis, 1 to 3 the descent). Depth 5 was
// arithmetically unreachable. The differentiator is not rung count, it is that
// the terminal layer gets PUBLISHED.

export const MAX_RUNGS = 3

/** Note the absences. Bare `incentive`, `culture`, `strategy` and `vision` are
 *  not members. `incentive_contract` is admissible because a contract is a
 *  document you can cite. "Because incentives" is not a mechanism, and the
 *  unfalsifiable-abstraction guard is therefore an enum membership test. */
export const MECHANISM_TYPES = [
  'price', 'cost_structure', 'capital_allocation', 'contract', 'regulation',
  'capacity', 'supply', 'distribution', 'measurement_artifact', 'accounting',
  'incentive_contract',
] as const
export type MechanismType = typeof MECHANISM_TYPES[number]

export const ABSTRACT_NOUNS = [
  'incentives', 'dynamics', 'forces', 'pressure', 'culture', 'alignment',
  'ecosystem', 'paradigm', 'landscape', 'transformation', 'disruption',
  'synergy', 'momentum', 'appetite', 'sentiment', 'narrative',
]

const FUNCTION_WORDS = new Set([
  'the', 'and', 'that', 'this', 'with', 'from', 'into', 'they', 'them', 'their',
  'have', 'has', 'was', 'were', 'been', 'are', 'for', 'but', 'not', 'you', 'its',
  'which', 'when', 'what', 'than', 'then', 'because', 'more', 'less', 'about',
])

export function abstractionScore(text: string): number {
  const words = normalizeSpan(text).toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3 && !FUNCTION_WORDS.has(w))
  if (!words.length) return 0
  const abstract = words.filter(w => ABSTRACT_NOUNS.includes(w)).length
  return abstract / words.length
}

const COMMON_CAPS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'it', 'they', 'we', 'i',
  'but', 'and', 'when', 'while', 'because', 'if', 'past', 'every', 'each',
  'his', 'her', 'their', 'its', 'there', 'here', 'what', 'why', 'how', 'who',
  'in', 'on', 'at', 'for', 'to', 'of', 'by', 'from', 'with', 'as', 'so', 'yet',
])

/** Capitalized multi-token spans, non-sentence-initial capitalized tokens, and
 *  numeric tokens. Abstraction is precisely the removal of specifics, so a rung
 *  that restates its parent in grander words introduces no new artifact and
 *  dies here. This is the single most effective anti-abstraction check
 *  available in code. */
export function namedArtifacts(text: string): string[] {
  const s = normalizeSpan(text)
  const out = new Set<string>()

  const multi = /\b([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*)+)\b/g
  let m: RegExpExecArray | null
  while ((m = multi.exec(s)) !== null) out.add(m[1].toLowerCase())

  // Sentence-initial capitals carry no information, so skip index 0 of each.
  for (const sentence of s.split(/(?<=[.!?])\s+/)) {
    const words = sentence.split(/\s+/)
    for (let i = 1; i < words.length; i++) {
      const w = words[i].replace(/[^A-Za-z0-9&.'-]/g, '')
      if (w.length > 2 && /^[A-Z]/.test(w) && !COMMON_CAPS.has(w.toLowerCase())) out.add(w.toLowerCase())
    }
  }

  for (const n of extractNumbers(s)) out.add(`#${n.value}${n.percent ? '%' : ''}`)
  return [...out]
}

export type TerminalReason = 'cap' | 'motive_not_mechanism' | 'evidence_exhausted' | 'restatement' | 'abstraction_drift' | 'budget_exhausted'

export interface RungInput {
  ref: string
  rung: number
  text: string
  mechanismType: string | null
  evidenceIds: string[]
  evidenceDomains: string[]
  grounding: GroundingResult | null
  priorRungTexts: string[]
  priorAbstraction: number[]
}

export interface RungResult {
  verdict: GateVerdict
  mayDescend: boolean
  terminalReason: TerminalReason | null
  abstraction: number
  newArtifacts: string[]
}

/** A rung earns another descent only if all five hold, all deterministic.
 *  Enforced by loop bound and by this function, never by prompt. */
export function gateRung(input: RungInput): RungResult {
  const checks: GateCheck[] = []

  const evidenceOk = input.evidenceIds.length >= 2
  const domains = [...new Set(input.evidenceDomains.filter(Boolean))]
  const domainsOk = domains.length >= 2
  checks.push(check('rung_evidence_count', evidenceOk, input.evidenceIds.length, '>= 2 citable evidence rows'))
  checks.push(check('rung_evidence_domains', domainsOk, domains, '>= 2 distinct root domains'))

  const mech = String(input.mechanismType || '')
  const mechOk = (MECHANISM_TYPES as readonly string[]).includes(mech)
  checks.push(check('mechanism_type_enum', mechOk, mech || null, `one of: ${MECHANISM_TYPES.join(', ')}`))

  const prior = new Set(input.priorRungTexts.flatMap(t => namedArtifacts(t)))
  const mine = namedArtifacts(input.text)
  const novel = mine.filter(a => !prior.has(a))
  checks.push(check('new_artifact', novel.length > 0, novel.slice(0, 12), 'at least one named entity or number absent from every prior rung'))

  const abs = abstractionScore(input.text)
  const rising = input.priorAbstraction.length >= 1 &&
    abs > input.priorAbstraction[input.priorAbstraction.length - 1] &&
    (input.priorAbstraction.length < 2 || input.priorAbstraction[input.priorAbstraction.length - 1] > input.priorAbstraction[input.priorAbstraction.length - 2])
  checks.push(check('abstraction_drift', !rising, { score: Number(abs.toFixed(4)), prior: input.priorAbstraction.map(x => Number(x.toFixed(4))) }, 'not a monotone rise across two consecutive rungs'))

  const groundOk = !input.grounding || input.grounding.action !== 'block'
  checks.push(check('rung_grounding', groundOk, input.grounding ? { grounding: input.grounding.grounding, action: input.grounding.action } : 'no source text supplied', 'the rung passes G2 against its own evidence'))

  const capped = input.rung >= MAX_RUNGS
  checks.push(check('rung_cap', !capped, input.rung, `rung < ${MAX_RUNGS}`))

  let terminalReason: TerminalReason | null = null
  if (!evidenceOk || !domainsOk) terminalReason = 'evidence_exhausted'
  else if (!novel.length) terminalReason = 'restatement'
  else if (rising) terminalReason = 'abstraction_drift'
  else if (!mechOk) terminalReason = 'motive_not_mechanism'
  else if (!groundOk) terminalReason = 'evidence_exhausted'
  else if (capped) terminalReason = 'cap'

  const mayDescend = terminalReason === null
  return {
    verdict: {
      gate: 'G4_ladder', subject_kind: 'rung', subject_ref: input.ref,
      subject_label: input.text.slice(0, 160),
      action: mayDescend ? 'pass' : 'flag', score: Number(abs.toFixed(4)), checks, model_calls: 0,
    },
    mayDescend, terminalReason, abstraction: abs, newArtifacts: novel,
  }
}

export interface TerminalContext {
  entity?: string | null
  outcome?: string | null
  searches?: number
  domains?: number
  question?: string | null
}

/** Fixed template per reason, never a free model call, so the terminal layer
 *  cannot be softened into marketing. G6 blocks unless this exact string is a
 *  substring of the draft body. That is how "publish the terminal layer"
 *  becomes enforceable rather than intended. */
export function terminalStatement(reason: TerminalReason, ctx: TerminalContext = {}): string {
  const entity = ctx.entity || 'the party involved'
  const outcome = ctx.outcome || 'this outcome'
  const searches = ctx.searches ?? 0
  const domains = ctx.domains ?? 0
  const question = ctx.question || 'the question below'
  switch (reason) {
    case 'motive_not_mechanism': {
      // `outcome` arrives as rung-0 text, which is very often already an
      // interrogative ("how did an undenominated number reach 9 outlets"). The
      // old template spliced it after "why X wants", producing "why Andreessen
      // Horowitz wants how did an undenominated number reach 9 outlets", which
      // is broken English. Measured on the first real run, 2026-08-05.
      // This string is published VERBATIM (G6 blocks any draft missing it), so
      // a mangled sentence ships under Krish's name. Detect the interrogative
      // and restructure rather than splice.
      const o = outcome.trim().replace(/[.?!]+$/, '')
      const interrogative = /^(how|why|what|who|when|where|whether|did|does|is|are|was|were|can|could|will|would)\b/i.test(o)
      if (interrogative) {
        return `Past this point the explanations are motive, not mechanism. The next honest question is ${o}, and I cannot answer that from filings.`
      }
      return `Past this point the explanations are motive, not mechanism. The next honest question is why ${entity} wants ${o}, and I cannot answer that from filings.`
    }
    case 'evidence_exhausted':
      return `Past this point the record runs out. ${searches} searches across ${domains} domains produced nothing citable on ${question}.`
    case 'restatement':
      return 'Past this point the answers restate the question in longer words.'
    case 'cap':
      return 'This ladder stops at three rungs by design. Rung four would be inference, not evidence.'
    case 'abstraction_drift':
      return 'Past this point each answer is more abstract than the one above it, which is the shape of an explanation that has stopped explaining.'
    case 'budget_exhausted':
      // The record running out and the budget running out are different facts
      // and only one of them is a finding. Before this existed, a model cap, an
      // API error and an unparseable response all published "Past this point the
      // record runs out", which is a false statement in print about how hard the
      // system looked. The terminal layer is the one thing this pipeline promises
      // to publish honestly, so it may not round a spending limit up into a
      // conclusion about the world.
      return `This ladder stopped because the run itself stopped, not because the record ran out. ${searches} searches and ${domains} domains in, the next rung was never attempted. Read this as an unfinished ladder, not a finding.`
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// G5. HARNESS OUTPUTS. The fabrication gate.
// ═══════════════════════════════════════════════════════════════════════════

export const MAX_EVIDENCE_FETCHES_PER_RUN = 24
export const FETCH_CONCURRENCY = 6
export const FETCH_BYTES = 40_000
export const FETCH_TIMEOUT_MS = 6000
export const HEADLINE_MATCH_JACCARD = 0.35
export const DATE_SANITY_DAYS = 3

export type QuarantineReason =
  | 'unparseable_url' | 'url_dead' | 'headline_mismatch' | 'number_not_on_page'
  | 'implausible_publisher' | 'fetch_error' | 'budget_exhausted'

/** tier 0 primary, 1 wires and named mastheads, 2 trade press and analyst,
 *  3 vendor blog and press release, 4 newsletter, aggregator, SEO farm. */
export function sourceTier(url: string | null): number {
  const d = rootDomain(url)
  if (!d) return 4
  const host = (() => { try { return new URL(url as string).hostname.toLowerCase() } catch { return d } })()
  const path = (() => { try { return new URL(url as string).pathname.toLowerCase() } catch { return '' } })()

  if (/(^|\.)sec\.gov$/.test(d) || /(^|\.)gov$/.test(d) || d.endsWith('.gov') || d.endsWith('.gov.uk') ||
      d === 'europa.eu' || d.endsWith('.europa.eu') || d === 'gov.uk' ||
      d === 'courtlistener.com' || d === 'arxiv.org' || d === 'doi.org' ||
      d === 'iso.org' || d === 'ietf.org' || d === 'w3.org' || d === 'nist.gov') return 0
  if (/^(ir|investor|investors)\./.test(host)) return 0
  if (/\/(pricing|changelog|releases|release-notes)(\/|$)/.test(path)) return 0

  if (TIER1_DOMAINS.has(d)) return 1
  const entry = VENDOR_DOMAINS[d]
  if (entry) return entry.tier === 'analyst' ? 2 : 3
  if (TIER2_DOMAINS.has(d)) return 2
  if (TIER4_DOMAINS.has(d)) return 4
  return 3
}

export const TIER1_DOMAINS = new Set([
  'reuters.com', 'apnews.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'nytimes.com',
  'washingtonpost.com', 'economist.com', 'theguardian.com', 'bbc.co.uk', 'bbc.com',
  'cnbc.com', 'axios.com', 'politico.com', 'afp.com', 'nikkei.com', 'scmp.com',
])
export const TIER2_DOMAINS = new Set([
  'theinformation.com', 'techcrunch.com', 'theverge.com', 'arstechnica.com',
  'wired.com', 'venturebeat.com', 'zdnet.com', 'businessinsider.com', 'fortune.com',
  'forbes.com', 'theregister.com', 'semianalysis.com', 'stratechery.com', 'ieee.org',
])
export const TIER4_DOMAINS = new Set([
  'substack.com', 'medium.com', 'thedeepview.com', 'therundown.ai', 'tldr.tech',
  'news.ycombinator.com', 'reddit.com', 'x.com', 'twitter.com', 'linkedin.com',
  'marketingprofs.com', 'apidog.com',
])

/** G5.2 circular-reporting counter. Two rows on different domains that share a
 *  numeric fingerprint AND name the same originating entity are ONE origin, not
 *  two. Nine outlets reprinting one release is distinct_domains 9,
 *  distinct_origins 1. Record both: that pair of numbers, published, IS the
 *  circulation thesis G1 pivots to. The gate and the story become one artifact. */
export function numericFingerprint(text: string): string {
  const nums = extractNumbers(text)
    .filter(n => !n.yearLike && n.value !== 0)
    .map(n => `${n.value}${n.percent ? 'p' : ''}`)
  return [...new Set(nums)].sort().join('|')
}

export function entitySlug(entity: string | null | undefined): string {
  return String(entity || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown'
}

export function originKey(entity: string | null | undefined, text: string): string {
  return `${entitySlug(entity)}:${numericFingerprint(text)}`
}

export interface DiversityResult {
  distinctDomains: number
  distinctOrigins: number
  domains: string[]
  origins: string[]
  circular: boolean
  /** The load-bearing numbers this run keyed on. Published alongside the counts
   *  so "3 domains, 1 origin" is a claim a reader can re-derive. */
  anchorNumbers: string[]
}

/** The set of numbers a row carries that also appear in the ANCHOR claim.
 *  Set equality on the whole page fingerprint was the original design and it is
 *  inert on real HTML: measured 2026-08-05, three outlets reprinting one press
 *  release produced three DIFFERENT fingerprints, because each page carries its
 *  own furniture (read time, comment count, subscription price, copyright year)
 *  and any extra number can only INCREASE the origin count. The detector
 *  therefore returned "3 domains, 3 origins, not circular" for a one-origin
 *  syndication and for three genuinely independent measurements alike: identical
 *  output, zero discriminating power, failing open in every case.
 *  Keying on the anchor's OWN load-bearing numbers is the honest relation. Two
 *  pages carrying the same anchor number are reprinting it. A page carrying its
 *  own different number measured something. */
function carriedAnchorNumbers(text: string, anchorNumbers: NumberToken[]): string[] {
  if (!anchorNumbers.length) return []
  const have = extractNumbers(text)
  return anchorNumbers
    .filter(a => have.some(h => sameMagnitude(a, h)))
    .map(a => `${a.value}${a.percent ? 'p' : ''}`)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort()
}

export function diversity(
  rows: { url: string | null; entity?: string | null; headline?: string | null; snippet?: string | null }[],
  anchorClaimText = '',
): DiversityResult {
  const domains = [...new Set(rows.map(r => rootDomain(r.url)).filter(Boolean) as string[])]
  const anchorNums = extractNumbers(anchorClaimText).filter(n => !n.yearLike)
  const origins = [...new Set(rows.map(r => {
    const text = `${r.headline || ''} ${r.snippet || ''}`
    const shared = carriedAnchorNumbers(text, anchorNums)
    // A row carrying none of the anchor's numbers is its own origin, keyed on its
    // domain: it is not evidence of circulation either way.
    return shared.length
      ? `${entitySlug(r.entity)}:reprint:${shared.join('|')}`
      : `${entitySlug(r.entity)}:own:${rootDomain(r.url) || 'unknown'}`
  }))]
  return {
    distinctDomains: domains.length, distinctOrigins: origins.length, domains, origins,
    circular: domains.length > origins.length,
    anchorNumbers: anchorNums.map(n => n.raw),
  }
}

export const MIN_RUNG_DOMAINS = 2
export const MIN_INVESTIGATION_DOMAINS = 4

/** Deterministic first pass on publisher plausibility. marketingprofs.com does
 *  not publish G7 policy stories. Only a domain ABSENT from this map needs a
 *  model, and the answer is cached so the marginal cost trends to zero. */
export const PUBLISHER_BEATS: Record<string, string[]> = {
  'reuters.com': ['policy', 'markets', 'enterprise_tech', 'security', 'consumer'],
  'apnews.com': ['policy', 'markets', 'consumer'],
  'bloomberg.com': ['markets', 'policy', 'enterprise_tech'],
  'ft.com': ['markets', 'policy', 'enterprise_tech'],
  'wsj.com': ['markets', 'policy', 'enterprise_tech'],
  'nytimes.com': ['policy', 'consumer', 'markets'],
  'economist.com': ['policy', 'markets'],
  'cnbc.com': ['markets', 'enterprise_tech'],
  'axios.com': ['policy', 'markets', 'enterprise_tech'],
  'politico.com': ['policy'],
  'theinformation.com': ['enterprise_tech', 'markets'],
  'techcrunch.com': ['enterprise_tech', 'markets'],
  'theverge.com': ['consumer', 'enterprise_tech', 'policy'],
  'arstechnica.com': ['enterprise_tech', 'security', 'research'],
  'wired.com': ['consumer', 'research', 'security'],
  'venturebeat.com': ['enterprise_tech'],
  'theregister.com': ['enterprise_tech', 'security'],
  'semianalysis.com': ['enterprise_tech', 'research'],
  'arxiv.org': ['research'],
  'sec.gov': ['markets', 'policy'],
  'europa.eu': ['policy'],
  'gov.uk': ['policy'],
  'crowdstrike.com': ['security'],
  'huggingface.co': ['research', 'enterprise_tech'],
  // The named failure. A marketing training site is not a policy desk.
  'marketingprofs.com': ['marketing'],
  'hubspot.com': ['marketing'],
  'adweek.com': ['marketing'],
  'marketingdive.com': ['marketing'],
}

export const BEAT_TAGS = ['policy', 'markets', 'enterprise_tech', 'marketing', 'research', 'security', 'consumer'] as const

/** Maps the existing SHIFT_CATEGORIES vocabulary onto publisher beats so a
 *  claim can be compared against a masthead without a second taxonomy. */
export const CATEGORY_BEATS: Record<string, string[]> = {
  model: ['research', 'enterprise_tech'],
  economics: ['markets', 'enterprise_tech'],
  tools: ['enterprise_tech'],
  orchestration: ['enterprise_tech'],
  product: ['consumer', 'enterprise_tech'],
  governance: ['policy'],
  security: ['security'],
  org: ['enterprise_tech', 'markets'],
  proof: ['research', 'enterprise_tech'],
}

export interface PlausibilityResult {
  known: boolean
  plausible: boolean
  publisherBeats: string[]
  claimBeats: string[]
}

export function publisherPlausible(url: string | null, category: string | null, extra: Record<string, string[]> = {}): PlausibilityResult {
  const d = rootDomain(url)
  const beats = d ? (extra[d] || PUBLISHER_BEATS[d]) : undefined
  const claimBeats = CATEGORY_BEATS[String(category || '')] || []
  if (!beats) return { known: false, plausible: true, publisherBeats: [], claimBeats }
  if (!claimBeats.length) return { known: true, plausible: true, publisherBeats: beats, claimBeats }
  const overlap = beats.some(b => claimBeats.includes(b))
  return { known: true, plausible: overlap, publisherBeats: beats, claimBeats }
}

export interface EvidenceGateInput {
  ref: string
  url: string | null
  storedHeadline: string
  claimText: string
  category: string | null
  occurredOn: string | null
  fetched: {
    ok: boolean
    status: number | null
    title: string | null
    ogTitle: string | null
    publishedOn: string | null
    text: string
    error?: string | null
  } | null
  beatOverrides?: Record<string, string[]>
}

export interface EvidenceGateResult {
  verdict: GateVerdict
  citable: boolean
  quarantineReason: QuarantineReason | null
  tier: number
  loadBearing: boolean
}

/** Four checks in ascending cost order, each able to kill a row before the next
 *  spends anything. This is the gate that would have killed all 116 URL-less
 *  rows on the first check and the fabricated "$100 million" on the fourth. */
export function gateEvidence(input: EvidenceGateInput): EvidenceGateResult {
  const checks: GateCheck[] = []
  const dom = rootDomain(input.url)
  const tier = sourceTier(input.url)
  let quarantine: QuarantineReason | null = null

  checks.push(check('url_parseable', Boolean(dom), input.url || null, 'a parseable URL with a root domain'))
  if (!dom) quarantine = 'unparseable_url'

  const f = input.fetched
  const live = Boolean(f?.ok)
  checks.push(check('url_live', live, { status: f?.status ?? null, error: f?.error ?? null }, 'a 2xx response to a ranged GET'))
  if (!quarantine && !live) quarantine = f?.error ? 'fetch_error' : 'url_dead'

  const pageTitle = normalizeSpan(`${f?.title || ''} ${f?.ogTitle || ''}`)
  const jac = pageTitle ? titleJaccard(input.storedHeadline, pageTitle) : 0
  const titleOk = jac >= HEADLINE_MATCH_JACCARD
  checks.push(check('headline_identity', titleOk, { jaccard: Number(jac.toFixed(3)), page_title: pageTitle.slice(0, 140) }, `titleJaccard >= ${HEADLINE_MATCH_JACCARD} against the fetched title`))
  if (!quarantine && live && !titleOk) quarantine = 'headline_mismatch'

  const pageText = `${pageTitle} ${f?.text || ''}`
  const nm = live ? numbersMissing(input.claimText, pageText).map(n => n.raw) : []
  checks.push(check('numbers_on_page', nm.length === 0, nm, 'every number in the claim appears verbatim on the page'))
  if (!quarantine && live && nm.length) quarantine = 'number_not_on_page'

  const plaus = publisherPlausible(input.url, input.category, input.beatOverrides)
  checks.push(check('publisher_plausible', plaus.plausible, { known: plaus.known, publisher_beats: plaus.publisherBeats, claim_beats: plaus.claimBeats }, 'the publisher beat set overlaps the claim beat'))
  if (!quarantine && !plaus.plausible) quarantine = 'implausible_publisher'

  const dateOk = (() => {
    if (!f?.publishedOn || !input.occurredOn) return null
    const a = new Date(`${f.publishedOn.slice(0, 10)}T00:00:00Z`).getTime()
    const b = new Date(`${input.occurredOn.slice(0, 10)}T00:00:00Z`).getTime()
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null
    return Math.abs(a - b) <= DATE_SANITY_DAYS * 86_400_000
  })()
  checks.push(check('date_sanity', dateOk !== false, { page_date: f?.publishedOn || null, stored_date: input.occurredOn || null }, `within ${DATE_SANITY_DAYS} days, absent is a flag not a reject`))

  checks.push(check('source_tier', true, tier, '0 primary, 1 wire or masthead, 2 trade, 3 vendor, 4 aggregator'))

  const citable = quarantine === null
  // Tier 3 and 4 rows may be STORED (they are the circulation evidence) but can
  // never satisfy G6's mapping requirement for a numeric assertion.
  const loadBearing = citable && tier <= 2
  checks.push(check('load_bearing', loadBearing, { tier, citable }, 'citable and tier <= 2'))

  return {
    verdict: {
      gate: 'G5_harness', subject_kind: 'evidence', subject_ref: input.ref,
      subject_label: (input.storedHeadline || input.url || '').slice(0, 160),
      action: citable ? (dateOk === false ? 'flag' : 'pass') : 'block',
      score: tier, checks, model_calls: 0,
    },
    citable, quarantineReason: quarantine, tier, loadBearing,
  }
}

export interface AnalogyInput { ref: string; text: string; sharedMechanism: string | null; breaksIf: string | null }

/** An analogy whose shared mechanism is not a nameable mechanism is evocative
 *  rather than structural. Permitted in prose, forbidden as a rung, never
 *  counted as evidence. "This rhymes with the dot-com build-out" with no stated
 *  point where the rhyme breaks is exactly what this audience punishes. */
export function gateAnalogy(input: AnalogyInput): { verdict: GateVerdict; loadBearing: boolean } {
  const checks: GateCheck[] = []
  const mech = String(input.sharedMechanism || '')
  const mechOk = (MECHANISM_TYPES as readonly string[]).includes(mech)
  checks.push(check('analogy_shared_mechanism', mechOk, mech || null, `one of: ${MECHANISM_TYPES.join(', ')}`))
  const f = falsifierIsWellFormed(input.text, input.breaksIf || '')
  checks.push(...f.checks.map(c => ({ ...c, id: `breaks_if_${c.id.replace(/^falsifier_/, '')}` })))
  const ok = mechOk && f.ok
  return {
    verdict: {
      gate: 'G5_harness', subject_kind: 'analogy', subject_ref: input.ref,
      subject_label: input.text.slice(0, 160), action: ok ? 'pass' : 'downgrade',
      score: Number(f.jaccard.toFixed(3)), checks, model_calls: 0,
    },
    loadBearing: ok,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// G6. FINAL DRAFT. Claim-to-evidence mapping.
// ═══════════════════════════════════════════════════════════════════════════

export type AssertionKind = 'number' | 'event' | 'quote' | 'attribution'

export interface DraftAssertion {
  sentence: string
  assertion: string
  kind: AssertionKind
  evidence_ref: string | null
}

export interface DraftEvidenceRow {
  ref: string
  url: string | null
  headline: string | null
  pageText: string
  citable: boolean
  loadBearing: boolean
  tier: number
}

export interface DraftGateResult {
  verdicts: GateVerdict[]
  action: GateAction
  fabricatedCitations: string[]
  unmappedBlocking: string[]
  verifySeeds: { quote: string; claim: string; why: string }[]
}

/** Runs after the draft, before _finalPass. Zero model calls: the page text was
 *  stored at G5.1 precisely so this is free. */
export function gateDraft(
  body: string,
  assertions: DraftAssertion[],
  evidence: DraftEvidenceRow[],
  terminalStatementText: string | null,
): DraftGateResult {
  const byRef = new Map(evidence.map(e => [e.ref, e]))
  const verdicts: GateVerdict[] = []
  const fabricated: string[] = []
  const unmapped: string[] = []
  const verifySeeds: { quote: string; claim: string; why: string }[] = []
  const normBody = normalizeSpan(body)

  assertions.forEach((a, i) => {
    const ref = `a${i + 1}`
    const checks: GateCheck[] = []
    let action: GateAction = 'pass'
    const row = a.evidence_ref ? byRef.get(a.evidence_ref) : undefined
    // KIND IS MEASURED, NOT ACCEPTED. The extractor proposes a kind, and the
    // block rules keyed off it: an assertion carrying a number but labelled
    // 'event' took the lenient unmapped path and came out FLAG instead of BLOCK.
    // That made a deterministic gate depend on a model's labelling, so any
    // assertion that actually carries a number is treated as a number.
    const carriesNumber = extractNumbers(a.assertion).some(n => !n.yearLike)
    const kind: AssertionKind = carriesNumber && a.kind !== 'quote' ? 'number' : a.kind
    if (kind !== a.kind) {
      checks.push(check('assertion_kind_measured', true, { declared: a.kind, measured: kind },
        'an assertion carrying a non-year number is a numeric assertion whatever it was labelled'))
    }

    if (a.evidence_ref && !row) {
      // A non-resolving reference is a fabricated citation, full stop.
      fabricated.push(a.evidence_ref)
      checks.push(check('evidence_ref_resolves', false, a.evidence_ref, 'the reference names a real stored evidence row'))
      action = 'block'
    } else if (!a.evidence_ref) {
      const blocking = kind !== 'event'
      checks.push(check('assertion_mapped', false, { kind }, 'number, quote and attribution assertions must map to evidence'))
      if (blocking) { unmapped.push(a.assertion); action = 'block' } else {
        action = 'flag'
        verifySeeds.push({ quote: a.sentence.slice(0, 200), claim: a.assertion.slice(0, 200), why: 'event assertion with no mapped evidence row' })
      }
    } else {
      checks.push(check('evidence_ref_resolves', true, a.evidence_ref, 'the reference names a real stored evidence row'))
      const src = `${row!.headline || ''} ${row!.pageText || ''}`
      if (kind === 'number') {
        const nm = numbersMissing(a.assertion, src).map(n => n.raw)
        checks.push(check('number_in_evidence', nm.length === 0, nm, 'the number appears in the stored page text'))
        checks.push(check('evidence_load_bearing', row!.loadBearing, { tier: row!.tier, citable: row!.citable }, 'a numeric assertion needs a tier 0 to 2 citable row'))
        if (nm.length || !row!.loadBearing) action = 'block'
      } else if (kind === 'quote') {
        // No fuzzy tier. A misquote is worse than a wrong number.
        const q = normalizeSpan(a.assertion.replace(/^["']|["']$/g, ''))
        const found = normalizeSpan(src).includes(q)
        checks.push(check('quote_exact_in_evidence', found, { quote: q.slice(0, 140) }, 'exact substring of the stored page text, no fuzzy tier'))
        if (!found) action = 'block'
      } else {
        checks.push(check('assertion_mapped', true, { kind, ref: a.evidence_ref }, 'mapped to a stored evidence row'))
      }
    }

    verdicts.push({
      gate: 'G6_draft', subject_kind: 'draft', subject_ref: ref,
      subject_label: a.assertion.slice(0, 160), action, score: null, checks, model_calls: 0,
    })
  })

  // COVERAGE. Everything above judges the assertions the extractor CHOSE to
  // return, which made the whole gate contingent on a model's diligence: an
  // extractor that silently omitted the fabricated sentence, or returned an
  // empty list for a draft made entirely of fabrications, produced action=pass
  // with nothing blocked. Both were reproduced 2026-08-05. So the numbers in the
  // draft are counted deterministically and every one of them has to have been
  // checked by some assertion. A number in print that no assertion covers is
  // indistinguishable from a number nobody verified, because that is what it is.
  const bodyNumbers = extractNumbers(body).filter(n => !n.yearLike)
  const coveredText = normalizeSpan(assertions.map(a => `${a.assertion} ${a.sentence}`).join(' '))
  const coveredNumbers = extractNumbers(coveredText)
  const uncovered = bodyNumbers
    .filter(n => !coveredNumbers.some(c => c.value === n.value && c.percent === n.percent))
    .map(n => n.raw)
    .filter((v, i, arr) => arr.indexOf(v) === i)
  if (uncovered.length) unmapped.push(...uncovered.map(n => `unchecked number in the draft: ${n}`))
  verdicts.push({
    gate: 'G6_draft', subject_kind: 'draft', subject_ref: 'coverage',
    subject_label: `${bodyNumbers.length} numbers in the draft, ${assertions.length} assertions extracted`,
    action: uncovered.length ? 'block' : 'pass', score: uncovered.length, model_calls: 0,
    checks: [check('every_number_checked', uncovered.length === 0,
      { draft_numbers: bodyNumbers.length, assertions: assertions.length, uncovered },
      'every non-year number in the draft body appears in an extracted assertion')],
  })

  const tsOk = !terminalStatementText || normBody.includes(normalizeSpan(terminalStatementText))
  verdicts.push({
    gate: 'G6_draft', subject_kind: 'draft', subject_ref: 'terminal',
    subject_label: (terminalStatementText || '').slice(0, 160),
    action: tsOk ? 'pass' : 'block', score: null, model_calls: 0,
    checks: [check('terminal_statement_published', tsOk, { present: tsOk }, 'the terminal statement is a verbatim substring of the draft body')],
  })

  return {
    verdicts,
    action: worstAction(verdicts.map(v => v.action)),
    fabricatedCitations: fabricated,
    unmappedBlocking: unmapped,
    verifySeeds,
  }
}
