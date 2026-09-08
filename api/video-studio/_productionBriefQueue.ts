import { createHash, timingSafeEqual } from 'node:crypto'
import {
  jsonRecord,
  normalizeProductionFormat,
  productionBriefHash,
  type ProductionSeries,
  type ProductionBriefV1,
} from '../_productionBrief.js'

export const PRODUCTION_BRIEF_LEASE_STATUSES = ['ready_for_studio', 'leased'] as const
export const PRODUCTION_BRIEF_RESULT_STATUSES = ['imported', 'awaiting_source_bundle', 'failed'] as const
export type ProductionBriefResultStatus = typeof PRODUCTION_BRIEF_RESULT_STATUSES[number]

export interface StoredProductionBriefEnvelope {
  brief: ProductionBriefV1
  brief_hash: string
  status: string
  requested_by: 'Krish'
  created_at: string
  lease?: {
    runner_id_hash: string
    token_hash: string
    software_commit: string
    claimed_at: string
    expires_at: string
  }
  completed_at?: string
  job_id?: string
  safe_code?: string
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function stringArray(value: unknown, limit: number): value is string[] {
  return Array.isArray(value) && value.length <= limit && value.every(item => typeof item === 'string')
}

/**
 * A fail-closed projection of the editorial handoff. The Studio validates the
 * same object with Zod; this boundary prevents a malformed JSONB value from
 * being returned over the runner credential before it reaches that validator.
 */
export function readProductionBrief(value: unknown): ProductionBriefV1 | null {
  const brief = jsonRecord(value)
  const content = jsonRecord(brief.content)
  const hardGates = jsonRecord(brief.hard_gates)
  const approval = jsonRecord(brief.editorial_approval)
  if (
    brief.schema_version !== 1
    || typeof brief.brief_id !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,95}$/i.test(brief.brief_id)
    || typeof brief.content_idea_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(brief.content_idea_id)
    || !isSha256(brief.content_revision_hash)
    || !['money_of_ai', 'built_with_ai'].includes(String(brief.series || ''))
    || (brief.editorial_format !== undefined && normalizeProductionFormat(brief.editorial_format, brief.series as ProductionSeries) !== brief.editorial_format)
    || !Array.isArray(brief.production_kinds) || brief.production_kinds.length < 1 || brief.production_kinds.length > 2
    || new Set(brief.production_kinds).size !== brief.production_kinds.length
    || brief.production_kinds.some(kind => !['video', 'carousel'].includes(String(kind)))
    || !['extract', 'solo', 'short_native', 'written'].includes(String(brief.source_mode || ''))
    || typeof content.title !== 'string' || content.title.length < 1 || content.title.length > 220
    || typeof content.thesis !== 'string' || content.thesis.length < 12 || content.thesis.length > 1600
    || typeof content.approved_text !== 'string' || content.approved_text.length < 12 || content.approved_text.length > 30_000
    || typeof content.audience !== 'string' || content.audience.length < 3 || content.audience.length > 600
    || typeof content.intended_payoff !== 'string' || content.intended_payoff.length < 12 || content.intended_payoff.length > 1200
    || !Array.isArray(brief.claims) || brief.claims.length > 64
    || !Array.isArray(brief.visual_opportunities) || brief.visual_opportunities.length > 64
    || hardGates.truth !== 'passed' || hardGates.rights !== 'passed'
    || hardGates.confidentiality !== 'passed' || hardGates.meaning !== 'passed' || hardGates.naming !== 'passed'
    || approval.approved_by !== 'Krish' || !validDate(approval.approved_at)
    || approval.approval_revision_hash !== brief.content_revision_hash
  ) return null
  for (const item of brief.claims) {
    const claim = jsonRecord(item)
    if (
      typeof claim.claim_id !== 'string'
      || typeof claim.text !== 'string' || claim.text.length < 1 || claim.text.length > 1200
      || !stringArray(claim.evidence_urls, 16)
      || !['verified', 'human_required'].includes(String(claim.verification || ''))
      || typeof claim.approved_case_material !== 'boolean'
    ) return null
  }
  for (const item of brief.visual_opportunities) {
    const visual = jsonRecord(item)
    if (
      typeof visual.opportunity_id !== 'string'
      || typeof visual.description !== 'string' || visual.description.length < 3 || visual.description.length > 1200
      || !['evidence', 'owned_artifact', 'illustration', 'texture'].includes(String(visual.proof_role || ''))
      || !stringArray(visual.source_urls, 16)
    ) return null
  }
  if (brief.production_kinds.includes('video') && brief.source_mode === 'written') return null
  return brief as unknown as ProductionBriefV1
}

export function readProductionBriefEnvelope(value: unknown): StoredProductionBriefEnvelope | null {
  const raw = jsonRecord(value)
  const brief = readProductionBrief(raw.brief)
  if (!brief || raw.requested_by !== 'Krish' || !validDate(raw.created_at) || typeof raw.status !== 'string') return null
  const expectedHash = productionBriefHash(brief)
  const briefHash = raw.brief_hash === undefined ? expectedHash : raw.brief_hash
  if (briefHash !== expectedHash) return null
  const envelope: StoredProductionBriefEnvelope = {
    brief,
    brief_hash: expectedHash,
    status: raw.status,
    requested_by: 'Krish',
    created_at: raw.created_at,
  }
  if (raw.lease !== undefined) {
    const lease = jsonRecord(raw.lease)
    if (!isSha256(lease.runner_id_hash) || !isSha256(lease.token_hash)
      || !/^(?:[a-f0-9]{40}|unknown)$/.test(String(lease.software_commit || ''))
      || !validDate(lease.claimed_at) || !validDate(lease.expires_at)) return null
    envelope.lease = lease as unknown as StoredProductionBriefEnvelope['lease']
  }
  if (validDate(raw.completed_at)) envelope.completed_at = raw.completed_at
  if (typeof raw.job_id === 'string' && /^[a-z0-9][a-z0-9_-]{5,80}$/i.test(raw.job_id)) envelope.job_id = raw.job_id
  if (typeof raw.safe_code === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(raw.safe_code)) envelope.safe_code = raw.safe_code
  return envelope
}

export function productionBriefCanBeClaimed(envelope: StoredProductionBriefEnvelope, now: Date): boolean {
  if (envelope.status === 'ready_for_studio') return true
  return envelope.status === 'leased'
    && Boolean(envelope.lease)
    && Date.parse(envelope.lease!.expires_at) <= now.getTime()
}

export function hashLeaseToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function leaseTokenMatches(expectedHash: string, suppliedToken: string): boolean {
  const actual = hashLeaseToken(suppliedToken)
  const left = Buffer.from(expectedHash, 'hex')
  const right = Buffer.from(actual, 'hex')
  return left.length === right.length && timingSafeEqual(Uint8Array.from(left), Uint8Array.from(right))
}
