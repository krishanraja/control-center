import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkDuplicate, recordDuplicateSource, type DedupTable } from '../_dedup.js'

// POST /api/dedup/check
//
// Thin HTTP wrapper around api/_dedup.ts:checkDuplicate so N8N workflows (and
// any other external caller that has the agatha secret) can run the same
// tiered check before inserting into one of the five triage surfaces.
//
// Body:
//   {
//     table: 'content_ideas' | 'leads' | 'contacts' | 'guests' | 'visibility_targets',
//     url?:   string | null,    // canonical-identity URL (source_url / event_url / linkedin_url)
//     title?: string | null,    // headline / event title
//     text?:  string | null,    // snippet / body — used for content_hash + embedding
//     email?: string | null,
//     linkedin?: string | null,
//     record_provenance?: boolean,  // if true, append the new source to meta.duplicate_sources on the match
//     source_type?, source_ref?, source_url?  // provenance fields, only if record_provenance
//   }
//
// Response:
//   {
//     ok: true,
//     is_duplicate: boolean,
//     match_id: string | null,
//     match_reason: 'canonical_url' | 'email' | 'linkedin' | 'title_norm' | 'content_hash' | 'embedding' | null,
//     similarity: number | null,
//     keys: { ... }   // canonical keys the caller can reuse at insert
//   }
//
// Auth: requires X-Agatha-Secret header matching AGATHA_WEBHOOK_SECRET, the
// same shared secret used by the existing N8N webhook callouts.

const AGATHA_SECRET = process.env.AGATHA_WEBHOOK_SECRET || ''

const VALID_TABLES = new Set<DedupTable>([
  'content_ideas', 'leads', 'contacts', 'guests', 'visibility_targets',
])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Agatha-Secret')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  if (AGATHA_SECRET) {
    const sent = req.headers['x-agatha-secret']
    if (sent !== AGATHA_SECRET) return res.status(401).json({ ok: false, error: 'unauthorized' })
  }

  const body = (req.body || {}) as {
    table?: string
    url?: string | null
    title?: string | null
    text?: string | null
    email?: string | null
    linkedin?: string | null
    record_provenance?: boolean
    source_type?: string | null
    source_ref?: string | null
    source_url?: string | null
  }

  const table = body.table as DedupTable
  if (!table || !VALID_TABLES.has(table)) {
    return res.status(400).json({ ok: false, error: `table must be one of: ${Array.from(VALID_TABLES).join(', ')}` })
  }

  try {
    const result = await checkDuplicate(table, {
      url: body.url ?? null,
      title: body.title ?? null,
      text: body.text ?? null,
      email: body.email ?? null,
      linkedin: body.linkedin ?? null,
    })

    if (result.is_duplicate && body.record_provenance && result.match_id) {
      await recordDuplicateSource(table, result.match_id, {
        source_type: body.source_type ?? null,
        source_ref: body.source_ref ?? null,
        source_url: body.source_url ?? null,
      })
    }

    // Strip the embedding from the response — it's 1536 floats and noisy in
    // N8N logs. Callers that need it for an insert should compute it client-
    // side or via embed() directly.
    const keys = { ...result.keys, embedding: result.keys.embedding ? '[1536d vector]' : null }

    return res.json({
      ok: true,
      is_duplicate: result.is_duplicate,
      match_id: result.match_id,
      match_reason: result.match_reason,
      similarity: result.similarity,
      keys,
    })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
