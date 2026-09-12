import { createHash } from 'node:crypto'

export const HARNESS_EVENT_SURFACES = [
  'codex', 'claude-code', 'cursor', 'claude-cloud', 'perplexity',
  'github-actions', 'n8n', 'other',
] as const

export const HARNESS_EVENT_KINDS = [
  'explicit_correction', 'failure', 'missed_trigger', 'false_trigger',
  'repeated_manual_step', 'successful_pattern', 'contradiction',
] as const

export const HARNESS_EVENT_OUTCOMES = ['corrected', 'failed', 'succeeded', 'unknown'] as const
export const HARNESS_EVENT_SEVERITIES = ['low', 'medium', 'high', 'blocking'] as const
export const HARNESS_EVENT_CONFIDENCES = ['low', 'medium', 'high'] as const

type Surface = typeof HARNESS_EVENT_SURFACES[number]
type Kind = typeof HARNESS_EVENT_KINDS[number]
type Outcome = typeof HARNESS_EVENT_OUTCOMES[number]
type Severity = typeof HARNESS_EVENT_SEVERITIES[number]
type Confidence = typeof HARNESS_EVENT_CONFIDENCES[number]

export type HarnessEvent = {
  event_id: string
  schema_version: 1
  occurred_at: string
  surface: Surface
  kind: Kind
  summary: string
  evidence_ref: string
  related_skill_or_rule: string | null
  outcome: Outcome
  severity: Severity
  confidence: Confidence
  payload_sha256: string
}

type ParseResult =
  | { ok: true; event: HarnessEvent }
  | { ok: false; error: string }

const EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{16,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
  /\b(?:api[_ -]?key|access[_ -]?token|secret|password)\s*[:=]\s*[^\s,;]{8,}/i,
  /\bAuthorization\s*:\s*Bearer\s+\S+/i,
  /\b[A-Z]:\\(?:Users|Documents and Settings)\\/i,
  /\/(?:Users|home)\/[^\s/]+\//i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
]

const allowedKeys = new Set([
  'event_id', 'schema_version', 'occurred_at', 'surface', 'kind', 'summary',
  'evidence_ref', 'related_skill_or_rule', 'outcome', 'severity', 'confidence',
])

function isOneOf<T extends readonly string[]>(value: unknown, choices: T): value is T[number] {
  return typeof value === 'string' && choices.some((choice) => choice === value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function hasLikelySecret(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value))
}

export function parseHarnessEvent(input: unknown): ParseResult {
  if (!isRecord(input)) {
    return { ok: false, error: 'body_must_be_an_object' }
  }
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > 4096) {
    return { ok: false, error: 'body_too_large' }
  }
  const body = input
  const extra = Object.keys(body).filter((key) => !allowedKeys.has(key))
  if (extra.length) return { ok: false, error: `unknown_fields:${extra.sort().join(',')}` }

  const eventId = cleanString(body.event_id)
  if (!EVENT_ID.test(eventId)) return { ok: false, error: 'invalid_event_id' }
  if (body.schema_version !== 1) return { ok: false, error: 'unsupported_schema_version' }

  const occurredAt = cleanString(body.occurred_at)
  const occurredMs = Date.parse(occurredAt)
  if (!occurredAt || !Number.isFinite(occurredMs)) return { ok: false, error: 'invalid_occurred_at' }
  if (occurredMs > Date.now() + 5 * 60_000) return { ok: false, error: 'occurred_at_in_future' }

  if (!isOneOf(body.surface, HARNESS_EVENT_SURFACES)) return { ok: false, error: 'invalid_surface' }
  if (!isOneOf(body.kind, HARNESS_EVENT_KINDS)) return { ok: false, error: 'invalid_kind' }
  if (!isOneOf(body.outcome, HARNESS_EVENT_OUTCOMES)) return { ok: false, error: 'invalid_outcome' }
  if (!isOneOf(body.severity, HARNESS_EVENT_SEVERITIES)) return { ok: false, error: 'invalid_severity' }
  if (!isOneOf(body.confidence, HARNESS_EVENT_CONFIDENCES)) return { ok: false, error: 'invalid_confidence' }

  const summary = cleanString(body.summary)
  const evidenceRef = cleanString(body.evidence_ref)
  const related = body.related_skill_or_rule == null ? null : cleanString(body.related_skill_or_rule)
  if (summary.length < 12 || summary.length > 800) return { ok: false, error: 'invalid_summary_length' }
  if (evidenceRef.length < 3 || evidenceRef.length > 300) return { ok: false, error: 'invalid_evidence_ref_length' }
  if (related !== null && (!related || related.length > 160)) return { ok: false, error: 'invalid_related_skill_or_rule' }

  const text = [summary, evidenceRef, related || ''].join('\n')
  if (CONTROL.test(text)) return { ok: false, error: 'control_characters_rejected' }
  if (hasLikelySecret(text)) return { ok: false, error: 'sensitive_content_rejected' }

  const canonical: Omit<HarnessEvent, 'payload_sha256'> = {
    event_id: eventId,
    schema_version: 1,
    occurred_at: new Date(occurredMs).toISOString(),
    surface: body.surface,
    kind: body.kind,
    summary,
    evidence_ref: evidenceRef,
    related_skill_or_rule: related,
    outcome: body.outcome,
    severity: body.severity,
    confidence: body.confidence,
  }
  const payload_sha256 = createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex')
  return { ok: true, event: { ...canonical, payload_sha256 } }
}
