import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// POST /api/guests/import
//
// Forwards raw_text (or drive_file_id, when wired) to the Nell Guest Sheet
// Bulk Import n8n workflow. The workflow extracts structured guest rows via
// Sonnet 4.6 and inserts into the `guests` table. Realtime fans them into
// the Guests tab.
//
// Body: { raw_text, source_document_name? } or { drive_file_id, source_document_name?, source_url? }
// Response: { ok: true, run_id?: string }

const N8N_WEBHOOK_URL =
  process.env.N8N_GUEST_DOC_INGEST_URL ||
  'https://krishraja10101.app.n8n.cloud/webhook/guest-doc-ingest'

const AGATHA_SECRET = process.env.AGATHA_WEBHOOK_SECRET || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = (req.body || {}) as {
    raw_text?: string
    drive_file_id?: string
    source_document_name?: string
    source_url?: string
  }

  if (!body.raw_text && !body.drive_file_id) {
    return res.status(400).json({ ok: false, error: 'raw_text or drive_file_id is required' })
  }

  await supabase.from('audit_log').insert({
    event_type: 'guest_doc_ingest_requested',
    actor: 'krish',
    target: body.source_document_name || body.drive_file_id || 'paste',
    details: JSON.stringify({
      source_document_name: body.source_document_name || null,
      has_raw_text: !!body.raw_text,
      raw_text_length: body.raw_text ? body.raw_text.length : 0,
      drive_file_id: body.drive_file_id || null,
    }),
  })

  try {
    const r = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AGATHA_SECRET ? { 'X-Agatha-Secret': AGATHA_SECRET } : {}),
      },
      body: JSON.stringify({
        raw_text: body.raw_text || null,
        drive_file_id: body.drive_file_id || null,
        source_document_name: body.source_document_name || null,
        source_url: body.source_url || null,
        requested_by: 'krish',
        requested_at: new Date().toISOString(),
        origin: 'user',
      }),
    })

    if (!r.ok) {
      const text = await r.text().catch(() => '')
      return res.status(502).json({
        ok: false,
        error: 'N8N webhook returned non-2xx',
        status: r.status,
        body: text.slice(0, 500),
      })
    }

    const payload = (await r.json().catch(() => ({}))) as { run_id?: string }
    return res.json({ ok: true, run_id: payload.run_id || null })
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) })
  }
}
