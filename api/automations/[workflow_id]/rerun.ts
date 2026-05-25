import type { VercelRequest, VercelResponse } from '@vercel/node'

// POST /api/automations/:workflow_id/rerun
// Triggers a manual run of an N8N workflow via the N8N REST API.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const N8N_BASE = process.env.N8N_API_BASE_URL
  const N8N_KEY = process.env.N8N_API_KEY
  if (!N8N_BASE || !N8N_KEY) {
    return res.status(503).json({ ok: false, error: 'N8N_API_BASE_URL or N8N_API_KEY not configured' })
  }

  const idParam = req.query?.workflow_id
  const workflowId = Array.isArray(idParam) ? idParam[0] : idParam
  if (!workflowId) return res.status(400).json({ ok: false, error: 'workflow_id is required' })

  try {
    const r = await fetch(`${N8N_BASE}/workflows/${encodeURIComponent(workflowId)}/run`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const body = await r.text()
    if (!r.ok) return res.status(502).json({ ok: false, error: `N8N ${r.status}`, body: body.slice(0, 300) })
    try { return res.status(202).json(JSON.parse(body)) } catch { return res.status(202).json({ ok: true, raw: body }) }
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: `N8N call failed: ${e?.message || String(e)}` })
  }
}
