import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { loadConfig, pathId, preamble } from '../../_content.js'

// POST /api/content-ideas/:id/push-to-cleo
//   body: { target_channel: FactoryChannel, source_text?: string }
//
// Final-polish handoff (Phase 7). Fires the live Omnichannel Content Factory
// webhook (Cleo | Mindmaker OS | Omnichannel Content Factory, path
// /webhook/content-factory) which assembles a channel-specific draft, writes a
// Google Doc into the channel's Drive folder, and pings Krish on Telegram.
//
// The factory contract is { target_channel, hook, target_audience, contrarian_angle }.
// Research/diligence is fetched INSIDE the workflow per channel, so we only need
// the idea's hook/audience/angle. Webhook URL is server-side + rotatable.

// Mirrors FactoryChannel in src/lib/contentEngine.ts. Keep the two in step.
// Verified against the live workflow on 2026-08-13: `Cleo | Mindmaker OS |
// Omnichannel Content Factory` (AnhkJrJBvmohfqjJ) switches on these five and
// only these five. 'dynamic' used to be here and in the default below, and the
// factory has ZERO references to it, so every push that did not name a channel
// went straight to the fallback branch and came back as a generic draft. A
// value the other side of a wire contract does not know is not a default, it is
// a silent misroute.
const FACTORY_CHANNELS = new Set([
  'paid', 'built', 'linkedin', 'signal_noise', 'vertical_video',
])

// A stale client that still asks for a retired channel gets mapped, not
// rejected: a draft in flight when a brand went away still pushes.
const RETIRED_CHANNELS: Record<string, string> = {
  techonomic: 'paid',
  makeyourmindup: 'paid',
  mymu: 'paid',
  mindmaker_live: 'paid',
  mymu_weekly: 'paid',
  investigation: 'paid',
  builder_economy: 'built',
  builder_economy_ig: 'built',
  // Retired 2026-08-13. It was the default, and the factory has no branch for
  // it, so it resolved to whatever the fallback did. Pushes now derive the
  // channel from the piece's own format instead.
  dynamic: 'paid',
}

function firstLine(s?: string | null): string {
  if (!s) return ''
  const line = s.split('\n').map(x => x.trim()).find(Boolean) || ''
  return line.slice(0, 280)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  const id = pathId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const b = (req.body || {}) as { target_channel?: string; source_text?: string }

  const webhook = process.env.N8N_CONTENT_FACTORY_WEBHOOK_URL
  if (!webhook) return res.status(500).json({ ok: false, error: 'N8N_CONTENT_FACTORY_WEBHOOK_URL not configured' })

  const { data: idea, error } = await supabase
    .from('content_ideas').select('*').eq('id', id).single()
  if (error || !idea) return res.status(404).json({ ok: false, error: 'idea not found' })

  // Resolve the channel AFTER the idea loads, so an unspecified push derives
  // from the piece's own format rather than a placeholder the factory cannot
  // route. A Built piece pushes as 'built'; a Paid piece as 'paid'.
  const requested = b.target_channel || idea.lane_slot || 'paid'
  const channel = RETIRED_CHANNELS[requested] || requested
  if (!FACTORY_CHANNELS.has(channel)) {
    return res.status(400).json({ ok: false, error: `invalid target_channel (${[...FACTORY_CHANNELS].join('|')})` })
  }

  const meta = (idea.meta || {}) as any

  // Derive the factory payload. hook = the sharpest opening we have; the chosen
  // draft (or thesis) seeds it. contrarian_angle = the take to argue toward.
  const draft = (b.source_text || idea.body || '').trim()
  const hook = firstLine(draft) || idea.idea
  const contrarian = meta.contrarian || idea.thesis || idea.idea

  // target_audience from the lane voice config posture, when we have a lane.
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
    hook,
    target_audience: audience,
    contrarian_angle: contrarian,
    // pass the staged draft so the factory can build ON it rather than from scratch
    draft_seed: draft || null,
    // Clicking "Push to Cleo" IS Krish's approval — it produces a Google Doc draft,
    // not a publish (PUB-001 intact). The factory's "Check Krish Approved" gate
    // requires this flag, otherwise it stops before assembly.
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

  // Stamp the push so the card can show "sent to Cleo" + move to review.
  const pushes = Array.isArray(meta.cleo_pushes) ? meta.cleo_pushes : []
  pushes.unshift({ channel, at: new Date().toISOString() })
  await supabase.from('content_ideas')
    .update({
      meta: { ...meta, cleo_pushes: pushes.slice(0, 12) },
      state: idea.state === 'seeded' || idea.state === 'researching' ? 'review' : idea.state,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  return res.status(200).json({ ok: true, queued: true, target_channel: channel })
}

// Claude/webhook calls here can run 20-60s; raise the function ceiling above
// the short platform default so the request finishes instead of being killed
// mid-call (the cause of the composer hanging then dropping back to the draft).
export const config = { maxDuration: 60 }
