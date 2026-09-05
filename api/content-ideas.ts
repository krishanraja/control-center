import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'
import { callClaude, robustJson, sanitizeVoice } from './_content.js'
import { checkDuplicate, recordDuplicateSource } from './_dedup.js'
import { embed, vectorLiteral } from './_embeddings.js'
import { canonicalUrl, titleNorm, contentHash } from './_text.js'
import { classifyRelevance, relevanceReasonCode } from './_relevance.js'
import { SYNTHESIS_MODEL } from './_models.js'
import { recordShip } from './_ships.js'

// Content ideas inbox endpoint.
//
//   POST   — quick-capture: Krish types an idea (⌘+I modal). We FIRST run the
//            tiered dedup check (canonical URL → title_norm → content_hash →
//            embedding similarity) so the same story arriving via Gmail sweep,
//            signal agents, and Cleo chat collapses to one row instead of
//            three. On a hit we append provenance to meta.duplicate_sources
//            and return the existing id. On a miss we enrich in-process
//            (thesis, distribution, confidence) and insert once.
//   PATCH  — state transitions (seeded → drafting → published, etc.) and
//            inline edits to idea/thesis/distribution/draft_link.
//
// One funnel for all six source types: manual, signal_inbox, cleo_chat,
// agatha_chat, openclaw_workspace, zara_signal.

// The live distribution channels, mirroring media_channels where active=true
// and MEDIA_CHANNELS in src/lib/contentEngine.ts. TikTok is absent on purpose:
// it has no voice register, so nothing can be produced for it.
const CAPTURE_CHANNELS = ['substack', 'linkedin', 'instagram', 'youtube', 'podcast', 'signal_noise']

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
  'lens_radar',
  'manual',
  'creator_move',
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
    // embedding similarity. Runs BEFORE enrichment so duplicates never
    // reach a model call. On a hit we attach the new source as provenance
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

    // Enrich HERE, in one pass, then insert once.
    //
    // This used to POST to the `Cleo | Content Idea Capture` n8n workflow and
    // fall back to a plain insert when that failed. It always failed. The
    // workflow's extraction node is an OpenAI node pinned to gpt-5-nano with
    // temperature 0.2, which that model rejects outright; once that was fixed
    // its "Shape row" node then blew up on JSON.parse of an empty completion,
    // because a reasoning model spent the 800-token cap before emitting any
    // content. It had been switched off since 2026-08-12 and returned 200 with
    // an empty body before that, so the API logged a silent_failure and fell
    // through on every single capture.
    //
    // Keeping it would mean maintaining the channel vocabulary in two places
    // (its prompt still listed builder-economy-pod and x, neither of which the
    // app recognises, so any distribution it produced was silently discarded on
    // read) and keeping a webhook hop that added a failure mode and no value.
    // The fallback below already computes the dedup fingerprints the workflow
    // never did. So enrichment moves in here and the hop is gone.
    let enriched: { thesis?: string; distribution?: string[]; confidence?: number } = {}
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const raw = await callClaude({
          agent: 'cleo',
          model: SYNTHESIS_MODEL,
          system:
            'You extract a structured content idea from raw text. Return JSON only.\n' +
            '- thesis: 1-2 sentences on why this is interesting, true or useful right now.\n' +
            '- distribution: the channels this best suits, from exactly this list and no other: ' +
            `${CAPTURE_CHANNELS.join(', ')}.\n` +
            '- confidence: 0.0-1.0. Low for a vague seed, high for an already-developed one.\n' +
            'Never invent a fact that is not in the text.',
          user: `${rawText.slice(0, 4000)}\n\nReply ONLY with {"thesis":string,"distribution":[string],"confidence":number}.`,
          maxTokens: 500,
          temperature: 0.3,
          timeoutMs: 20_000,
        })
        const j = robustJson(raw) as typeof enriched | null
        if (j) {
          enriched = {
            thesis: typeof j.thesis === 'string' ? sanitizeVoice(j.thesis).slice(0, 2000) : undefined,
            distribution: Array.isArray(j.distribution)
              ? j.distribution.filter((c): c is string => typeof c === 'string' && CAPTURE_CHANNELS.includes(c))
              : undefined,
            confidence: typeof j.confidence === 'number' ? Math.max(0, Math.min(1, j.confidence)) : undefined,
          }
        }
      } catch {
        // Enrichment is a bonus, never a gate. A captured idea with no thesis
        // is still captured; losing the capture because a model call timed out
        // would be strictly worse than a thin row.
      }
    }

    // The one insert. State stays 'seeded': a captured line is a seed even when
    // the enrichment above produced a thesis, and only a real draft may move it
    // past that (see canEnterState in src/lib/contentEngine.ts).
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
        thesis: enriched.thesis ?? null,
        distribution: enriched.distribution ?? [],
        confidence: enriched.confidence ?? 0,
        origin: sourceType === 'manual' ? 'user' : 'agent',
        canonical_url,
        title_norm,
        content_hash,
        ...(embedding ? { embedding } : {}),
      })
      .select()
      .single()

    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, via: enriched.thesis ? 'enriched' : 'raw', idea: data })
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
      // Closing the loop: stamp the publish time so the piece lands on the
      // calendar's "live" track and drops out of the publish follow-up.
      if (body.state === 'published') updates.published_at = new Date().toISOString()
    }
    if (typeof body.published_url === 'string') updates.published_url = body.published_url
    // Content Engine v2 (spec §5): rescuing a Feed item before the Monday purge
    // converts it into an evergreen Library candidate (fate 3, R10).
    if (body.rescue === true) {
      updates.horizon = 'evergreen'
      updates.expires_at = null
      updates.library_at = new Date().toISOString()
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: 'no updatable fields supplied' })
    }

    // ── Honest-state guard (CORE_PROBLEM F-1 / J-01) ─────────────────────────
    // A card may not enter `review`/`approved` without a real body. This is the
    // bug that filled the queue with empty "in review" cards. We resolve the
    // body that WILL exist after this PATCH (incoming body wins, else current
    // row), and check the gate. Returns 409 so the UI can explain, not 500.
    if (updates.state === 'review' || updates.state === 'approved') {
      const incomingBody = typeof updates.body === 'string' ? updates.body : undefined
      let effectiveBody = incomingBody
      let cleoChatLen = 0
      if (effectiveBody === undefined) {
        const { data: cur } = await supabase
          .from('content_ideas')
          .select('body, meta')
          .eq('id', id)
          .single()
        effectiveBody = (cur?.body as string | null) || ''
        const chat = (cur?.meta as { cleo_chat?: unknown[] } | null)?.cleo_chat
        cleoChatLen = Array.isArray(chat) ? chat.length : 0
      }
      const hasRealBody = (effectiveBody || '').trim().length >= 200 || cleoChatLen > 0
      if (!hasRealBody) {
        return res.status(409).json({
          ok: false,
          reason: 'state_guard',
          error: updates.state === 'review'
            ? 'A card needs a real draft before it can go to review. Develop it first.'
            : 'Nothing to approve — this card has no draft yet.',
        })
      }
    }

    const { data, error } = await supabase
      .from('content_ideas')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ ok: false, error: error.message })

    // A published piece left the machine toward readers: it is a ship on the
    // scorecard (ADR-016). Dedup on the idea id so a second flip to published
    // never double counts. Best effort: the publish already succeeded.
    if (updates.state === 'published') {
      await recordShip({
        channel: 'publish',
        description: `Published: ${String((data as { idea?: string } | null)?.idea || id).slice(0, 120)}`,
        dedup_key: `idea:${id}`,
      })
    }
    return res.json({ ok: true, idea: data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
