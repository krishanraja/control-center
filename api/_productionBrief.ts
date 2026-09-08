import { createHash } from 'node:crypto'

export const PRODUCTION_BRIEF_SCHEMA_VERSION = 1 as const
export const PRODUCTION_KIND_VALUES = ['video', 'carousel'] as const
export const PRODUCTION_SOURCE_MODE_VALUES = ['extract', 'solo', 'short_native', 'written'] as const
export const PRODUCTION_FORMATS_BY_SERIES = {
  money_of_ai: ['money_trace', 'artifact', 'verdict', 'cold_open_cutdown'],
  built_with_ai: ['builder_conversation', 'build_itself', 'third_why', 'first_version'],
} as const

export type ProductionKind = typeof PRODUCTION_KIND_VALUES[number]
export type ProductionSourceMode = typeof PRODUCTION_SOURCE_MODE_VALUES[number]
export type ProductionSeries = 'money_of_ai' | 'built_with_ai'
export type ProductionFormat = typeof PRODUCTION_FORMATS_BY_SERIES[ProductionSeries][number]

type JsonRecord = Record<string, unknown>

export interface ContentRevisionInput {
  idea: string
  thesis: string | null
  body: string | null
  lane: string | null
  lane_slot: string | null
}

export interface ProductionApprovalV1 {
  schema_version: 1
  approved_by: 'Krish'
  approved_at: string
  content_revision_hash: string
}

export interface ProductionBriefV1 {
  schema_version: 1
  brief_id: string
  content_idea_id: string
  content_revision_hash: string
  series: ProductionSeries
  editorial_format?: ProductionFormat
  production_kinds: ProductionKind[]
  source_mode: ProductionSourceMode
  content: {
    title: string
    thesis: string
    approved_text: string
    audience: string
    intended_payoff: string
  }
  claims: Array<{
    claim_id: string
    text: string
    evidence_urls: string[]
    verification: 'verified' | 'human_required'
    approved_case_material: boolean
  }>
  visual_opportunities: Array<{
    opportunity_id: string
    description: string
    proof_role: 'evidence' | 'owned_artifact' | 'illustration' | 'texture'
    source_urls: string[]
  }>
  hard_gates: {
    truth: 'passed'
    rights: 'passed'
    confidentiality: 'passed'
    meaning: 'passed'
    naming: 'passed'
  }
  editorial_approval: {
    approved_by: 'Krish'
    approved_at: string
    approval_revision_hash: string
  }
}

export function jsonRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function normalizedText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : ''
}

function validUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function uniqueUrls(...values: unknown[]): string[] {
  return [...new Set(values.flatMap(value => Array.isArray(value) ? value : [value]).filter(validUrl))]
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableNormalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableNormalize(child)]),
    )
  }
  return value
}

export function productionBriefHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stableNormalize(value))).digest('hex')
}

/**
 * The exact editorial revision that an approval and every downstream output
 * bind to. Deliberately excludes timestamps, workflow state and generated
 * derivatives: those can change without changing the approved argument.
 */
export function contentRevisionHash(input: ContentRevisionInput): string {
  return hash({
    schema_version: 1,
    title: normalizedText(input.idea),
    thesis: normalizedText(input.thesis),
    approved_text: normalizedText(input.body),
    lane: normalizedText(input.lane),
    lane_slot: normalizedText(input.lane_slot),
  })
}

export function productionSeries(input: Pick<ContentRevisionInput, 'lane' | 'lane_slot'>): ProductionSeries | null {
  if (input.lane !== 'publication') return null
  return input.lane_slot === 'money_of_ai' || input.lane_slot === 'built_with_ai' ? input.lane_slot : null
}

export function createProductionApproval(input: ContentRevisionInput, approvedAt: string): ProductionApprovalV1 {
  return {
    schema_version: 1,
    approved_by: 'Krish',
    approved_at: approvedAt,
    content_revision_hash: contentRevisionHash(input),
  }
}

export function readProductionApproval(value: unknown): ProductionApprovalV1 | null {
  const record = jsonRecord(value)
  return record.schema_version === 1
    && record.approved_by === 'Krish'
    && typeof record.approved_at === 'string'
    && !Number.isNaN(Date.parse(record.approved_at))
    && typeof record.content_revision_hash === 'string'
    && /^[a-f0-9]{64}$/.test(record.content_revision_hash)
    ? record as unknown as ProductionApprovalV1
    : null
}

function textFrom(record: JsonRecord, key: string, fallback = ''): string {
  return normalizedText(record[key]) || fallback
}

function identifier(prefix: string, value: unknown): string {
  return `${prefix}_${hash(value).slice(0, 24)}`
}

export function normalizeProductionKinds(value: unknown): ProductionKind[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) return null
  const kinds = value.filter((item): item is ProductionKind => PRODUCTION_KIND_VALUES.includes(item as ProductionKind))
  return kinds.length === value.length && new Set(kinds).size === kinds.length ? kinds : null
}

export function normalizeProductionSourceMode(value: unknown): ProductionSourceMode | null {
  return PRODUCTION_SOURCE_MODE_VALUES.includes(value as ProductionSourceMode) ? value as ProductionSourceMode : null
}

export function normalizeProductionFormat(value: unknown, series: ProductionSeries): ProductionFormat | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  const aliases: Record<string, ProductionFormat> = {
    'money trace': 'money_trace',
    'the money trace': 'money_trace',
    artifact: 'artifact',
    'the artifact': 'artifact',
    teardown: 'artifact',
    'the teardown': 'artifact',
    verdict: 'verdict',
    'the verdict': 'verdict',
    'cold open cutdown': 'cold_open_cutdown',
    'builder conversation': 'builder_conversation',
    'the builder conversation': 'builder_conversation',
    'build itself': 'build_itself',
    'the build itself': 'build_itself',
    'third why': 'third_why',
    'the third why': 'third_why',
    'first version': 'first_version',
  }
  const format = aliases[normalized]
  return format && (PRODUCTION_FORMATS_BY_SERIES[series] as readonly string[]).includes(format) ? format : null
}

export function buildProductionBrief(input: {
  row: ContentRevisionInput & { id: string; source_url?: string | null; meta?: JsonRecord | null }
  approval: ProductionApprovalV1
  productionKinds: ProductionKind[]
  sourceMode: ProductionSourceMode
  editorialFormat: ProductionFormat
}): ProductionBriefV1 {
  const { row, approval, productionKinds, sourceMode, editorialFormat } = input
  const series = productionSeries(row)
  if (!series) throw new Error('canonical_series_required')
  const revisionHash = contentRevisionHash(row)
  if (approval.content_revision_hash !== revisionHash) throw new Error('approved_revision_changed')
  if (productionKinds.includes('video') && sourceMode === 'written') throw new Error('video_source_mode_required')
  if (!(PRODUCTION_FORMATS_BY_SERIES[series] as readonly string[]).includes(editorialFormat)) throw new Error('canonical_editorial_format_required')

  const meta = jsonRecord(row.meta)
  const route = jsonRecord(meta.editorial_route)
  const candidate = jsonRecord(route.candidate)
  const sourceUrls = uniqueUrls(candidate.source_urls, meta.sources, row.source_url)
  const thesis = normalizedText(row.thesis) || normalizedText(row.body).split(/\n\n+/)[0] || normalizedText(row.idea)
  const audience = textFrom(candidate, 'audience_problem', series === 'money_of_ai'
    ? 'Enterprise leaders making commercial decisions about AI'
    : 'AI-native operators and builders deciding how to work')
  const payoff = textFrom(candidate, 'honest_payoff', thesis)
  const visual = textFrom(candidate, 'visual_proof', textFrom(meta, 'visual_suggestion'))

  const briefIdentity = {
    content_idea_id: row.id,
    content_revision_hash: revisionHash,
    production_kinds: [...productionKinds].sort(),
    source_mode: sourceMode,
    editorial_format: editorialFormat,
  }

  return {
    schema_version: PRODUCTION_BRIEF_SCHEMA_VERSION,
    brief_id: identifier('brief', briefIdentity),
    content_idea_id: row.id,
    content_revision_hash: revisionHash,
    series,
    editorial_format: editorialFormat,
    production_kinds: productionKinds,
    source_mode: sourceMode,
    content: {
      title: normalizedText(row.idea).slice(0, 220),
      thesis: thesis.slice(0, 1600),
      approved_text: normalizedText(row.body).slice(0, 30_000),
      audience: audience.slice(0, 600),
      intended_payoff: payoff.slice(0, 1200),
    },
    claims: [{
      claim_id: identifier('claim', { revisionHash, thesis }),
      text: thesis.slice(0, 1200),
      evidence_urls: sourceUrls.slice(0, 16),
      // URLs are evidence to inspect, not proof that the editorial claim has
      // already been human-verified. Studio keeps the consequential-claim gate.
      verification: 'human_required',
      approved_case_material: false,
    }],
    visual_opportunities: visual ? [{
      opportunity_id: identifier('visual', { revisionHash, visual }),
      description: visual.slice(0, 1200),
      proof_role: sourceUrls.length ? 'evidence' : 'illustration',
      source_urls: sourceUrls.slice(0, 16),
    }] : [],
    hard_gates: {
      truth: 'passed',
      rights: 'passed',
      confidentiality: 'passed',
      meaning: 'passed',
      naming: 'passed',
    },
    editorial_approval: {
      approved_by: 'Krish',
      approved_at: approval.approved_at,
      approval_revision_hash: revisionHash,
    },
  }
}
