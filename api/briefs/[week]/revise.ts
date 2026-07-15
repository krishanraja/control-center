import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { callClaude, loadVoiceBlock, preamble, sanitizeVoice, VOICE_GUARDRAILS } from '../../_content.js'
import { loadStandingNotes, standingNotesPrompt } from '../../_briefNotes.js'

// POST /api/briefs/:week/revise   body: { mode, instruction?, selection? }
//
// The brief's magic-edit engine (mockup set 2, pin 12): preset one-tap
// rewrites (tighten / sharper_open / harder_ending / more_data), a free
// instruction ("Tell Cleo", dictated on mobile), and span-scoped rewrites
// (selection replaced inside the full draft). Preview-only: returns the
// rewritten markdown, the client PATCHes it via /api/briefs/:week on Keep.

const PRESETS: Record<string, string> = {
  tighten: 'Tighten the whole piece. Cut filler, keep every fact and citation, do not change the structure or headings.',
  sharper_open: 'Rewrite the opening of each section to land harder. Keep all facts, headings and citations.',
  harder_ending: 'Rewrite the ending to land on a hard, forward-looking verdict. Never end on a summary or a question.',
  more_data: 'Where a claim is soft, sharpen it with the specific numbers, companies and dates already present in the piece. Never invent data.',
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  const week = (req.query.week || '') as string
  if (!/^\d{4}-W\d{2}$/.test(week)) return res.status(400).json({ ok: false, error: 'week required (YYYY-Www)' })

  const b = (req.body || {}) as { mode?: string; instruction?: string; selection?: string }
  const preset = b.mode ? PRESETS[b.mode] : null
  const instruction = (b.instruction || '').trim()
  if (!preset && !instruction) return res.status(400).json({ ok: false, error: 'mode or instruction required' })

  const { data: brief, error } = await supabase.from('weekly_briefs').select('week, body_md').eq('week', week).single()
  if (error || !brief?.body_md) return res.status(404).json({ ok: false, error: 'brief not found or empty' })

  const selection = (b.selection || '').trim()
  if (selection && !brief.body_md.includes(selection)) {
    return res.status(409).json({ ok: false, error: 'selection no longer matches the draft' })
  }

  const [voice, standingNotes] = await Promise.all([loadVoiceBlock(), loadStandingNotes()])
  const system = [
    'You edit the Mindmaker LIVE weekly brief. You write as Krish, for business leaders.',
    voice ? `VOICE:\n${voice}` : '',
    VOICE_GUARDRAILS,
    standingNotesPrompt(standingNotes),
    'Preserve the markdown structure (headings, lists, links) unless the instruction says otherwise.',
    'HONESTY: never invent facts, numbers, companies or quotes. Keep every URL exactly as it is.',
    selection
      ? 'Rewrite ONLY the selected span; return the FULL draft with the span replaced and everything else byte-identical.'
      : 'Return the FULL rewritten draft.',
    'Reply with the markdown only. No preamble, no code fences.',
  ].filter(Boolean).join('\n\n')

  const user = [
    `EDIT INSTRUCTION: ${preset || instruction}`,
    selection ? `SELECTED SPAN:\n${selection}` : '',
    `DRAFT:\n${brief.body_md}`,
  ].filter(Boolean).join('\n\n')

  try {
    const out = await callClaude({ model: 'claude-sonnet-4-6', maxTokens: 4000, temperature: 0.35, system, user })
    const preview = sanitizeVoice(out.trim().replace(/^```(?:markdown|md)?\n?|\n?```$/g, ''))
    if (!preview || preview.length < 100) return res.status(502).json({ ok: false, error: 'revision came back empty' })
    return res.json({ ok: true, preview })
  } catch (e: unknown) {
    return res.status(502).json({ ok: false, error: String((e as Error)?.message || e) })
  }
}

export const config = { maxDuration: 120 }
