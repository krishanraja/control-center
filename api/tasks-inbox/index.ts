import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

// POST /api/tasks-inbox
//   body: { raw_text, source }
// Inserts a tasks_inbox row, fires the classifier webhook async-ish,
// returns immediately with the inbox id and a lightweight client-side
// hint about likely classification.

const N8N_WEBHOOK_ORIGIN = 'https://krishraja10101.app.n8n.cloud'
const CLASSIFY_WEBHOOK = `${N8N_WEBHOOK_ORIGIN}/webhook/idea-classify`

interface Body {
  raw_text?: string
  source?: 'control_center' | 'mobile' | 'voice' | 'telegram'
}

// Lightweight keyword preview so the UI can show an instant routing hint
// before the LLM classifier completes. Not authoritative.
function guessAgent(text: string): string {
  const t = text.toLowerCase()
  if (/\b(content|post|tweet|newsletter|substack|cleo)\b/.test(t)) return 'cleo'
  if (/\b(lead|outbound|nell|outreach)\b/.test(t))                 return 'nell'
  if (/\b(podcast|guest|booking|interview)\b/.test(t))             return 'nell'
  if (/\b(visibility|speaking|conference|cfp|nova|press)\b/.test(t)) return 'nova'
  if (/\b(customer|churn|maya|cs)\b/.test(t))                       return 'maya'
  if (/\b(bet|hypothesis|experiment)\b/.test(t))                    return 'marcus'
  if (/\b(infra|build|deploy|arlo|ops|incident)\b/.test(t))         return 'arlo'
  if (/\b(felix|sales|deal|enterprise)\b/.test(t))                  return 'felix'
  if (/\b(strategy|priya|product|roadmap)\b/.test(t))               return 'priya'
  return 'agatha'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as Body
  const raw = (body.raw_text || '').trim()
  if (!raw)                       return res.status(400).json({ ok: false, error: 'raw_text required' })
  if (raw.length > 4000)          return res.status(400).json({ ok: false, error: 'raw_text too long (>4000 chars)' })
  const source = body.source || 'control_center'
  if (!['control_center','mobile','voice','telegram'].includes(source)) {
    return res.status(400).json({ ok: false, error: 'invalid source' })
  }

  const { data, error } = await supabase
    .from('tasks_inbox')
    .insert({ raw_text: raw, source, status: 'raw' })
    .select('id')
    .single()
  if (error) return res.status(500).json({ ok: false, error: error.message })
  const id = data.id as string

  // Fire classifier webhook. Awaited so the row reaches at least the
  // 'classifying' status (or 'needs_clarification') before we return,
  // up to a generous 60s budget. Vercel default function timeout is
  // 300s; this is well inside.
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort('classify_timeout'), 60_000)
  let classified = false
  let classify_detail: string | null = null
  try {
    const r = await fetch(CLASSIFY_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inbox_id: id }),
      signal: ctrl.signal,
    })
    classified = r.ok
    classify_detail = r.ok ? null : `classify ${r.status}`
  } catch (e) {
    classify_detail = (e as Error).message || 'classify_error'
  } finally {
    clearTimeout(tid)
  }

  return res.json({
    ok: true,
    id,
    estimated_agent: guessAgent(raw),
    classified,
    classify_detail,
  })
}
