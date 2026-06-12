import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// Lead document ingest endpoint.
//
// The Control Center's Leads tab drag-and-drops a Google Drive file (picked
// via the Google Picker) onto this endpoint. We forward to the
// `Nell | Lead Document Ingest` N8N workflow, which downloads the doc,
// extracts structured leads via Sonnet, dedupes by email, and writes to the
// `leads` table. Postgres realtime then animates new cards into the lane.
//
// Inputs:
//   { drive_file_id: string, source_document_name?: string, source_url?: string }
// Output:
//   { ok: true, run_id?: string }

const N8N_WEBHOOK_URL =
  process.env.N8N_LEAD_DOC_INGEST_URL ||
  'https://krishraja10101.app.n8n.cloud/webhook/lead-doc-ingest'

const AGATHA_SECRET = process.env.AGATHA_WEBHOOK_SECRET || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = (req.body || {}) as {
    drive_file_id?: string
    source_document_name?: string
    source_url?: string
  }

  if (!body.drive_file_id) {
    return res.status(400).json({ ok: false, error: 'drive_file_id is required' })
  }

  // Audit row first so we have a trace even if N8N is down.
  await supabase.from('audit_log').insert({
    event_type: 'lead_doc_ingest_requested',
    actor: 'krish',
    target: body.drive_file_id,
    details: JSON.stringify({
      drive_file_id: body.drive_file_id,
      source_document_name: body.source_document_name || null,
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
        drive_file_id: body.drive_file_id,
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

    const payload = await r.json().catch(() => ({}))
    return res.json({ ok: true, run_id: payload.run_id || null })
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) })
  }
}
