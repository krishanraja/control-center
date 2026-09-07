import { createHash } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../../_auth.js'
import { EDITORIAL_RADAR_GENERATOR_REVISION, type EditorialSeries } from '../../_editorialRadar.js'
import { supabase } from '../../_supabase.js'

type JsonRecord = Record<string, unknown>

interface SourceRow {
  id: string
  idea: string
  thesis: string | null
  body: string | null
  source_type: string
  source_ref: string | null
  source_url: string | null
  source_snippet: string | null
  source_captured_at: string | null
  pillar_id: string | null
  concept_id: string | null
  meta: JsonRecord | null
  updated_at: string
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

function editorialSeries(value: unknown): EditorialSeries | null {
  return value === 'money_of_ai' || value === 'built_with_ai' ? value : null
}

function routeId(sourceId: string, series: EditorialSeries, sourceHash: string): string {
  const hex = createHash('sha256').update(`editorial-route-v1:${sourceId}:${series}:${sourceHash}`).digest('hex').slice(0, 32).split('')
  hex[12] = '5'
  hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16], 16) % 4]
  const value = hex.join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

function routeText(candidate: JsonRecord, key: string): string | null {
  const value = candidate[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function conceptSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 54)
}

async function writeDecision(
  source: SourceRow,
  series: EditorialSeries,
  decision: JsonRecord,
  expectedSourceHash: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = attempt === 0
      ? source
      : ((await supabase.from('content_ideas').select('id,meta,updated_at').eq('id', source.id).single()).data as SourceRow | null)
    if (!current) return false
    const meta = record(current.meta)
    const radar = record(meta.editorial_radar)
    if (radar.source_hash !== expectedSourceHash || radar.generator_revision !== EDITORIAL_RADAR_GENERATOR_REVISION) return false
    const decisions = record(radar.decisions)
    const nextMeta = {
      ...meta,
      editorial_radar: {
        ...radar,
        decisions: { ...decisions, [series]: decision },
      },
    }
    const changedAt = new Date().toISOString()
    const result = await supabase.from('content_ideas')
      .update({ meta: nextMeta, updated_at: changedAt })
      .eq('id', source.id)
      .eq('updated_at', current.updated_at)
      .select('id')
    if (result.error) throw new Error(`editorial_decision_write_failed:${result.error.message}`)
    if ((result.data || []).length === 1) return true
  }
  return false
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['POST'])) return

  const id = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id
  const payload = record(req.body)
  const action = payload.action === 'approve' || payload.action === 'pass' ? payload.action : null
  const series = editorialSeries(payload.series)
  const overrideReason = typeof payload.override_reason === 'string' ? payload.override_reason.trim() : ''
  if (!id || !action || !series) return res.status(400).json({ ok: false, error: 'id, action and supported series are required' })

  const read = await supabase.from('content_ideas')
    .select('id,idea,thesis,body,source_type,source_ref,source_url,source_snippet,source_captured_at,pillar_id,concept_id,meta,updated_at')
    .eq('id', id)
    .single()
  if (read.error || !read.data) return res.status(404).json({ ok: false, error: 'source_not_found' })
  const source = read.data as SourceRow
  const meta = record(source.meta)
  const radar = record(meta.editorial_radar)
  const lenses = record(radar.lenses)
  const candidate = record(lenses[series])
  const sourceHash = typeof radar.source_hash === 'string' ? radar.source_hash : ''

  if (radar.schema_version !== 2 || radar.generator_revision !== EDITORIAL_RADAR_GENERATOR_REVISION || !sourceHash) {
    return res.status(409).json({ ok: false, error: 'editorial_assessment_is_stale_or_unsupported' })
  }
  if (candidate.schema_version !== 2 || candidate.series !== series || candidate.signal_id !== source.id) {
    return res.status(409).json({ ok: false, error: 'editorial_assessment_missing' })
  }

  const status = candidate.status
  const hardBlocks = strings(candidate.hard_blocks)
  if (action === 'approve') {
    if (status === 'rejected' || status === 'no_angle' || hardBlocks.length) {
      return res.status(409).json({ ok: false, error: 'hard_editorial_gate_failed' })
    }
    if (status !== 'eligible' && status !== 'near_miss') {
      return res.status(409).json({ ok: false, error: 'editorial_assessment_not_approvable' })
    }
    if (status === 'near_miss' && overrideReason.length < 8) {
      return res.status(400).json({ ok: false, error: 'override_reason_required' })
    }
  }

  const now = new Date().toISOString()
  if (action === 'pass') {
    const saved = await writeDecision(source, series, {
      status: 'passed',
      decided_at: now,
      decided_by: 'krish',
      source_hash: sourceHash,
    }, sourceHash)
    if (!saved) return res.status(409).json({ ok: false, error: 'source_changed_retry' })
    return res.status(200).json({ ok: true, action: 'pass' })
  }

  const childId = routeId(source.id, series, sourceHash)
  const title = routeText(candidate, 'title') || routeText(candidate, 'angle') || source.idea
  const thesis = routeText(candidate, 'recommended_version') || routeText(candidate, 'angle') || source.thesis
  const sourceUrls = strings(candidate.source_urls)
  const research = [
    routeText(candidate, 'why_now'),
    routeText(candidate, 'audience_problem'),
    routeText(candidate, 'mechanism'),
    routeText(candidate, 'honest_payoff'),
  ].filter((value): value is string => Boolean(value))
  const slot = series
  const child = {
    id: childId,
    idea: title,
    thesis,
    body: null,
    lane: 'publication',
    lane_slot: slot,
    state: 'researching',
    origin: 'user',
    horizon: 'evergreen',
    protected_at: now,
    source_type: source.source_type,
    source_ref: source.source_ref,
    source_url: sourceUrls[0] || source.source_url,
    source_snippet: source.source_snippet,
    source_captured_at: source.source_captured_at,
    pillar_id: source.pillar_id,
    parent_idea_id: source.id,
    related_idea_ids: [source.id],
    distribution: [],
    concept_id: `concept:content:publication:${series}:${conceptSlug(title)}-${source.id.slice(0, 8)}`,
    meta: {
      generated_by: 'editorial_radar',
      transformed_from: source.id,
      research,
      sources: sourceUrls,
      visual_suggestion: routeText(candidate, 'visual_proof'),
      editorial_route: {
        schema_version: 1,
        approved_at: now,
        approved_by: 'krish',
        source_id: source.id,
        source_hash: sourceHash,
        generator_revision: EDITORIAL_RADAR_GENERATOR_REVISION,
        series,
        candidate,
        override_reason: overrideReason || null,
      },
    },
  }

  let created = false
  const existing = await supabase.from('content_ideas').select('id').eq('id', childId).maybeSingle()
  if (existing.error) return res.status(500).json({ ok: false, error: 'editorial_route_lookup_failed' })
  if (!existing.data) {
    const inserted = await supabase.from('content_ideas').insert(child).select('id').single()
    if (inserted.error && inserted.error.code !== '23505') {
      console.error('editorial route insert failed', inserted.error)
      return res.status(500).json({ ok: false, error: 'editorial_route_create_failed' })
    }
    created = !inserted.error
  }

  const saved = await writeDecision(source, series, {
    status: 'approved',
    decided_at: now,
    decided_by: 'krish',
    child_id: childId,
    source_hash: sourceHash,
    override_reason: overrideReason || null,
  }, sourceHash)
  if (!saved) return res.status(409).json({ ok: false, error: 'source_changed_route_created', idea_id: childId })

  return res.status(created ? 201 : 200).json({ ok: true, action: 'approve', idea_id: childId, created })
}
