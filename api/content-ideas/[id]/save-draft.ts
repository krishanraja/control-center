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

// Distribution surfaces a piece can be lifted to. Mirrors media_channels.
// signal_noise joined 2026-08-11 when it was demoted from venture to channel.
const MEDIA_CHANNEL_SLUGS = new Set([
  'substack', 'instagram', 'tiktok', 'youtube', 'linkedin', 'podcast',
  'signal_noise',
])

// Mirrors FactoryChannel in src/lib/contentEngine.ts. Keep the two in step.
const FACTORY_CHANNELS = new Set([
  'paid', 'built', 'linkedin', 'signal_noise',
  'vertical_video', 'dynamic',
])

// Retired channels a stored row or a stale browser tab can still send. All map
// instead of 400-ing, so a draft in flight when a brand went away still saves.
const RETIRED_CHANNELS: Record<string, string> = {
  techonomic: 'paid',
  makeyourmindup: 'paid',
  mymu: 'paid',
  mindmaker_live: 'paid',
  mymu_weekly: 'paid',
  investigation: 'paid',
  builder_economy: 'built',
  builder_economy_ig: 'built',
}

function resolveChannel(c?: string | null): string | null {
  if (!c) return null
  const mapped = RETIRED_CHANNELS[c] || c
  return FACTORY_CHANNELS.has(mapped) ? mapped : null
}

// The Final Pass decision Krish shipped with (Q14 learning loop): what Cleo
// flagged, what he accepted, what he dismissed and overrode. Logged so each
// venture's rubric can tune to his real taste over time.
interface FinalPassShip {
  venture?: string
  verdict?: string
  ran?: boolean
  accepted?: number
  dismissed?: Array<{ dimension?: string; issue?: string }>
  shipped_with_open?: Array<{ dimension?: string; issue?: string }>
  lenses_demanded?: string[]
}

// lane (+slot) -> factory channel. Mirrors src/lib/contentEngine.ts LANES.
function laneToChannel(lane?: string | null, slot?: string | null): string {
  if (lane === 'signal_noise') return 'signal_noise'
  // Both the weekly shapes and MYMU: Teardown publish to the same channel; the
  // teardown slot differs by rubric and corpus playbook, not by destination.
  if (lane === 'mindmaker') return slot === 'field_learning' ? 'linkedin' : 'makeyourmindup'
  if (lane === 'builder_economy_ig') return 'builder_economy'
  // Legacy stored lanes: both the retired brand and the value its rows were
  // re-laned to now polish into the MYMU format.
  if (lane === 'techonomic' || lane === 'mindmaker_live' || lane === 'makeyourmindup') return 'makeyourmindup'
  return 'dynamic'
}

function firstLine(s?: string | null): string {
  if (!s) return ''
  return (s.split('\n').map(x => x.trim()).find(Boolean) || '').slice(0, 280)
}

// The factory returns the Google Doc it built. Different n8n response shapes put
// the link under different keys, so probe the common ones (and any nested
// data/result envelope), preferring a real Google Docs/Drive URL.
function extractDocUrl(payload: any, depth = 0): string | null {
  if (!payload || typeof payload !== 'object' || depth > 4) return null
  const KEYS = [
    'doc_url', 'document_url', 'docUrl', 'documentUrl', 'google_doc_url', 'googleDocUrl',
    'drive_url', 'driveUrl', 'webViewLink', 'doc_link', 'url', 'link',
  ]
  const candidates: string[] = []
  for (const k of KEYS) {
    const v = payload[k]
    if (typeof v === 'string' && /^https?:\/\//.test(v)) candidates.push(v)
  }
  const google = candidates.find(u => /(docs|drive)\.google\.com/.test(u))
  if (google) return google
  if (candidates.length) return candidates[0]
  // Recurse into common envelopes.
  for (const k of ['data', 'result', 'doc', 'document', 'google_doc', 'drive', 'json', 'body']) {
    const nested = payload[k]
    const hit = extractDocUrl(nested, depth + 1)
    if (hit) return hit
  }
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  const id = pathId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const b = (req.body || {}) as {
    channel?: string; source_text?: string; final_pass?: FinalPassShip; distribution?: string[]
  }

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

  const channel = resolveChannel(b.channel) || laneToChannel(idea.lane, idea.lane_slot)

  // Distribution surfaces (venture/format/channel split, 2026-08-06). The
  // composer picks these AFTER the work; `channel` above is the production
  // target. Filtered to known channels so a stale tab cannot write junk.
  const distribution = Array.isArray(b.distribution)
    ? b.distribution.filter(d => MEDIA_CHANNEL_SLUGS.has(d))
    : null

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

  // Whatever the factory hands back — the Doc gets created either synchronously
  // (link in the response) or asynchronously (Cleo pings Telegram when ready and
  // the link lands later). Read the body once and try to lift the Doc URL.
  let docUrl: string | null = null
  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const raw = await r.text().catch(() => '')
    if (!r.ok) {
      return res.status(502).json({ ok: false, error: `factory_${r.status}`, detail: raw.slice(0, 200) })
    }
    let parsed: any = null
    try { parsed = raw ? JSON.parse(raw) : null } catch { parsed = null }
    docUrl = extractDocUrl(parsed)
    if (!docUrl && raw) {
      const m = raw.match(/https?:\/\/(?:docs|drive)\.google\.com\/[^\s"'<>)\]]+/)
      if (m) docUrl = m[0]
    }
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) })
  }

  const nowIso = new Date().toISOString()
  const saves = Array.isArray(meta.saved_drafts) ? meta.saved_drafts : []
  saves.unshift({ channel, at: nowIso, doc_url: docUrl })

  // Log the Doc on the pipeline row: draft_link powers the "Doc" button on the
  // card + calendar; factory_doc carries the publish-follow-up flag so the piece
  // keeps surfacing as "your move" until it's actually live.
  const factory_doc = {
    url: docUrl,
    channel,
    at: nowIso,
    awaiting_publish: true,
  }
  // Q14 learning loop: append the Final Pass decision (what Cleo flagged, what
  // Krish accepted, what he dismissed/overrode) so each venture's rubric can be
  // tuned to his real taste later. Capped to the last 30 ships.
  const fp = b.final_pass
  const overrides = Array.isArray(meta.final_pass_overrides) ? meta.final_pass_overrides : []
  if (fp && fp.ran) {
    overrides.unshift({
      at: nowIso,
      channel,
      venture: fp.venture || null,
      verdict: fp.verdict || null,
      accepted: fp.accepted ?? 0,
      dismissed: Array.isArray(fp.dismissed) ? fp.dismissed.slice(0, 20) : [],
      shipped_with_open: Array.isArray(fp.shipped_with_open) ? fp.shipped_with_open.slice(0, 20) : [],
      lenses_demanded: Array.isArray(fp.lenses_demanded) ? fp.lenses_demanded : [],
    })
  }

  const update: Record<string, any> = {
    body: draft,
    meta: {
      ...meta, saved_drafts: saves.slice(0, 12), factory_doc,
      ...(fp && fp.ran ? { final_pass_overrides: overrides.slice(0, 30) } : {}),
    },
    state: idea.state === 'published' || idea.state === 'dropped' ? idea.state : 'review',
    updated_at: nowIso,
  }
  if (docUrl) update.draft_link = docUrl
  // Only write distribution when the composer actually sent a selection, so a
  // caller that omits the field never silently clears an existing one.
  if (distribution) update.distribution = distribution

  const { error: upErr } = await supabase.from('content_ideas').update(update).eq('id', id)
  if (upErr) return res.status(500).json({ ok: false, error: upErr.message })

  return res.status(200).json({
    ok: true,
    queued: true,
    target_channel: channel,
    doc_url: docUrl,
    // No link in the synchronous response → the factory is assembling it and
    // will deliver via Telegram; the UI says so instead of showing a dead link.
    doc_pending: !docUrl,
  })
}

// Claude/webhook calls here can run 20-60s; raise the function ceiling above
// the short platform default so the request finishes instead of being killed
// mid-call (the cause of the composer hanging then dropping back to the draft).
export const config = { maxDuration: 60 }
