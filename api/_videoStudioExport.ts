import { createHash } from 'node:crypto'
import type { SeedCandidate } from './_seedSources.js'

export const VIDEO_STUDIO_SCHEMA_VERSION = 1 as const

export interface VideoStudioRadarCandidate {
  id: string
  title: string
  summary: string
  source_kind: 'public_signal' | 'owned_artifact' | 'internal_pattern'
  sensitivity: 'public' | 'owned' | 'internal_sanitized'
  occurred_at: string
  source_urls: string[]
  corroboration: number
  evidence_status: 'public_grounded' | 'owned_grounded' | 'public_evidence_required'
  category: string
  source_ref_hash: string
  provider_score?: number
}

export interface VideoStudioRadarFeed {
  schema_version: typeof VIDEO_STUDIO_SCHEMA_VERSION
  provider: 'control_center'
  provider_version: string
  generated_at: string
  source_age: number
  candidates: VideoStudioRadarCandidate[]
}

const hash = (value: string): string => createHash('sha256').update(value).digest('hex')

const compact = (value: string, max = 320): string => {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3)}...`
}

/** Conservative deterministic scrub. This is deliberately lossy: internal
 * candidates are prompts for research, not facts or publishable quotations. */
export function sanitizeInternalPattern(value: string): string {
  return compact(value
    .replace(/^(won|lost)\s+.+?\s+(?:—|-)\s+/i, '$1 because ')
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[link removed]')
    .replace(/[“"][^”"]+[”"]/g, '[quote removed]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email removed]')
    .replace(/(?:£|\$|€)\s?\d[\d,.]*(?:\s?(?:k|m|bn))?/gi, '[value removed]')
    .replace(/\b\d{2,}(?:[,.]\d+)?%?\b/g, '[number removed]')
    .replace(/\b[A-Z][A-Za-z&.'-]+(?:\s+[A-Z][A-Za-z&.'-]+)+(?:\s+(?:Ltd|Limited|Inc|LLC|PLC))?\b/g, '[name removed]')
    .replace(/\b[A-Z][A-Za-z&.'-]{2,}\b/g, '[name removed]'))
}

function titleFor(kind: SeedCandidate['kind'], summary: string): string {
  const prefix = kind === 'customer' ? 'Customer pattern' : kind === 'deal' ? 'Deal pattern' : 'Operator signal'
  const first = summary.split(/[.!?]/)[0]?.trim() || summary
  return compact(`${prefix}: ${first}`, 140)
}

export function toVideoStudioCandidate(candidate: SeedCandidate): VideoStudioRadarCandidate {
  const internal = candidate.kind === 'customer' || candidate.kind === 'deal'
  const summary = internal ? sanitizeInternalPattern(candidate.text) : compact(candidate.text)
  const sourceUrls = !internal && candidate.source_url ? [candidate.source_url] : []
  const mapped: VideoStudioRadarCandidate = {
    id: `cc:${hash(`${candidate.source_type}:${candidate.source_ref}`).slice(0, 24)}`,
    title: titleFor(candidate.kind, summary),
    summary,
    source_kind: internal ? 'internal_pattern' : 'public_signal',
    sensitivity: internal ? 'internal_sanitized' : 'public',
    occurred_at: candidate.occurred_at,
    source_urls: sourceUrls,
    corroboration: sourceUrls.length ? 1 : 0,
    evidence_status: internal ? 'public_evidence_required' : sourceUrls.length ? 'public_grounded' : 'public_evidence_required',
    category: candidate.source_type,
    source_ref_hash: hash(`${candidate.source_type}:${candidate.source_ref}`),
  }
  if (candidate.score !== null) mapped.provider_score = candidate.score
  return mapped
}

export function buildVideoStudioFeed(candidates: SeedCandidate[], now = new Date()): VideoStudioRadarFeed {
  const mapped = candidates.map(toVideoStudioCandidate)
  const newest = mapped.map((candidate) => Date.parse(candidate.occurred_at)).filter(Number.isFinite).sort((a, b) => b - a)[0]
  return {
    schema_version: VIDEO_STUDIO_SCHEMA_VERSION,
    provider: 'control_center',
    provider_version: process.env.VERCEL_GIT_COMMIT_SHA || 'development',
    generated_at: now.toISOString(),
    source_age: newest === undefined ? 0 : Math.max(0, Math.round((now.getTime() - newest) / 1000)),
    candidates: mapped,
  }
}
