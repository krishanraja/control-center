import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import {
  callClaudeMessages, loadVoiceBlock, materialsContext, pathId, preamble,
  readMaterials, sanitizeVoice, VOICE_GUARDRAILS, type ChatTurn,
} from '../../_content.js'

// POST /api/content-ideas/:id/chat
//   body: { messages: [{role,content}], draft?: string }
//
// Cleo as a writing assistant you can just talk to. She is grounded in Krish's
// voice, the current draft, and the background materials attached to the piece.
// Returns her reply; the composer lets Krish drop any reply straight into the
// draft. Conversational escape hatch when the buttons feel too restrictive.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  const id = pathId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const b = (req.body || {}) as { messages?: ChatTurn[]; draft?: string }
  const messages = Array.isArray(b.messages) ? b.messages : []
  if (!messages.length) return res.status(400).json({ ok: false, error: 'messages required' })

  const { data: idea } = await supabase
    .from('content_ideas').select('idea,thesis,meta,lane,lane_slot,body').eq('id', id).single()

  const voice = await loadVoiceBlock()
  const materials = readMaterials(idea?.meta)
  const draft = (b.draft || idea?.body || '').trim()
  const meta = (idea?.meta || {}) as any

  const system = [
    "You are Cleo, Krish Raja's content partner. Krish is a British-Australian founder-operator in Brooklyn running a production AI agent fleet. You write and think in his voice: founder-practitioner, two gears (exec-to-exec authority / builder-in-the-room), compression, the \"Not X, Y\" clarifier, hard-verdict endings.",
    'You are in a working chat next to a draft. Be a real collaborator: think out loud briefly, then give him something usable. When he asks you to write or rewrite, return the prose itself (no preamble like "Sure, here is"). When he is thinking, push his thinking, surface the sharper angle, name what is missing. Keep replies tight; he hates padding.',
    '',
    voice ? `VOICE REFERENCE:\n${voice}` : '',
    '',
    VOICE_GUARDRAILS,
    '',
    materials.length ? materialsContext(materials) : '',
    '',
    draft ? `CURRENT DRAFT ON SCREEN:\n${draft}` : 'There is no draft yet — help him start one.',
    idea ? `\nPIECE: ${idea.idea}${idea.thesis ? `\nTHESIS: ${idea.thesis}` : ''}${idea.lane ? `\nLANE: ${idea.lane}${idea.lane_slot ? ` / ${idea.lane_slot}` : ''}` : ''}` : '',
  ].filter(Boolean).join('\n')

  let reply: string
  try {
    reply = (await callClaudeMessages(system, messages, { maxTokens: 2200, temperature: 0.6 })).trim()
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) })
  }
  reply = sanitizeVoice(reply)

  // Keep a short transcript on the row so a piece remembers its conversation.
  const history = Array.isArray(meta.cleo_chat) ? meta.cleo_chat : []
  const lastUser = [...messages].reverse().find(m => m.role === 'user')
  const appended = [
    ...history,
    ...(lastUser ? [{ role: 'user', content: lastUser.content.slice(0, 4000), at: new Date().toISOString() }] : []),
    { role: 'assistant', content: reply.slice(0, 8000), at: new Date().toISOString() },
  ].slice(-40)
  await supabase.from('content_ideas')
    .update({ meta: { ...meta, cleo_chat: appended }, updated_at: new Date().toISOString() })
    .eq('id', id)

  return res.status(200).json({ ok: true, reply })
}
