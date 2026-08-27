import { callClaude, robustJson } from './_content.js'
import { googleConfigured, createGmailDraft } from './_google.js'

// Shared delivery layer for outreach email drafts. Every draft-email route
// (contacts / leads / customers / guests) builds its own rich context, then hands
// the assembled payload here. This module owns the n8n-vs-direct decision so the
// app keeps working when n8n is down or its workflow quota is exhausted.
//
//  - n8n path: forward to the Cleo Email Draft workflow → draft lands in Gmail.
//  - direct path: call Claude here, return subject+body for in-app preview +
//    "open in Gmail compose" (no n8n, no extra server credentials).
//
// Auto-fallback: if the webhook is unset or the n8n call fails, we transparently
// fall back to the direct path. A caller can also force direct (forceDirect) when
// the user has explicitly chosen to work outside n8n.

export interface EmailDraftPayload {
  entity_type: string
  entity_id: string
  recipient_email: string
  recipient_name?: string | null
  recipient_title?: string | null
  recipient_company?: string | null
  context?: string | null
  voice_rules?: string | null
  linkedin_url?: string | null
  source_url?: string | null
  venture?: string | null
  intent?: string | null
  /** Optional framing for the direct path when not already baked into context. */
  length?: string | null
  tone?: string | null
  note?: string | null
}

export interface DeliverResult {
  mode: 'n8n' | 'direct'
  /** n8n */
  draft_id?: string
  draft_url?: string
  /** direct */
  subject?: string
  body?: string
}

const LENGTH_GUIDE: Record<string, string> = {
  short: 'LENGTH: keep it tight — 60-90 words, two short paragraphs at most.',
  standard: 'LENGTH: 90-120 words (hard cap 120).',
}
const TONE_GUIDE: Record<string, string> = {
  warm: 'TONE: warm and personable, while still senior peer-to-peer.',
  direct: 'TONE: direct and economical. Get to the point fast.',
}

/** Build subject + body directly via Claude — the n8n-free path. */
export async function draftEmailDirect(p: EmailDraftPayload): Promise<{ subject: string; body: string }> {
  const system = [
    p.voice_rules || 'Write in a senior, warm-but-direct executive voice. No corporate filler, no hype.',
    '',
    'You are drafting ONE outreach email that Krish will review and send himself.',
    'Write only the email. Never invent facts that are not in the context — if there is no deep research, keep claims about the recipient general and true.',
    'Plain text only: no markdown, no placeholders like [Name], a simple sign-off ("Krish") is fine.',
    'Return ONLY JSON: {"subject": "…", "body": "…"}.',
  ].join('\n')

  const recipient = [
    p.recipient_name || 'there',
    p.recipient_title ? `, ${p.recipient_title}` : '',
    p.recipient_company ? ` at ${p.recipient_company}` : '',
  ].join('')

  const extra = [
    p.length && LENGTH_GUIDE[p.length] ? LENGTH_GUIDE[p.length] : null,
    p.tone && TONE_GUIDE[p.tone] ? TONE_GUIDE[p.tone] : null,
    p.note ? `MUST WEAVE IN: ${p.note}` : null,
  ].filter(Boolean)

  const user = [
    `Recipient: ${recipient}.`,
    p.intent ? `Intent: ${String(p.intent).replace(/_/g, ' ')}.` : '',
    p.venture ? `Collaboration angle / venture: ${p.venture}.` : '',
    '',
    'CONTEXT:',
    p.context || '(no extra context on file — keep it genuine and general)',
    ...(extra.length ? ['', ...extra] : []),
  ].filter(Boolean).join('\n')

  const raw = await callClaude({ agent: 'outreach-email', system, user, maxTokens: 1200, temperature: 0.6 })
  const j = robustJson(raw) || {}
  const subject = typeof j?.subject === 'string' ? j.subject.trim() : ''
  const body = typeof j?.body === 'string' ? j.body.trim() : (typeof raw === 'string' ? raw.trim() : '')
  return {
    subject: subject || `Quick note${p.recipient_name ? `, ${p.recipient_name}` : ''}`,
    body,
  }
}

/**
 * Deliver an email draft via n8n when available, else directly via Claude.
 * Falls back to direct on any n8n failure. Set forceDirect to skip n8n entirely.
 */
export async function deliverEmailDraft(
  payload: EmailDraftPayload,
  opts: { forceDirect?: boolean } = {},
): Promise<DeliverResult> {
  const webhook = process.env.N8N_EMAIL_DRAFT_WEBHOOK_URL
  const goDirect = opts.forceDirect || !webhook

  if (!goDirect && webhook) {
    try {
      const post = (entityType: string) =>
        fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, entity_type: entityType }),
        })
      // Self-healing bridge: a workflow that hasn't learned 'contact' yet rejects
      // it; retry once as 'lead' (an accepted type) before giving up to direct.
      let r = await post(payload.entity_type)
      let text = await r.text()
      if (!r.ok && /entity_type must be/i.test(text)) {
        r = await post('lead')
        text = await r.text()
      }
      if (r.ok) {
        let parsed: any = {}
        try { parsed = JSON.parse(text) } catch { parsed = {} }
        return { mode: 'n8n', draft_id: parsed?.draft_id, draft_url: parsed?.draft_url }
      }
      // non-200 → fall through to direct
    } catch {
      // network error → fall through to direct
    }
  }

  const { subject, body } = await draftEmailDirect(payload)
  // If a Google service account is configured, also land it in Gmail drafts so
  // direct mode matches the n8n behaviour (best-effort; preview still shown).
  let draft_url: string | undefined
  if (googleConfigured() && payload.recipient_email) {
    const gd = await createGmailDraft({ to: payload.recipient_email, subject, body })
    if (gd) draft_url = gd.url
  }
  return { mode: 'direct', subject, body, draft_url }
}
