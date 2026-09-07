import { createHash } from 'node:crypto'
import { onTeardownBeat } from './_beat.js'
import { sanitizeVoice } from './_content.js'

export const EDITORIAL_RADAR_SCHEMA_VERSION = 2 as const
export const EDITORIAL_RADAR_GENERATOR_REVISION = 'editorial-radar-v2'
export const EDITORIAL_SERIES = ['money_of_ai', 'built_with_ai'] as const
export type EditorialSeries = typeof EDITORIAL_SERIES[number]

type JsonRecord = Record<string, unknown>

/** Present when the signal is one of Krish's own build weeks
 *  (api/_buildSignals.ts). The lens reads it to know what may be named and
 *  what may never be revealed; the parser enforces both deterministically. */
export interface EditorialBuildContext {
  public_name: string
  role: string
  mode: 'named' | 'anonymous'
  never_reveal: string | null
  /** Names of an anonymous repo that must not appear in a candidate. */
  forbidden_terms: string[]
}

export interface EditorialSignalV2 {
  id: string
  title: string
  summary: string
  occurred_at: string
  source_urls: string[]
  corroboration: number
  category: string
  build?: EditorialBuildContext | null
}

/** A disclosed amount of money. The Money of AI may read a build for the
 *  pricing, packaging or positioning decision inside it, never for the
 *  number: revenue, price, cash and the rate card are private (canon,
 *  mindmake/project-documentation/01_CANON.md, Pricing). Enforced in code
 *  because a prompt rule loses to a vivid figure every time. */
export const MONEY_FIGURE = /(?:[$£€]\s?\d[\d,.]*[kKmM]?\b|\b\d[\d,.]*\s?(?:usd|gbp|eur|aud|dollars|pounds|euros)\b|\bMRR\b|\bARR\b|\brevenue\s+(?:of|was|is|at|hit|reached)\s+\d|\bper\s+(?:month|year|week)\s+in\s+revenue\b)/i

export function namesForbiddenTerm(text: string, terms: string[]): string | null {
  const lower = text.toLowerCase()
  for (const t of terms) {
    const term = t.toLowerCase().trim()
    if (!term) continue
    const re = new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i')
    if (re.test(lower)) return t
  }
  return null
}

export interface EditorialOpportunityV2 {
  schema_version: typeof EDITORIAL_RADAR_SCHEMA_VERSION
  series: EditorialSeries
  signal_id: string
  status: 'eligible' | 'near_miss' | 'rejected' | 'no_angle'
  title: string | null
  angle: string | null
  audience_problem: string | null
  why_now: string | null
  proposed_hook: string | null
  honest_payoff: string | null
  mechanism: string | null
  visual_proof: string | null
  source_mode: 'extract' | 'short_native' | null
  production_effort: 'low' | 'medium' | 'high' | null
  strongest_failure: string
  safer_version: string | null
  ambitious_version: string | null
  recommended_version: string | null
  recommendation_reason: string | null
  credible_contradiction: string
  source_urls: string[]
  corroboration: number
  hard_blocks: string[]
  soft_blocks: string[]
  editorial: {
    truth: boolean
    evidence: boolean
    confidentiality: boolean
    rights: boolean
    series_fit: boolean
    meaningful_mechanism: boolean
  }
  growth: {
    first_beat_tension: number
    clarity: number
    surprise: number
    payoff: number
    delivery_strength: number
    visual_proof: number
    share_save_usefulness: number
    qualified_audience_fit: number
    novelty: number
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function text(value: unknown, max = 600): string | null {
  if (typeof value !== 'string') return null
  const normalized = sanitizeVoice(value).replace(/\s+/g, ' ').trim()
  return normalized && normalized.length <= max ? normalized : null
}

function score(value: unknown): number {
  const number = typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(number) ? Math.max(0, Math.min(10, Math.round(number * 10) / 10)) : 0
}

function bool(value: unknown): boolean {
  return value === true
}

function validUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function editorialSignalHash(signal: EditorialSignalV2): string {
  return createHash('sha256').update(JSON.stringify({
    title: signal.title,
    summary: signal.summary,
    occurred_at: signal.occurred_at,
    source_urls: [...signal.source_urls].sort(),
    corroboration: signal.corroboration,
    category: signal.category,
  })).digest('hex')
}

/** The extra rules that apply when the batch carries one of Krish's own
 *  builds. Appended only then, so pool headlines are judged exactly as
 *  before and are not regenerated at cost. */
export function buildLensBlock(series: EditorialSeries): string {
  const shared = [
    'MINDMAKE BUILDS',
    'Some signals carry a "build" field. Those are Krish\'s own builds for the week: his commits, merged pull requests and build logs, so the owned artifact is real and the rights are his.',
    'When build.mode is "named", use build.public_name and nothing else for the product. When build.mode is "anonymous", never name the repository, the product, its domain, its purpose or its users; call it a side build. Never reveal anything listed in build.never_reveal.',
    'Never invent a number, a failure or a quotation that the commit text does not contain. Where the record is thin, say what is missing in strongest_failure rather than filling it.',
  ]
  const lens = series === 'built_with_ai'
    ? [
        'This is the solo variant of Built with AI: Krish is the builder, held to the same three-why standard as a guest. Surface why, then strategic why, then the human why. The third why is the piece.',
        'Enter through the strange decision, the failure that forced the build, or the first imperfect version, never through the feature list. A candidate that is mostly a list of tools, files or features is no_angle.',
        'Prefer the commit or PR body that names a wrong assumption, a silent failure or a number that surprised him. The mechanism must be one a builder can reuse.',
      ]
    : [
        'The Money of AI reads a build only for the pricing, packaging, positioning, monetisation or unit-economics decision inside it: what was made private, what was made free, what the product refuses to sell, what a run costs and why, who pays.',
        'Never state revenue, price, cash, MRR, a rate card or a target figure. Reasoning about the decision is the piece; the number is not. If the build carries no money decision, return no_angle.',
      ]
  return [...shared, ...lens].join('\n')
}

export function buildEditorialLensSystemPrompt(series: EditorialSeries, voice: string, corpus: string, includeBuildLens = false): string {
  const lens = series === 'money_of_ai'
    ? [
        'THE MONEY OF AI LENS',
        'The event is never the story. Find a specific second-order effect on pricing, margins, buyer budgets, positioning, labour, distribution, corporate strategy or unit economics.',
        'A model release, funding round, benchmark, policy event or enterprise pilot is not eligible unless the candidate proves the commercial mechanism it changes.',
      ].join('\n')
    : [
        'BUILT WITH AI LENS',
        'Find a specific operating mechanism, workflow change, implementation choice, useful artifact or builder lesson.',
        'A launch announcement is not eligible merely because it names a tool or model.',
      ].join('\n')

  return [
    'You generate editorial opportunity candidates for Krish. You are not writing a finished post and you are not filling a quota.',
    'Return no_angle when the supplied evidence does not support a strong, specific candidate for this lens.',
    'Use only the supplied signal. Never invent a statistic, quotation, source, result, motive or contradiction.',
    'Be demanding about semantic meaning, audience value, novelty and proof. Content for content sake is a failure.',
    'Avoid generic advice, bossy language, marketing slogans, AI clichés, fake certainty and em dashes.',
    lens,
    includeBuildLens ? buildLensBlock(series) : '',
    voice ? `KRISH VOICE\n${voice.slice(0, 5000)}` : '',
    corpus ? `CHANNEL CORPUS\n${corpus.slice(0, 6500)}` : '',
    `Reply only with JSON: {"opportunities":[{"signal_id":"id","status":"candidate|no_angle","no_angle_reason":"required when no_angle","title":"","angle":"","audience_problem":"","why_now":"","proposed_hook":"","honest_payoff":"","mechanism":"","visual_proof":"","source_mode":"extract|short_native","production_effort":"low|medium|high","strongest_failure":"","safer_version":"","ambitious_version":"","recommended_version":"","recommendation_reason":"","credible_contradiction":"or No credible contradiction found","editorial":{"truth":true,"evidence":true,"confidentiality":true,"rights":true,"series_fit":true,"meaningful_mechanism":true},"growth":{"first_beat_tension":0,"clarity":0,"surprise":0,"payoff":0,"delivery_strength":0,"visual_proof":0,"share_save_usefulness":0,"qualified_audience_fit":0,"novelty":0}}]}. Scores are 0 to 10. Include every signal exactly once.`,
  ].filter(Boolean).join('\n\n')
}

export function buildEditorialLensUserPrompt(signals: EditorialSignalV2[]): string {
  return JSON.stringify({
    signals: signals.map((signal) => ({
      id: signal.id,
      title: signal.title,
      summary: signal.summary,
      occurred_at: signal.occurred_at,
      corroboration: signal.corroboration,
      category: signal.category,
      ...(signal.build ? { build: {
        public_name: signal.build.public_name,
        role: signal.build.role,
        mode: signal.build.mode,
        never_reveal: signal.build.never_reveal,
      } } : {}),
    })),
  })
}

function noAngle(signal: EditorialSignalV2, series: EditorialSeries, reason: string): EditorialOpportunityV2 {
  const gates = { truth: false, evidence: false, confidentiality: true, rights: true, series_fit: false, meaningful_mechanism: false }
  const growth = { first_beat_tension: 0, clarity: 0, surprise: 0, payoff: 0, delivery_strength: 0, visual_proof: 0, share_save_usefulness: 0, qualified_audience_fit: 0, novelty: 0 }
  return {
    schema_version: 2,
    series,
    signal_id: signal.id,
    status: 'no_angle',
    title: null,
    angle: null,
    audience_problem: null,
    why_now: null,
    proposed_hook: null,
    honest_payoff: null,
    mechanism: null,
    visual_proof: null,
    source_mode: null,
    production_effort: null,
    strongest_failure: reason,
    safer_version: null,
    ambitious_version: null,
    recommended_version: null,
    recommendation_reason: null,
    credible_contradiction: 'The evidence does not support a candidate strong enough to test for contradiction.',
    source_urls: signal.source_urls,
    corroboration: signal.corroboration,
    hard_blocks: [reason],
    soft_blocks: [],
    editorial: gates,
    growth,
  }
}

export function parseEditorialLensResponse(
  value: unknown,
  series: EditorialSeries,
  signals: EditorialSignalV2[],
): EditorialOpportunityV2[] {
  const root = asRecord(value)
  const rawItems = root && Array.isArray(root.opportunities) ? root.opportunities : []
  const rawById = new Map<string, JsonRecord>()
  for (const item of rawItems) {
    const record = asRecord(item)
    if (record && typeof record.signal_id === 'string' && !rawById.has(record.signal_id)) rawById.set(record.signal_id, record)
  }

  return signals.map((signal) => {
    const raw = rawById.get(signal.id)
    if (!raw) return noAngle(signal, series, 'The lens returned no grounded assessment for this signal.')
    if (raw.status === 'no_angle') {
      return noAngle(signal, series, text(raw.no_angle_reason, 500) || 'No credible angle passed this lens.')
    }

    const editorialRaw = asRecord(raw.editorial) || {}
    const growthRaw = asRecord(raw.growth) || {}
    const title = text(raw.title, 180)
    const angle = text(raw.angle, 700)
    const mechanism = text(raw.mechanism, 700)
    const editorial = {
      truth: bool(editorialRaw.truth),
      evidence: bool(editorialRaw.evidence),
      confidentiality: bool(editorialRaw.confidentiality),
      rights: bool(editorialRaw.rights),
      series_fit: bool(editorialRaw.series_fit),
      meaningful_mechanism: bool(editorialRaw.meaningful_mechanism),
    }
    const growth = {
      first_beat_tension: score(growthRaw.first_beat_tension),
      clarity: score(growthRaw.clarity),
      surprise: score(growthRaw.surprise),
      payoff: score(growthRaw.payoff),
      delivery_strength: score(growthRaw.delivery_strength),
      visual_proof: score(growthRaw.visual_proof),
      share_save_usefulness: score(growthRaw.share_save_usefulness),
      qualified_audience_fit: score(growthRaw.qualified_audience_fit),
      novelty: score(growthRaw.novelty),
    }
    const sourceMode = raw.source_mode === 'extract' || raw.source_mode === 'short_native' ? raw.source_mode : null
    const effort = raw.production_effort === 'low' || raw.production_effort === 'medium' || raw.production_effort === 'high' ? raw.production_effort : null
    const hardBlocks: string[] = []
    if (!signal.source_urls.some(validUrl)) hardBlocks.push('No public evidence URL is attached to the signal.')
    if (!editorial.truth) hardBlocks.push('Truth gate did not pass.')
    if (!editorial.evidence) hardBlocks.push('Evidence gate did not pass.')
    if (!editorial.confidentiality) hardBlocks.push('Confidentiality gate did not pass.')
    if (!editorial.rights) hardBlocks.push('Rights gate did not pass.')
    if (!editorial.series_fit) hardBlocks.push('Series fit did not pass.')
    if (!editorial.meaningful_mechanism || !mechanism) hardBlocks.push('No meaningful mechanism was established.')
    if (!title || !angle) hardBlocks.push('The candidate is missing a clear title or angle.')
    if (!text(raw.audience_problem) || !text(raw.honest_payoff) || !text(raw.proposed_hook, 240)) {
      hardBlocks.push('The candidate is missing its audience problem, hook or honest payoff.')
    }
    if (!text(raw.visual_proof) || !sourceMode || !effort) {
      hardBlocks.push('The candidate is missing a usable proof or production route.')
    }
    if (series === 'money_of_ai' && !onTeardownBeat(`${title || ''} ${angle || ''}`, mechanism)) {
      hardBlocks.push('The Money of AI candidate does not establish a second-order commercial or labour mechanism.')
    }
    if (signal.build) {
      const candidateText = [title, angle, mechanism, text(raw.proposed_hook, 240), text(raw.honest_payoff), text(raw.recommended_version), text(raw.visual_proof)].filter(Boolean).join(' ')
      if (series === 'money_of_ai' && MONEY_FIGURE.test(candidateText)) {
        hardBlocks.push('A revenue or price figure appears. The Money of AI reads a build for its pricing decision, never its numbers.')
      }
      if (signal.build.mode === 'anonymous') {
        const named = namesForbiddenTerm(candidateText, signal.build.forbidden_terms)
        if (named) hardBlocks.push(`The candidate names an anonymous build ("${named}"). Side builds are never named.`)
      }
    }

    const softBlocks: string[] = []
    if (growth.clarity < 6) softBlocks.push('Clarity is below the production bar.')
    if (growth.payoff < 6) softBlocks.push('The payoff is below the production bar.')
    if (growth.qualified_audience_fit < 6) softBlocks.push('Qualified-audience fit is below the production bar.')
    if (growth.visual_proof < 5) softBlocks.push('The visual proof is too weak for production without a stronger asset plan.')

    return {
      schema_version: 2,
      series,
      signal_id: signal.id,
      status: hardBlocks.length ? 'rejected' : softBlocks.length ? 'near_miss' : 'eligible',
      title,
      angle,
      audience_problem: text(raw.audience_problem),
      why_now: text(raw.why_now),
      proposed_hook: text(raw.proposed_hook, 240),
      honest_payoff: text(raw.honest_payoff),
      mechanism,
      visual_proof: text(raw.visual_proof),
      source_mode: sourceMode,
      production_effort: effort,
      strongest_failure: text(raw.strongest_failure, 500) || 'The candidate may still be too familiar or weakly evidenced.',
      safer_version: text(raw.safer_version),
      ambitious_version: text(raw.ambitious_version),
      recommended_version: text(raw.recommended_version),
      recommendation_reason: text(raw.recommendation_reason),
      credible_contradiction: text(raw.credible_contradiction, 500) || 'The current evidence is too thin to claim that no credible contradiction exists.',
      source_urls: [...new Set(signal.source_urls.filter(validUrl))],
      corroboration: signal.corroboration,
      hard_blocks: hardBlocks,
      soft_blocks: softBlocks,
      editorial,
      growth,
    }
  })
}
