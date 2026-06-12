import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import {
  loadConfig, materialsContext, pathId, preamble, readMaterials, sanitizeVoice,
} from '../../_content.js'

// POST /api/content-ideas/:id/save-draft
//   body: { channel?: FactoryChannel, source_text?: string }
//
// The single end CTA of the composer. It:
//   1. sanitizes the draft (em dashes gone) and saves the clean version to body,
//   2. folds the attached materials/corpus into the handoff,
//   3. auto-resolves the publish channel from the piece's lane (overridable),
//   4. fires the Omnichannel Content Factory webhook, which assembles a richly
//      formatted Google Doc into the channel's Drive folder and pings Krish on
//      Telegram (Cleo's "your draft is ready" alert),
//   5. moves the piece to `review` and stamps the save.
//
// This replaces the old "Push to Cleo" framing: same factory, but presented as
// the honest action it is — save a formatted draft to Drive, you stay the final
// word (no auto-publish; PUB-001 intact).

const FACTORY_CHANNELS = new Set([
  'techonomic', 'signal_noise', 'mindmaker_live', 'linkedin',
  'builder_economy', 'vertical_video', 'dynamic',
])

// lane (+slot) -> factory channel. Mirrors src/lib/contentEngine.ts LANES.
function laneToChannel(lane?: string | null, slot?: string | null): string {
  if (lane === 'techonomic') return 'techonomic'
  if (lane === 'signal_noise') return 'signal_noise'
  if (lane === 'mindmaker') return slot === 'field_learning' ? 'linkedin' : 'mindmaker_live'
  if (lane === 'builder_economy_ig') return 'builder_economy'
  return 'dynamic'
}

function firstLine(s?: string | null): string {
  if (!s) return ''
  return (s.split('\n').map(x => x.trim()).find(Boolean) || '').slice(0, 280)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  const id = pathId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const b = (req.body || {}) as { channel?: string; source_text?: string }

  const webhook = process.env.N8N_CONTENT_FACTORY_WEBHOOK_URL
  if (!webhook) return res.status(500).json({ ok: false, error: 'N8N_CONTENT_FACTORY_WEBHOOK_URL not configured' })

  const { data: idea, error } = await supabase
    .from('content_ideas').select('*').eq('id', id).single()
  if (error || !idea) return res.status(404).json({ ok: false, error: 'idea not found' })

  const meta = (idea.meta || {}) as any
  const materials = readMaterials(meta)

  // The draft that becomes the doc. Sanitize it (em dashes out) and persist the
  // clean version so what's saved == what's shown == what ships.
  const draftRaw = (b.source_text || idea.body || '').trim()
  if (!draftRaw) return res.status(400).json({ ok: false, error: 'nothing to save — write or expand a draft first' })
  const draft = sanitizeVoice(draftRaw)

  const channel = b.channel && FACTORY_CHANNELS.has(b.channel)
    ? b.channel
    : laneToChannel(idea.lane, idea.lane_slot)

  const hook = firstLine(draft) || idea.idea
  const contrarian = meta.contrarian || idea.thesis || idea.idea

  let audience = 'Senior operators and founders navigating AI'
  if (idea.lane) {
    const key = idea.lane_slot ? `content_lane_${idea.lane}_${idea.lane_slot}` : `content_lane_${idea.lane}`
    const cfg = await loadConfig([key, `content_lane_${idea.lane}`])
    const posture = (cfg[key]?.audience || cfg[key]?.posture || cfg[`content_lane_${idea.lane}`]?.posture)
    if (typeof posture === 'string') audience = posture.slice(0, 240)
  }

  const payload = {
    source: 'control-center',
    idea_id: id,
    target_channel: channel,
    title: idea.idea,
    hook,
    target_audience: audience,
    contrarian_angle: contrarian,
    // build ON the staged draft, not from scratch
    draft_seed: draft,
    full_draft: draft,
    // Krish's own research, so the factory grounds the doc in it and can append
    // a Sources/Background section. Trimmed to a sane size for the webhook.
    materials: materials.map(m => ({
      kind: m.kind, title: m.title || null,
      url: m.url || null,
      content: m.kind === 'link' ? null : (m.content || '').slice(0, 12000),
    })),
    materials_context: materials.length ? materialsContext(materials, 4000, 24000) : null,
    // Saving a draft IS Krish's approval to PRODUCE the doc (not to publish).
    krish_approved: true,
  }

  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      return res.status(502).json({ ok: false, error: `factory_${r.status}`, detail: t.slice(0, 200) })
    }
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) })
  }

  const saves = Array.isArray(meta.saved_drafts) ? meta.saved_drafts : []
  saves.unshift({ channel, at: new Date().toISOString() })
  const { error: upErr } = await supabase.from('content_ideas')
    .update({
      body: draft,
      meta: { ...meta, saved_drafts: saves.slice(0, 12) },
      state: idea.state === 'published' || idea.state === 'dropped' ? idea.state : 'review',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (upErr) return res.status(500).json({ ok: false, error: upErr.message })

  return res.status(200).json({ ok: true, queued: true, target_channel: channel })
}
