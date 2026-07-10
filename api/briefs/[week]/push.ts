import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { preamble, sanitizeVoice } from '../../_content.js'

// POST /api/briefs/:week/push   body: { channels: string[] }
//
// R8: one edit session, one push. For each selected channel the factory
// generates that format in its own lane voice FROM THE EDITED MASTER (the
// factory's channel prompts do the adaptation; this is not a copy-paste
// restyle), writes the Google Doc into the channel's Drive folder, and pings
// Krish once per push on Telegram (@krish_approvals_bot). Pushing IS Krish's
// approval to PRODUCE docs (never to publish; PUB-001 intact), so the brief
// must be `approved` first.

const FACTORY_CHANNELS = new Set([
  'techonomic', 'signal_noise', 'mindmaker_live', 'linkedin',
  'builder_economy', 'vertical_video', 'dynamic',
])

function extractDocUrl(payload: any, depth = 0): string | null {
  if (!payload || typeof payload !== 'object' || depth > 4) return null
  const KEYS = ['doc_url', 'document_url', 'docUrl', 'documentUrl', 'google_doc_url', 'webViewLink', 'doc_link', 'url', 'link']
  const candidates: string[] = []
  for (const k of KEYS) {
    const v = payload[k]
    if (typeof v === 'string' && /^https?:\/\//.test(v)) candidates.push(v)
  }
  const google = candidates.find(u => /(docs|drive)\.google\.com/.test(u))
  if (google) return google
  if (candidates.length) return candidates[0]
  for (const k of ['data', 'result', 'doc', 'document', 'json', 'body']) {
    const hit = extractDocUrl(payload[k], depth + 1)
    if (hit) return hit
  }
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  const week = (req.query.week || '') as string
  if (!/^\d{4}-W\d{2}$/.test(week)) return res.status(400).json({ ok: false, error: 'week required (YYYY-Www)' })

  const webhook = process.env.N8N_CONTENT_FACTORY_WEBHOOK_URL
  if (!webhook) return res.status(500).json({ ok: false, error: 'N8N_CONTENT_FACTORY_WEBHOOK_URL not configured' })

  const channels = Array.isArray((req.body || {}).channels)
    ? [...new Set((req.body.channels as string[]).filter(c => FACTORY_CHANNELS.has(c)))]
    : []
  if (!channels.length) return res.status(400).json({ ok: false, error: 'pick at least one channel' })

  const { data: brief, error } = await supabase.from('weekly_briefs').select('*').eq('week', week).single()
  if (error || !brief) return res.status(404).json({ ok: false, error: 'brief not found' })
  if (!['approved', 'pushed'].includes(brief.status)) {
    return res.status(409).json({ ok: false, error: `brief is ${brief.status}; approve it before pushing` })
  }
  const draft = sanitizeVoice(String(brief.body_md || '').trim())
  if (!draft) return res.status(400).json({ ok: false, error: 'brief has no body' })

  const sections: any = brief.sections || {}
  const hook = (draft.split('\n').map((x: string) => x.trim()).find(Boolean) || '').slice(0, 280)
  const nowIso = new Date().toISOString()

  const results: Array<{ channel: string; ok: boolean; doc_url: string | null; error?: string }> = []
  for (const channel of channels) {
    const payload = {
      source: 'control-center',
      brief_week: week,
      target_channel: channel,
      title: brief.title || `Mindmaker LIVE ${week}`,
      hook,
      target_audience: 'Business leaders making real AI decisions',
      contrarian_angle: (sections.meaning_md || '').slice(0, 400),
      draft_seed: draft,
      full_draft: draft,
      materials: (sections.headlines || []).map((h: any) => ({
        kind: 'link', title: h.headline, url: h.url, content: null,
      })),
      materials_context: null,
      krish_approved: true,
    }
    try {
      const r = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const raw = await r.text().catch(() => '')
      if (!r.ok) { results.push({ channel, ok: false, doc_url: null, error: `factory_${r.status}` }); continue }
      let parsed: any = null
      try { parsed = raw ? JSON.parse(raw) : null } catch { parsed = null }
      let docUrl = extractDocUrl(parsed)
      if (!docUrl && raw) {
        const m = raw.match(/https?:\/\/(?:docs|drive)\.google\.com\/[^\s"'<>)\]]+/)
        if (m) docUrl = m[0]
      }
      results.push({ channel, ok: true, doc_url: docUrl })
    } catch (e: any) {
      results.push({ channel, ok: false, doc_url: null, error: String(e?.message || e) })
    }
  }

  const succeeded = results.filter(r => r.ok)
  const formats = [
    ...(Array.isArray(brief.formats) ? brief.formats : []),
    ...succeeded.map(r => ({ channel: r.channel, doc_url: r.doc_url, pushed_at: nowIso })),
  ]
  const patch: Record<string, unknown> = { formats }
  if (succeeded.length) { patch.status = 'pushed'; patch.pushed_at = nowIso }
  await supabase.from('weekly_briefs').update(patch).eq('id', brief.id)

  return res.status(succeeded.length ? 200 : 502).json({
    ok: succeeded.length > 0,
    pushed: succeeded.length,
    failed: results.length - succeeded.length,
    results,
  })
}

export const config = { maxDuration: 300 }
