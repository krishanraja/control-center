import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'
import { sanitizeVoice } from './_content.js'
import { checkDuplicate, recordDuplicateSource } from './_dedup.js'
import { embed, vectorLiteral } from './_embeddings.js'
import { canonicalUrl, titleNorm, contentHash } from './_text.js'
import { classifyRelevance, relevanceReasonCode } from './_relevance.js'

// Content ideas inbox endpoint.
//
//   POST   — quick-capture: Krish types an idea (⌘+I modal). We FIRST run the
//            tiered dedup check (canonical URL → title_norm → content_hash →
//            embedding similarity) so the same story arriving via Gmail sweep,
//            signal agents, and Cleo chat collapses to one row instead of
//            three. On a hit we append provenance to meta.duplicate_sources
//            and return the existing id. On a miss we forward to the N8N
//            `Cleo | Content Idea Capture` workflow for extraction/enrichment,
//            then fall back to a direct insert if the webhook is down.
//   PATCH  — state transitions (seeded → drafting → published, etc.) and
//            inline edits to idea/thesis/distribution/draft_link.
//
// The webhook destination is /webhook/idea-capture (one funnel for all six
// source types — manual, signal_inbox, cleo_chat, agatha_chat,
// openclaw_workspace, zara_signal).

const N8N_WEBHOOK_URL =
  process.env.N8N_IDEA_CAPTURE_URL ||
  'https://krishraja10101.app.n8n.cloud/webhook/idea-capture'

const AGATHA_SECRET = process.env.AGATHA_WEBHOOK_SECRET || ''

const ALLOWED_STATE = new Set([
  'seeded',
  'researching',
  'drafting',
  'review',
  'approved',
  'published',
  'dropped',
])

const ALLOWED_SOURCE = new Set([
  'signal_inbox',
  'cleo_chat',
  'agatha_chat',
  'openclaw_workspace',
  'zara_signal',
  'customer_voice',
  'crm_opportunity',
  'manual',
])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'POST') {
    const body = (req.body || {}) as {
      raw_text?: string
      source_type?: string
      source_ref?: string
      source_url?: string
      source_snippet?: string
    }

    const rawText = (body.raw_text || '').trim()
    if (!rawText) return res.status(400).json({ ok: false, error: 'raw_text is required' })

    const sourceType = body.source_type && ALLOWED_SOURCE.has(body.source_type)
      ? body.source_type
      : 'manual'

    // ── Dedup gate ──────────────────────────────────────────────────────────
    // Single tiered check against canonical_url / title_norm / content_hash /
    // embedding similarity. Runs BEFORE the N8N webhook so duplicates never
    // even reach extraction. On a hit we attach the new source as provenance
    // to the matched row and short-circuit with that id.
    try {
      const dedup = await checkDuplicate('content_ideas', {
        url: body.source_url || null,
        title: rawText.slice(0, 200),
        text: body.source_snippet || rawText.slice(0, 2000),
      })
      if (dedup.is_duplicate && dedup.match_id) {
        await recordDuplicateSource('content_ideas', dedup.match_id, {
          source_type: sourceType,
          source_ref: body.source_ref || null,
          source_url: body.source_url || null,
        })
        return res.json({
          ok: true,
          via: 'dedup',
          id: dedup.match_id,
          duplicate: { reason: dedup.match_reason, similarity: dedup.similarity },
        })
      }
    } catch (e) {
      // Dedup failures are non-fatal — log and continue to the normal path.
      await supabase.from('audit_log').insert({
        event_type: 'idea_capture_dedup_failure',
        actor: 'control_center_api',
        target: 'api/content-ideas',
        details: JSON.stringify({ error: String(e), raw_text_preview: rawText.slice(0, 100) }),
      })
    }

    // ── Relevance gate ─────────────────────────────────────────────────────
    // Agent-sourced cards only (Krish's own ⌘+I captures never get auto-dropped
    // at ingest). If the card classifies as off-vertical (muted vertical on its
    // own terms, no AI angle) or too-technical (low-level infra/devops with no
    // strategic angle) at high confidence, we land it already at state='dropped'
    // and write the matching feedback_queue −1 vote so Vera clusters the
    // pattern next aggregation. The dedup gate already ran above, so we won't
    // re-classify the same story on every re-ingest.
    if (sourceType !== 'manual' && process.env.ANTHROPIC_API_KEY) {
      try {
        const verdicts = await classifyRelevance(
          [{ id: 'incoming', title: rawText.slice(0, 200), text: body.source_snippet || rawText.slice(0, 800) }],
          { apiKey: process.env.ANTHROPIC_API_KEY, surface: 'content' },
        )
        const v = verdicts[0]
        if (v && v.verdict !== 'keep' && v.confidence >= 0.85) {
          const ideaText = sanitizeVoice(rawText.slice(0, 500))
          const snippetText = sanitizeVoice(body.source_snippet || rawText.slice(0, 280))
          const reasonCode = relevanceReasonCode('content', v.verdict)
          const { data: dropped, error: dropErr } = await supabase
            .from('content_ideas')
            .insert({
              idea: ideaText,
              source_type: sourceType,
              source_ref: body.source_ref || null,
              source_url: body.source_url || null,
              source_snippet: snippetText,
              source_captured_at: new Date().toISOString(),
              state: 'dropped',
              origin: 'agent',
              canonical_url: canonicalUrl(body.source_url || null),
              title_norm: titleNorm(ideaText),
              content_hash: contentHash(snippetText),
              meta: {
                auto_swept: true,
                sweep: 'ingest_gate',
                verdict: v.verdict,
                vertical: v.vertical,
                confidence: v.confidence,
                rationale: v.rationale,
              },
            })
            .select('id')
            .single()
          if (!dropErr && dropped?.id) {
            await supabase.from('feedback_queue').insert({
              source_table: 'content_ideas',
              source_id: dropped.id,
              agent_id: 'cleo',
              original_agent: 'cleo',
              original_item_id: dropped.id,
              vote: -1,
              reason_code: reasonCode,
              reason_text: v.rationale || null,
              meta: { auto_swept: true, sweep: 'ingest_gate', verdict: v.verdict, vertical: v.vertical, confidence: v.confidence },
              status: 'pending',
            })
            return res.json({
              ok: true,
              via: 'ingest_gate',
              id: dropped.id,
              auto_dropped: { reason_code: reasonCode, verdict: v.verdict, vertical: v.vertical, confidence: v.confidence },
            })
          }
        }
      } catch (e) {
        // Classifier failures are non-fatal — log and continue (fail-open: the
        // card lands on the deck for human triage instead of being auto-dropped).
        await supabase.from('audit_log').insert({
          event_type: 'idea_capture_relevance_failure',
          actor: 'control_center_api',
          target: 'api/content-ideas',
          details: JSON.stringify({ error: String(e), raw_text_preview: rawText.slice(0, 100) }),
        })
      }
    }

    // Try the N8N webhook first (extraction + enrichment — dedup already ran).
    // PR 1 hardening: if the webhook returns 200 but did not actually persist
    // an idea (no id in payload), treat as silent failure and log to
    // audit_log so we never lose visibility into broken extraction.
    try {
      const r = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(AGATHA_SECRET ? { 'X-Agatha-Secret': AGATHA_SECRET } : {}),
        },
        body: JSON.stringify({
          source_type: sourceType,
          source_ref: body.source_ref || null,
          source_url: body.source_url || null,
          source_snippet: body.source_snippet || rawText.slice(0, 280),
          raw_text: rawText,
          captured_at: new Date().toISOString(),
          origin: sourceType === 'manual' ? 'user' : 'agent',
        }),
      })
      if (r.ok) {
        const payload = await r.json().catch(() => ({}))
        const persistedId = (payload && (payload.id || (payload.idea && payload.idea.id))) || null
        if (persistedId) {
          return res.json({ ok: true, via: 'n8n', id: persistedId, idea: payload.idea || null })
        }
        await supabase.from('audit_log').insert({
          event_type: 'idea_capture_webhook_silent_failure',
          actor: 'control_center_api',
          target: 'cleo-content-idea-capture-workflow',
          details: JSON.stringify({
            status: r.status,
            payload,
            raw_text_preview: rawText.slice(0, 100),
            source_type: sourceType,
          }),
        })
      } else {
        await supabase.from('audit_log').insert({
          event_type: 'idea_capture_webhook_non_2xx',
          actor: 'control_center_api',
          target: 'cleo-content-idea-capture-workflow',
          details: JSON.stringify({
            status: r.status,
            raw_text_preview: rawText.slice(0, 100),
            source_type: sourceType,
          }),
        })
      }
    } catch (e) {
      await supabase.from('audit_log').insert({
        event_type: 'idea_capture_webhook_exception',
        actor: 'control_center_api',
        target: 'cleo-content-idea-capture-workflow',
        details: JSON.stringify({
          error: String(e),
          raw_text_preview: rawText.slice(0, 100),
          source_type: sourceType,
        }),
      })
    }

    // Fallback: direct insert with the raw text as the idea, so nothing is
    // dropped if N8N is unavailable. State stays 'seeded' so the user can
    // edit / re-trigger enrichment later.
    //
    // We populate the dedup fingerprint columns here so subsequent ingests
    // can match against this row. We deliberately re-derive the keys (rather
    // than reusing the ones from the gate above) because the gate runs on a
    // 200-char title prefix; the row stores the full normalization.
    const ideaText = sanitizeVoice(rawText.slice(0, 500))
    const snippetText = sanitizeVoice(body.source_snippet || rawText.slice(0, 280))
    const canonical_url = canonicalUrl(body.source_url || null)
    const title_norm = titleNorm(ideaText)
    const content_hash = contentHash(snippetText)

    let embedding: string | null = null
    try {
      const vec = await embed({ title: ideaText, body: snippetText })
      if (vec) embedding = vectorLiteral(vec)
    } catch { /* non-fatal */ }

    const { data, error } = await supabase
      .from('content_ideas')
      .insert({
        idea: ideaText,
        source_type: sourceType,
        source_ref: body.source_ref || null,
        source_url: body.source_url || null,
        source_snippet: snippetText,
        source_captured_at: new Date().toISOString(),
        state: 'seeded',
        confidence: 0,
        origin: sourceType === 'manual' ? 'user' : 'agent',
        canonical_url,
        title_norm,
        content_hash,
        ...(embedding ? { embedding } : {}),
      })
      .select()
      .single()

    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, via: 'fallback', idea: data })
  }

  if (req.method === 'PATCH') {
    const body = (req.body || {}) as Record<string, unknown>
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return res.status(400).json({ ok: false, error: 'id is required' })

    const updates: Record<string, unknown> = {}
    if (typeof body.idea === 'string') updates.idea = body.idea
    if (typeof body.thesis === 'string') updates.thesis = body.thesis
    if (typeof body.body === 'string') updates.body = sanitizeVoice(body.body)
    if (Array.isArray(body.distribution)) updates.distribution = body.distribution
    if (typeof body.draft_link === 'string') updates.draft_link = body.draft_link
    if (typeof body.assigned_to === 'string') updates.assigned_to = body.assigned_to
    if (typeof body.state === 'string') {
      if (!ALLOWED_STATE.has(body.state)) {
        return res.status(400).json({ ok: false, error: `invalid state: ${body.state}` })
      }
      updates.state = body.state
    }
    if (typeof body.published_url === 'string') updates.published_url = body.published_url

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: 'no updatable fields supplied' })
    }

    const { data, error } = await supabase
      .from('content_ideas')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, idea: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
