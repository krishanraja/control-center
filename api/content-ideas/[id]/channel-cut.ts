import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import {
  callClaude, corpusForChannel, loadCorpus, loadVoiceBlock, materialsContext, pathId, preamble,
  readMaterials, robustJson, sanitizeVoice,
} from '../../_content.js'

// POST /api/content-ideas/:id/channel-cut
//   body: { channel: MediaChannel, hint?: string, source_text?: string }
//
// Produce and KEEP a channel cut of a piece.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────
// There were two ways to make a variant and neither of them kept a channel one.
//
//   - /transform makes a child content_ideas row per FORMAT. Correct for Paid
//     and Built, because those are different pieces with different evidence
//     bars, commissioned separately.
//   - /revise with value 'adapt-<channel>' rewrote the working draft IN PLACE
//     and returned a preview. So making a LinkedIn cut meant overwriting the
//     Substack draft it came from. That is a rewrite button, not an engine:
//     one piece is supposed to go to several channels at once.
//
// Meanwhile content_ideas.transformed_outputs had existed all along, was typed
// in useRealtimeContentIdeas.ts, and NOTHING had ever written it. One row in
// production carries a single 'expand' key from a retired n8n flow.
//
// So the split is now explicit and each half has exactly one home:
//   FORMAT  changes what the piece IS      -> a child row      (/transform)
//   CHANNEL changes what shape it takes    -> transformed_outputs (here)
//
// A cut never touches `body`. The source piece stays whatever it was.

const VALID_CHANNELS = new Set([
  'substack', 'linkedin', 'youtube', 'instagram', 'podcast', 'signal_noise',
])

/** Numbers in the text, normalised so "$606" and "606" compare equal and
 *  thousands separators do not create false mismatches. */
function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(n => n.replace(/,/g, '').replace(/\.0+$/, ''))
}

/**
 * Which figures in a cut are NOT present in what it was cut from.
 *
 * The system prompt tells the model every number must appear verbatim in the
 * source. It mostly obeys and then quietly does not: a cut of a piece stating
 * 606 and 470 produced "142 saved" (the arithmetic is 136), and a later run
 * produced a "40 minutes" that existed nowhere. Both read as researched facts.
 *
 * So this checks rather than trusts. It does not block: a channel cut is a
 * draft Krish reads, and a false positive that refused to save would be worse
 * than a flag he can glance at. The unmatched figures go into the cut's notes
 * and into the toast, which is the difference between an invented number he
 * catches now and one he catches after publishing.
 *
 * Small integers are ignored deliberately. Numbers under 13 are overwhelmingly
 * ordinary prose ("three retry loops", "one config change") rather than claims,
 * and flagging them buries the real finding in noise.
 */
function unsupportedNumbers(cut: string, source: string): string[] {
  const inSource = new Set(numbersIn(source))
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of numbersIn(cut)) {
    if (inSource.has(n) || seen.has(n)) continue
    if (Number(n) < 13) continue
    // A year the source does not mention is still worth flagging, but a
    // percentage the source states as a decimal is not: check both readings.
    if (inSource.has(String(Number(n) / 100)) || inSource.has(String(Number(n) * 100))) continue
    seen.add(n)
    out.push(n)
  }
  return out.slice(0, 8)
}

// Retired channel keys that may still arrive from an old client or a stored
// row. Mapped forward so nothing 400s; never offered as a choice.
const RETIRED_CHANNELS: Record<string, string> = {
  twitter: 'linkedin',
  builder_economy_ig: 'instagram',
  mymu: 'substack',
  mindmaker_block: 'substack',
}

/** Fallback steer when the client sends none. The corpus carries the real
 *  register; this only has to name the shape so a cut is never shapeless. */
const FALLBACK_HINT: Record<string, string> = {
  substack: 'Adapt for Substack: 1200-2500 words, full evidence, one genuine counterpoint held properly, a verdict rather than a summary.',
  linkedin: 'Adapt for LinkedIn: 150-250 words, one idea, open mid-argument, short paragraphs, no hashtags and no "thoughts?" closer.',
  youtube: 'Turn into a spoken first-person YouTube script, 700-1300 words, one analogy carried the whole way including where it breaks, plain words, dry humour aimed at the industry and never the viewer.',
  instagram: 'Adapt into an Instagram post about one surprising or encouraging shift, a hook line then four to eight one-second beats, resting on a named company, a real number or a dated change.',
  podcast: 'Adapt into a podcast script, 800-1500 words, spoken register with nothing left to a picture, no punctuation the ear cannot hear, names and numbers repeated once.',
  signal_noise: 'Adapt for Signal & Noise: exec-to-exec, 300-500 words, separate durable signal from noise, name what most people get wrong, hard verdict ending.',
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  const id = pathId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const b = (req.body || {}) as { channel?: string; hint?: string; source_text?: string }
  const requested = String(b.channel || '')
  const channel = RETIRED_CHANNELS[requested] || requested
  if (!VALID_CHANNELS.has(channel)) {
    return res.status(400).json({ ok: false, error: `invalid channel (${[...VALID_CHANNELS].join('|')})` })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' })
  }

  const { data: idea, error } = await supabase
    .from('content_ideas')
    .select('id,idea,thesis,body,meta,lane,lane_slot,source_url,transformed_outputs')
    .eq('id', id).single()
  if (error || !idea) return res.status(404).json({ ok: false, error: 'idea not found' })

  const source = (b.source_text || idea.body || '').trim()
  if (source.length < 120) {
    // A cut of nothing is nothing. Saying so beats generating a plausible
    // LinkedIn post out of a headline and storing it as if it were derived work.
    return res.status(409).json({
      ok: false,
      error: 'no_draft',
      hint: 'Write or generate the piece first. A channel cut compresses an existing draft, it does not invent one.',
    })
  }

  const [voice, corpus] = await Promise.all([loadVoiceBlock(), loadCorpus()])
  const channelCorpus = corpusForChannel(corpus, channel)
  const meta = (idea.meta || {}) as Record<string, unknown>
  const research = Array.isArray(meta.research) ? (meta.research as string[]) : []
  const sources = Array.isArray(meta.sources) ? (meta.sources as string[]) : []
  const citations = [...new Set([idea.source_url, ...research, ...sources].filter(Boolean))] as string[]

  // Krish's own pasted research, the same meta.materials[] the composer shows
  // and /revise grounds on. A cut that cannot see it would quietly drop the one
  // source he cared enough about to paste in by hand, and the shorter the cut
  // the more likely his specific number is the thing that gets cut.
  const materials = readMaterials(idea.meta)
  const materialsBlock = materials.length ? `\n\n${materialsContext(materials)}` : ''

  const system = [
    voice,
    channelCorpus
      ? `\n\nCHANNEL REGISTER (the mandate, shape and bar for this channel, bend the draft toward THIS rather than doing a generic rewrite):\n${channelCorpus}`
      : '',
    '\n\nYou are cutting an existing piece for one channel. The argument does not change. The length, register and scaffolding do. ' +
    'You may cut, compress, reorder and re-voice. You may NOT add a claim the source piece did not earn: if the channel wants a fact the source does not have, that is a gap in the source, not licence to invent one. ' +
    // Every number has to be one the source already states. A cut that does its
    // own arithmetic will get it wrong and the error is invisible, because it
    // looks like a figure that came from the research. Caught live: a source
    // saying 606 and 470 produced "142 saved" in two different cuts.
    'EVERY NUMBER MUST APPEAR VERBATIM IN THE SOURCE. Do not compute totals, differences, percentages or rates, even when the arithmetic looks obvious. ' +
    'If a number you want is not written in the source, leave it out and say the thing without it. ' +
    'No em dashes.',
  ].filter(Boolean).join('')

  let text: string
  try {
    text = await callClaude({
      model: 'claude-sonnet-4-6',
      system,
      user:
        `SOURCE PIECE: ${idea.idea}\n` +
        `${idea.thesis ? `Thesis: ${idea.thesis}\n` : ''}` +
        `${citations.length ? `Citations available: ${citations.slice(0, 8).join(', ')}\n` : ''}` +
        `${materialsBlock}` +
        `\nDRAFT:\n${source.slice(0, 14_000)}\n\n` +
        `INSTRUCTION: ${b.hint || FALLBACK_HINT[channel]}\n\n` +
        'Return ONLY a single JSON object: {"body":string,"visual_suggestion":string|null,"notes":string|null}. ' +
        '"notes" is where you flag anything the channel wanted that the source could not support. Leave it null if there is nothing to flag.',
      maxTokens: 6000,
      temperature: 0.5,
      timeoutMs: 90_000,
    })
  } catch (e) {
    return res.status(502).json({ ok: false, error: String((e as Error)?.message || e).slice(0, 200) })
  }

  const parsed = robustJson(text) as { body?: string; visual_suggestion?: string | null; notes?: string | null } | null
  const body = sanitizeVoice(String(parsed?.body || text || '').trim())
  if (!body) return res.status(502).json({ ok: false, error: 'empty_generation' })

  // Verify the figures against what this was cut from, and against Krish's own
  // pasted material, before storing anything.
  const grounded = [source, materials.map(m => `${m.title} ${m.content || ''} ${m.url || ''}`).join(' '), citations.join(' ')].join('\n')
  const unsupported = unsupportedNumbers(body, grounded)
  const numberWarning = unsupported.length
    ? `Figures not found in the source: ${unsupported.join(', ')}. Check before publishing.`
    : null

  // Merge, never replace: the other channels' cuts of this piece must survive.
  const existing = (idea.transformed_outputs || {}) as Record<string, unknown>
  const next = {
    ...existing,
    [channel]: {
      body,
      generated_at: new Date().toISOString(),
      model: 'claude-sonnet-4-6',
      notes: [parsed?.notes ? String(parsed.notes).slice(0, 600) : null, numberWarning]
        .filter(Boolean).join(' ') || null,
      unsupported_numbers: unsupported,
      visual_suggestion: parsed?.visual_suggestion ? String(parsed.visual_suggestion).slice(0, 300) : null,
    },
  }

  const { error: upErr } = await supabase
    .from('content_ideas')
    .update({ transformed_outputs: next, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (upErr) return res.status(500).json({ ok: false, error: upErr.message })

  return res.status(200).json({
    ok: true,
    channel,
    cut: next[channel],
    channels: Object.keys(next),
  })
}

// A Substack cut can be 2500 words out of a 14k-character source, which is a
// long single generation. Well above the platform default on purpose.
export const config = { maxDuration: 120 }
