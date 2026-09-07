import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../../_auth.js'
import {
  buildProductionBrief,
  contentRevisionHash,
  jsonRecord,
  normalizeProductionKinds,
  normalizeProductionSourceMode,
  productionBriefHash,
  productionSeries,
  readProductionApproval,
} from '../../_productionBrief.js'
import { supabase } from '../../_supabase.js'

interface ContentRow {
  id: string
  idea: string
  thesis: string | null
  body: string | null
  lane: string | null
  lane_slot: string | null
  state: string
  source_url: string | null
  meta: Record<string, unknown> | null
  transformed_outputs: Record<string, unknown> | null
  updated_at: string
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['POST'])) return
  const id = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id
  if (!id) return res.status(400).json({ ok: false, error: 'id_required' })

  const payload = jsonRecord(req.body)
  const productionKinds = normalizeProductionKinds(payload.production_kinds)
  const sourceMode = normalizeProductionSourceMode(payload.source_mode)
  if (!productionKinds || !sourceMode) {
    return res.status(400).json({ ok: false, error: 'supported_production_kinds_and_source_mode_required' })
  }
  if (payload.confirm_hard_gates !== true) {
    return res.status(409).json({ ok: false, error: 'hard_gate_confirmation_required' })
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const read = await supabase.from('content_ideas')
      .select('id,idea,thesis,body,lane,lane_slot,state,source_url,meta,transformed_outputs,updated_at')
      .eq('id', id)
      .single()
    if (read.error || !read.data) return res.status(404).json({ ok: false, error: 'idea_not_found' })
    const row = read.data as ContentRow

    if (row.state !== 'approved') return res.status(409).json({ ok: false, error: 'exact_revision_not_approved' })
    if (!row.body?.trim() || row.body.trim().length < 12) return res.status(409).json({ ok: false, error: 'approved_content_missing' })
    if (!productionSeries(row)) return res.status(409).json({ ok: false, error: 'canonical_series_required' })
    if (productionKinds.includes('video') && sourceMode === 'written') {
      return res.status(400).json({ ok: false, error: 'video_source_mode_required' })
    }

    const meta = jsonRecord(row.meta)
    const approval = readProductionApproval(meta.production_approval)
    if (!approval || approval.content_revision_hash !== contentRevisionHash(row)) {
      return res.status(409).json({ ok: false, error: 'exact_revision_not_approved' })
    }

    // A previously rejected radar route cannot be converted into a production
    // brief by ticking the human confirmation box. Manual ideas have no route
    // object and rely on Krish's explicit five-gate confirmation above.
    const route = jsonRecord(meta.editorial_route)
    const candidate = jsonRecord(route.candidate)
    const hardBlocks = strings(candidate.hard_blocks)
    if (candidate.status === 'rejected' || candidate.status === 'no_angle' || hardBlocks.length) {
      return res.status(409).json({ ok: false, error: 'hard_editorial_gate_failed', hard_blocks: hardBlocks })
    }

    let brief
    try {
      brief = buildProductionBrief({ row, approval, productionKinds, sourceMode })
    } catch (error) {
      return res.status(409).json({ ok: false, error: (error as Error).message })
    }

    const outputs = jsonRecord(row.transformed_outputs)
    const existingBriefs = jsonRecord(outputs.production_briefs)
    const existing = jsonRecord(existingBriefs[brief.brief_id])
    if (jsonRecord(existing.brief).content_revision_hash === brief.content_revision_hash) {
      return res.status(200).json({ ok: true, created: false, status: existing.status || 'ready_for_studio', brief })
    }

    const createdAt = new Date().toISOString()
    const briefHash = productionBriefHash(brief)
    const nextOutputs = {
      ...outputs,
      production_briefs: {
        ...existingBriefs,
        [brief.brief_id]: {
          brief,
          brief_hash: briefHash,
          status: 'ready_for_studio',
          requested_by: 'Krish',
          created_at: createdAt,
        },
      },
    }
    const write = await supabase.from('content_ideas')
      .update({ transformed_outputs: nextOutputs, updated_at: createdAt })
      .eq('id', id)
      .eq('updated_at', row.updated_at)
      .select('id')
    if (write.error) return res.status(500).json({ ok: false, error: 'production_brief_write_failed' })
    if ((write.data || []).length === 1) return res.status(201).json({ ok: true, created: true, status: 'ready_for_studio', brief })
  }

  return res.status(409).json({ ok: false, error: 'content_changed_retry' })
}
