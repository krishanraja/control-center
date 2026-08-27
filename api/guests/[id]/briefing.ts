import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js' // .js extension MANDATORY (ESM, "type":"module")
import { researchBrief } from '../../_enrich.js'
import { callClaude } from '../../_content.js'
import { googleConfigured, createDriveDoc } from '../../_google.js'

// POST /api/guests/:id/briefing
//
// Generate-only internal Speaker Briefing prep doc (no publish; PUB-001/005 satisfied).
// Optimistically flips the guest to briefing_status='generating' (Realtime swaps the
// GuestCard button instantly), then fires the Nell Guest Speaker Briefing webhook.
//
// Idempotency: if a briefing is already 'generating' and was requested within the last
// 15 min, returns without re-firing (allow re-fire if older, or if body.force).
//
// Body: { force?: boolean }
// Response: { ok, briefing_status } | { ok:false, error }

const N8N_BRIEFING_URL =
  process.env.N8N_SPEAKER_BRIEFING_WEBHOOK_URL ||
  'https://krishraja10101.app.n8n.cloud/webhook/guest-speaker-briefing'

const AGATHA_SECRET = process.env.AGATHA_WEBHOOK_SECRET || ''

const STALE_MS = 15 * 60 * 1000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const idParam = req.query?.id
  const id = Array.isArray(idParam) ? idParam[0] : idParam
  if (!id) return res.status(400).json({ ok: false, error: 'id is required' })

  // SELECT ONLY REAL COLUMNS (no role/company/why_relevant — they do not exist on guests).
  const { data, error } = await supabase
    .from('guests')
    .select(
      'id, name, email, linkedin_url, twitter_handle, personal_url, podcast_target, ' +
        'one_liner, why_fit, notes, fit_score, status, raw_data, briefing_status, ' +
        'briefing_doc_url, briefing_requested_at, triage_reason, format',
    )
    .eq('id', id)
    .single()
  if (error || !data) return res.status(404).json({ ok: false, error: 'guest not found' })
  const g = data as any

  // Need something to research. Company is derived downstream from one_liner/raw_data, not a column.
  if (!g.name && !g.personal_url && !g.linkedin_url && !g.email) {
    return res.status(422).json({ ok: false, error: 'guest has no name/url/email to research' })
  }

  const force = !!(req.body && (req.body as { force?: unknown }).force)
  const forceDirect = !!(req.body && (req.body as { mode?: unknown }).mode === 'direct')
  const reqAt = g.briefing_requested_at ? new Date(g.briefing_requested_at).getTime() : 0
  const isStale = Date.now() - reqAt > STALE_MS
  if (g.briefing_status === 'generating' && !force && !isStale) {
    return res.status(200).json({ ok: true, already: true, briefing_status: 'generating', note: 'already in progress' })
  }

  // Optimistic flip so Realtime swaps the button to "Briefing…" instantly.
  await supabase
    .from('guests')
    .update({ briefing_status: 'generating', briefing_requested_at: new Date().toISOString() })
    .eq('id', id)

  await supabase.from('audit_log').insert({
    event_type: 'guest_briefing_requested',
    actor: 'krish',
    target: id,
    details: JSON.stringify({ name: g.name, podcast_target: g.podcast_target, force }),
  })

  // Direct (non-n8n) briefing: research the guest, write the doc with Claude, and
  // drop it in Drive. Only possible when a Google service account is configured
  // (the briefing needs a doc URL). Returns true on success.
  const tryDirect = async (): Promise<boolean> => {
    if (!googleConfigured()) return false
    try {
      const { summary } = await researchBrief({
        kind: 'person',
        name: g.name || '',
        url: g.personal_url || g.linkedin_url,
        email: g.email,
        extra: g.why_fit || g.one_liner,
      })
      const docText = await callClaude({
        agent: 'nell-guest-briefing',
        // The previous version of this prompt was one sentence, and "concise"
        // was the only length control on an unbounded free-text doc. It listed
        // five section names and asked for nothing from any of them: three
        // angles with no ranking and no reason, five questions with no idea
        // what they were for. What a host needs before a recording is not a
        // dossier, it is a running order and one thing to come away with.
        system: [
          'You write the internal prep doc a podcast host reads in the ten minutes before recording. Markdown, and nothing outside these sections.',
          '',
          '## Who they are',
          'Max 80 words. What they actually do now, and the one credential that earns the seat. No biography.',
          '',
          '## Why this show, now',
          'Max 60 words. What makes this guest worth an episode THIS month rather than any time. If nothing does, say so plainly.',
          '',
          '## Angles, best first',
          'Exactly 3, ranked, each: a bolded angle in under 12 words, then one line of why it earns its place, then one line saying what the listener gets from it that they cannot get elsewhere. Rank them honestly. Number 3 should be the one you would cut for time.',
          '',
          '## Questions',
          'Exactly 5, ordered as you would ask them. Each must be answerable only by this guest: if a question would work on any other guest in the field, replace it. No two-part questions.',
          '',
          '## Avoid',
          'Max 40 words. Ground it in the record: a topic they have said they will not discuss, a well-worn answer they give everywhere, a sensitivity. If the record shows none, write "Nothing in the record" rather than inventing a caution.',
          '',
          '## The one thing',
          'One sentence. The single thing this episode should extract that would not exist without it. This is what the episode is FOR.',
          '',
          'Grounded only in what you are given. Never invent a fact, a quote, or a position. Where the record is thin, say what to check before recording rather than filling the gap.',
        ].join('\n'),
        user: [
          `GUEST: ${g.name || ''}`,
          g.one_liner ? `One-liner: ${g.one_liner}` : '',
          g.why_fit ? `Why fit: ${g.why_fit}` : '',
          g.podcast_target ? `Show/target: ${g.podcast_target}` : '',
          g.notes ? `Notes: ${g.notes}` : '',
          // On file and previously unused: the scores are the system's own
          // judgment of whether this guest is worth the seat, and the briefing
          // was written without them.
          g.fit_score != null ? `Fit score: ${g.fit_score}/100` : '',
          g.triage_reason ? `Triage judgment: ${g.triage_reason}` : '',
          g.format ? `Format: ${g.format}` : '',
          summary ? `RESEARCH:\n${summary}` : '',
        ].filter(Boolean).join('\n'),
        maxTokens: 1800,
        temperature: 0.4,
      })
      const doc = await createDriveDoc({ name: `Speaker Briefing — ${g.name || 'Guest'}`, content: docText })
      if (!doc) return false
      await supabase.from('guests').update({ briefing_status: 'ready', briefing_doc_url: doc.url }).eq('id', id)
      return true
    } catch (e: unknown) {
      // The reason used to be discarded here, so the row landed on
      // briefing_status 'failed' with nothing anywhere saying why — a missing
      // Drive scope and a model refusal looked identical from the outside.
      await supabase.from('audit_log').insert({
        event_type: 'guest_briefing_failed',
        actor: 'system',
        target: id,
        details: JSON.stringify({ name: g.name, reason: String((e as Error)?.message || e).slice(0, 400) }),
      }).then(() => {}, () => {})
      return false
    }
  }

  // Explicit direct mode: skip n8n entirely.
  if (forceDirect) {
    if (await tryDirect()) return res.status(200).json({ ok: true, mode: 'direct', briefing_status: 'ready' })
    await supabase.from('guests').update({ briefing_status: 'failed' }).eq('id', id)
    return res.status(502).json({ ok: false, error: 'Direct briefing needs a Google service account (GOOGLE_SERVICE_ACCOUNT_*).' })
  }

  try {
    const r = await fetch(N8N_BRIEFING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AGATHA_SECRET ? { 'X-Agatha-Secret': AGATHA_SECRET } : {}),
      },
      body: JSON.stringify({
        entity_type: 'guest',
        guest_id: g.id,
        name: g.name || null,
        personal_url: g.personal_url || null,
        linkedin_url: g.linkedin_url || null,
        twitter_handle: g.twitter_handle || null,
        podcast_target: g.podcast_target, // drives tone + angle ladder
        context: g.why_fit || g.one_liner || null,
        notes: g.notes || null,
        force,
      }),
    })
    if (!r.ok) {
      // n8n rejected — try the direct path before giving up.
      if (await tryDirect()) return res.status(200).json({ ok: true, mode: 'direct', briefing_status: 'ready' })
      await supabase.from('guests').update({ briefing_status: 'failed' }).eq('id', id)
      const body = await r.text()
      return res.status(502).json({ ok: false, error: `N8N ${r.status}`, body: body.slice(0, 300) })
    }
    return res.status(200).json({ ok: true, briefing_status: 'generating' }) // fire-and-forward
  } catch (e: any) {
    if (await tryDirect()) return res.status(200).json({ ok: true, mode: 'direct', briefing_status: 'ready' })
    await supabase.from('guests').update({ briefing_status: 'failed' }).eq('id', id)
    return res.status(502).json({ ok: false, error: `N8N call failed: ${e?.message || String(e)}` })
  }
}
