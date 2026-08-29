import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { loadVoiceBlock, preamble, sanitizeVoice, VOICE_GUARDRAILS } from '../../_content.js'
import { openStream, send, fail, streamClaude } from '../../_stream.js'
import { loadStandingNotes, standingNotesPrompt } from '../../_briefNotes.js'
import { locateSpan } from '../../_selection.js'
import { buildHumourSystem, isHumourRegister } from '../../_humor.js'
import { SYNTHESIS_MODEL } from '../../_models.js'

// POST /api/briefs/:week/revise   body: { mode?, value?, hint?, instruction?, selection? }
//
// The brief's magic-edit engine (mockup set 2, pin 12): preset one-tap
// rewrites (tighten / sharper_open / harder_ending / more_data), the shared
// edit palette from src/lib/contentEngine.ts riding in on `hint`, a free
// instruction ("Tell Cleo", dictated on mobile), and span-scoped rewrites
// (selection replaced inside the full draft). Preview-only: returns the
// rewritten markdown, the client PATCHes it via /api/briefs/:week on Keep.
//
// Humour is not a steer you can bury in the general rewriter — "be sarcastic"
// produces the impression of a joke. Those passes swap in the examples-driven
// system prompt from api/_humor.ts and a stronger model, exactly as the
// composer's /revise has always done. This route simply never imported it, so
// six of the registers were unreachable from the brief.
//
// Every preset knows the brief is an ARGUMENT (see api/briefs/assemble.ts): a
// piece that contradicts a belief or confirms a twelve-month thesis, read
// through a commercial and strategic lens. A preset that treats it as a roundup
// sands the argument off, which is exactly how the weekly drifted before.

const ARGUMENT = 'This brief is an investigative opinion piece, not a roundup: the clues prosecute one belief, either contradicting it or confirming a twelve-month thesis, always through a commercial and strategic lens (pricing, margin, who pays, build versus buy, competitive position). Every edit must leave that argument intact or sharper, never flatter.'

const PRESETS: Record<string, string> = {
  tighten: 'Tighten the whole piece. Cut filler and any sentence that restates the one above it. Keep every fact and citation, do not change the structure or headings, and do not soften the verdict while shortening it.',
  sharper_open: 'Sharpen the claim. Make the title and standfirst state what is being argued and which way it came down, so a reader who sees only those knows the verdict. Then make the opening of each section land on its own point in the first sentence. Keep all facts, headings and citations.',
  harder_ending: 'Make the close land on a hard, forward-looking verdict with a commercial consequence and the specific thing to watch. Never end on a summary, a question, or "time will tell".',
  more_data: 'Where a claim is soft, sharpen it with the specific numbers, companies and dates already present in the piece, and tie each to the mechanism it moves (price, margin, who pays, buying behaviour). Never invent data. Where the evidence cannot carry the claim, say so plainly instead of padding it.',
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  const week = (req.query.week || '') as string
  if (!/^\d{4}-W\d{2}$/.test(week)) return res.status(400).json({ ok: false, error: 'week required (YYYY-Www)' })

  const b = (req.body || {}) as {
    mode?: string; value?: string; hint?: string; instruction?: string; selection?: string
  }
  const preset = b.mode ? PRESETS[b.mode] : null
  const hint = (b.hint || '').trim()
  const instruction = (b.instruction || '').trim()
  const steer = preset || hint || instruction
  if (!steer) return res.status(400).json({ ok: false, error: 'mode, hint or instruction required' })
  const humour = isHumourRegister(b.value)

  const { data: brief, error } = await supabase.from('weekly_briefs').select('week, body_md').eq('week', week).single()
  if (error || !brief?.body_md) return res.status(404).json({ ok: false, error: 'brief not found or empty' })

  // The client hands over what the USER highlighted, which is rendered text:
  // no markdown, citation markers that may or may not be in the stored copy,
  // single newlines between blocks, and whatever sanitizeVoice has since done
  // to the dashes. `body_md.includes(selection)` could never match that, and
  // returning 409 made the one feature that worked look broken. Match on the
  // words instead and resolve to the real markdown at those offsets, so the
  // span handed to the model is a substring of the draft it is being given.
  const rawSelection = (b.selection || '').trim()
  const hit = rawSelection ? locateSpan(brief.body_md, rawSelection) : null
  if (rawSelection && !hit) {
    return res.status(409).json({
      ok: false,
      error: 'that passage is not in the saved draft',
      detail: 'Save the brief and highlight it again. If it still fails, the passage may have been rewritten by another edit.',
    })
  }
  const selection = hit?.text || ''

  const [voice, standingNotes] = await Promise.all([loadVoiceBlock(), loadStandingNotes()])
  const system = [
    humour
      ? buildHumourSystem({ register: b.value as string, voice, channelCorpus: '', materialsBlock: '' })
      : 'You edit the the publication weekly brief. You write as Krish, for business leaders.',
    humour ? '' : (voice ? `VOICE:\n${voice}` : ''),
    humour ? '' : VOICE_GUARDRAILS,
    standingNotesPrompt(standingNotes),
    ARGUMENT,
    'Preserve the markdown structure (headings, lists, links) unless the instruction says otherwise. Only the clues are a bulleted list; keep bold text out of the prose sections, because the citation markers attach to bold bullets by position.',
    'HONESTY: never invent facts, numbers, companies or quotes. Keep every URL exactly as it is.',
    selection
      ? 'Rewrite ONLY the selected span; return the FULL draft with the span replaced and everything else byte-identical.'
      : 'Return the FULL rewritten draft.',
    'Reply with the markdown only. No preamble, no code fences.',
  ].filter(Boolean).join('\n\n')

  const user = [
    `EDIT INSTRUCTION: ${steer}`,
    selection ? `SELECTED SPAN:\n${selection}` : '',
    `DRAFT:\n${brief.body_md}`,
  ].filter(Boolean).join('\n\n')

  // Streamed: a whole-brief revision is the longest of these, and the editor
  // shows the result as a preview the user reads before accepting. Watching it
  // arrive is strictly better than watching a rail for a minute.
  //
  // The raw text streams as the preview; the `done` payload carries the version
  // that has been through sanitizeVoice and the fence strip, and that is the
  // one the editor accepts. The length guard also only means anything against
  // the finished text.
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(503).json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' })

  openStream(res)
  try {
    const out = await streamClaude({
      agent: 'briefs-revise',
      apiKey,
      model: humour ? 'claude-opus-4-8' : SYNTHESIS_MODEL,
      // Matches briefs/assemble.ts, which writes the brief this route edits.
      // Ignored on the humour path: opus rejects sampling params.
      temperature: 0.4,
      maxTokens: 4000,
      system,
      messages: [{ role: 'user', content: user }],
      onText: chunk => send(res, 'delta', { text: chunk }),
    })
    const preview = sanitizeVoice(out.trim().replace(/^```(?:markdown|md)?\n?|\n?```$/g, ''))
    if (!preview || preview.length < 100) return fail(res, 'revision came back empty')
    send(res, 'done', { ok: true, preview })
    return res.end()
  } catch (e: unknown) {
    return fail(res, 'revise_failed', String((e as Error)?.message || e))
  }
}

export const config = { maxDuration: 120 }
