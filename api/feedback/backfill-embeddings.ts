import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { guardCronRoute } from '../_auth.js'
import { embedBatch, vectorLiteral } from '../_embeddings.js'

// Give the reject predictor its history back.
//
// api/_rejectSignal.ts writes the rejected item's text and embedding onto the
// feedback row at reject time, so the signal survives the Monday purge of the
// item itself. It shipped 2026-08-06. The last feedback row was written
// 2026-07-02. So every historical reject predates the enrichment: measured
// 2026-08-20, feedback_queue.embedding is NULL on all 389 rows and
// meta->>'title' on all 389, which means reject_reason_neighbors returns
// nothing and the "Likely" chips have no history tier on any surface.
//
// The received wisdom was that this could not be repaired -- the migration that
// added the column says "ZERO of 320 coded rejects still resolve to a row that
// exists". That is true, but only of content_ideas, which the Monday purge
// hard-deletes. Checked per surface against live data:
//
//     content_ideas       209 rejects,   0 still resolve   (purged, unrecoverable)
//     leads                67 rejects,  67 still resolve
//     contacts             29 rejects,  29 still resolve
//     guests               10 rejects,  10 still resolve
//     visibility_targets    9 rejects,   9 still resolve
//
// 115 rows are recoverable, and they sit on exactly the surfaces where the
// taxonomy failed worst: lead_other alone accounts for 59 rejections. So this
// walks the rejects that still have a source row, copies its text onto the
// feedback row the way _rejectSignal would have, and embeds it.
//
// Idempotent by construction: it only ever selects rows whose embedding is
// still NULL, so a second run is a no-op and the weekly cron costs nothing once
// the backlog is drained. It also catches any row where the live enrichment
// failed (a transient OpenAI error at reject time leaves exactly this state).

/** Where each surface keeps the text worth embedding. content_ideas is absent
 *  on purpose: the purge means there is nothing left to read. */
const SOURCES: Record<string, { table: string; title: string[]; body: string[] }> = {
  leads:              { table: 'leads',              title: ['full_name', 'company'], body: ['why_relevant', 'primary_tension', 'next_step'] },
  contacts:           { table: 'contacts',           title: ['full_name', 'company'], body: ['why_them', 'hook', 'who'] },
  guests:             { table: 'guests',             title: ['name'],                 body: ['why_fit', 'one_liner', 'pitch_draft'] },
  visibility_targets: { table: 'visibility_targets', title: ['title'],                body: ['why_relevant', 'suggested_angle', 'strategic_value'] },
}

const BATCH = 50

function join(row: Record<string, any>, cols: string[], sep: string): string {
  return cols.map(c => row?.[c]).filter(v => typeof v === 'string' && v.trim()).join(sep).trim()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ ok: false, error: 'OPENAI_API_KEY not set; nothing can be embedded' })
  }

  const limit = Math.min(Number(req.query.limit) || 200, 500)
  const report: Record<string, { candidates: number; resolved: number; embedded: number }> = {}
  let embeddedTotal = 0

  for (const [surface, cfg] of Object.entries(SOURCES)) {
    // '_other' is the absence of a reason, so it can never be a prediction --
    // the same rule reject_reason_neighbors applies when it reads these rows.
    const { data: rows, error } = await supabase
      .from('feedback_queue')
      .select('id, source_id, meta')
      .eq('source_table', surface)
      .lt('vote', 0)
      .is('embedding', null)
      .not('reason_code', 'is', null)
      .not('reason_code', 'like', '%\\_other')
      .limit(limit)
    if (error || !rows?.length) {
      report[surface] = { candidates: rows?.length || 0, resolved: 0, embedded: 0 }
      continue
    }

    const ids = [...new Set(rows.map(r => r.source_id).filter(Boolean))]
    const { data: srcRows } = await supabase
      .from(cfg.table)
      .select(['id', ...cfg.title, ...cfg.body].join(','))
      .in('id', ids)
    const byId = new Map((srcRows || []).map((s: any) => [String(s.id), s]))

    const work: Array<{ id: string; title: string; body: string }> = []
    for (const r of rows) {
      const src = byId.get(String(r.source_id))
      if (!src) continue // purged, or a synthetic id. Nothing to recover.
      const title = join(src, cfg.title, ' · ')
      const body = join(src, cfg.body, '\n')
      if (!title && !body) continue
      work.push({ id: r.id, title: title.slice(0, 300), body: body.slice(0, 1200) })
    }

    let embedded = 0
    for (let i = 0; i < work.length; i += BATCH) {
      const chunk = work.slice(i, i + BATCH)
      const vecs = await embedBatch(chunk.map(w => ({ title: w.title || null, body: w.body || null })))
      for (let j = 0; j < chunk.length; j++) {
        const vec = vecs[j]
        if (!vec) continue
        const w = chunk[j]
        const prev = rows.find(r => r.id === w.id)?.meta
        const meta = { ...(prev && typeof prev === 'object' ? prev : {}), title: w.title, text: w.body }
        const { error: upErr } = await supabase
          .from('feedback_queue')
          .update({ embedding: vectorLiteral(vec), meta })
          .eq('id', w.id)
        if (!upErr) embedded++
      }
    }

    report[surface] = { candidates: rows.length, resolved: work.length, embedded }
    embeddedTotal += embedded
  }

  // content_ideas is not silently skipped: say how much is gone, because a
  // report that only counts what worked reads as full coverage.
  const { count: purged } = await supabase
    .from('feedback_queue')
    .select('id', { count: 'exact', head: true })
    .eq('source_table', 'content_ideas')
    .lt('vote', 0)
    .is('embedding', null)

  return res.json({
    ok: true,
    embedded: embeddedTotal,
    by_surface: report,
    unrecoverable: { content_ideas: purged ?? 0, why: 'the Monday purge hard-deletes these rows; their text is gone' },
  })
}
