import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { sanitizeVoice, preamble } from '../_content.js'
import { attachRejectSignal } from '../_rejectSignal.js'
import { recordShip } from '../_ships.js'

// GET/PATCH /api/briefs/:week  (Content Engine v2, spec §4)
//
// The brief is a first-class editable artifact (R8). Every accepted body edit
// appends to `versions` (append-only history the Composer's version rail
// renders and restores from). Writes are sanitized (no em dashes) so what is
// stored equals what ships. RLS is anon-SELECT, so all writes land here.

const EDIT_STATUSES = new Set(['ready', 'in_review', 'approved'])
const STATUS_FLOW = new Set(['ready', 'in_review', 'approved', 'sent', 'archived'])

function weekParam(req: VercelRequest): string | null {
  const w = (req.query.week || '') as string
  return /^\d{4}-W\d{2}$/.test(w) ? w : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'GET, PATCH, OPTIONS')) return
  const week = weekParam(req)
  if (!week) return res.status(400).json({ ok: false, error: 'week required (YYYY-Www)' })

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('weekly_briefs').select('*').eq('week', week).single()
    if (error || !data) return res.status(404).json({ ok: false, error: 'brief not found' })
    return res.json({ ok: true, brief: data })
  }

  if (req.method !== 'PATCH') return res.status(405).json({ ok: false, error: 'GET or PATCH only' })

  const b = (req.body || {}) as {
    body_md?: string; title?: string; status?: string
    source?: 'krish' | 'cleo' | 'engine'; restore_version?: number
    bin?: boolean; reason_code?: string; reason_text?: string
  }

  const { data: brief, error } = await supabase.from('weekly_briefs').select('*').eq('week', week).single()
  if (error || !brief) return res.status(404).json({ ok: false, error: 'brief not found' })

  const patch: Record<string, unknown> = {}
  const nowIso = new Date().toISOString()
  const versions: any[] = Array.isArray(brief.versions) ? brief.versions : []

  // Bin the brief from inside it, with a reason. The mirror image of approving:
  // approve resolves the decision card as done, bin resolves it as rejected and
  // teaches the −1 that Vera clusters by reason code. Krish asked for this after
  // opening a brief he had no appetite for and finding the only exits were Back
  // (which leaves it waiting) and Approve.
  if (b.bin) {
    if (['pushed', 'sent', 'archived'].includes(brief.status)) {
      return res.status(409).json({ ok: false, error: `brief is ${brief.status}; too late to bin it` })
    }
    const reasonCode = b.reason_code || 'content_other'
    const reasonText = (b.reason_text || '').trim() || null

    const { error: binErr } = await supabase.from('weekly_briefs')
      .update({ status: 'archived', updated_at: nowIso }).eq('id', brief.id)
    if (binErr) return res.status(500).json({ ok: false, error: binErr.message })

    const { data: decisions } = await supabase.from('content_decisions')
      .update({
        status: 'dismissed',
        resolved_at: nowIso,
        resolution: { action: 'reject', at: nowIso, reason_code: reasonCode, reason_text: reasonText, from: 'brief_editor' },
      })
      .eq('week', week).eq('kind', 'brief_review').eq('status', 'pending')
      .select('id')

    // Best-effort, exactly as in /api/content-decisions/:id: the brief is
    // already binned, so a failed learning write must not report a failed bin.
    const { data: fbRow, error: fbErr } = await supabase.from('feedback_queue').insert({
      source_table: 'content_decisions',
      source_id: decisions?.[0]?.id || brief.id,
      agent_id: 'cleo',
      original_agent: 'cleo',
      original_item_id: decisions?.[0]?.id || brief.id,
      vote: -1,
      reason_code: reasonCode,
      reason_text: reasonText,
      meta: { kind: 'brief_review', ref: brief.id, week, surface: 'brief_editor' },
      status: 'pending',
    }).select('id').single()

    // The brief's own opening is the best available description of what was
    // refused, so that is what the taste signal keeps.
    await attachRejectSignal(fbRow?.id, brief.title, (brief.body_md || '').slice(0, 1200))

    return res.json({ ok: true, binned: true, reason_code: reasonCode, taught: !fbErr })
  }

  if (typeof b.restore_version === 'number') {
    const v = versions.find(x => x?.v === b.restore_version)
    if (!v?.body_md) return res.status(400).json({ ok: false, error: 'version not found' })
    patch.body_md = v.body_md
    versions.push({ v: versions.length + 1, at: nowIso, source: 'krish', restored_from: b.restore_version, body_md: v.body_md })
    patch.versions = versions
  } else if (typeof b.body_md === 'string') {
    if (!EDIT_STATUSES.has(brief.status)) {
      return res.status(409).json({ ok: false, error: `brief is ${brief.status}; editing is closed` })
    }
    const clean = sanitizeVoice(b.body_md)
    patch.body_md = clean
    versions.push({ v: versions.length + 1, at: nowIso, source: b.source || 'krish', body_md: clean })
    patch.versions = versions.slice(-30)
    if (brief.status === 'ready') patch.status = 'in_review'
  }

  if (typeof b.title === 'string' && b.title.trim()) patch.title = sanitizeVoice(b.title.trim()).slice(0, 120)

  if (typeof b.status === 'string') {
    if (!STATUS_FLOW.has(b.status)) return res.status(400).json({ ok: false, error: 'bad status' })
    patch.status = b.status
    if (b.status === 'approved') patch.approved_at = nowIso
    if (b.status === 'sent') patch.sent_at = nowIso
  }

  if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'nothing to update' })

  const { error: upErr } = await supabase.from('weekly_briefs').update(patch).eq('id', brief.id)
  if (upErr) return res.status(500).json({ ok: false, error: upErr.message })

  // A sent brief left the machine toward readers: it is a published piece on
  // the scorecard (ADR-016). One dedup key per week, shared with push.ts, so a
  // push followed by a send counts once.
  if (patch.status === 'sent') {
    await recordShip({ channel: 'publish', description: `Weekly brief ${week}: ${String(brief.title || '').slice(0, 120)}`, dedup_key: `brief:${week}` })
  }

  // Approving the brief resolves its decision card.
  if (patch.status === 'approved') {
    await supabase.from('content_decisions')
      .update({ status: 'done', resolved_at: nowIso, resolution: { action: 'approved' } })
      .eq('week', week).eq('kind', 'brief_review').eq('status', 'pending')
  }

  return res.json({ ok: true, updated: Object.keys(patch), version: versions.length })
}
