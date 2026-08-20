// Video script formats, 15 seconds to 20 minutes.
//
// The engine could already produce a "YouTube script" — one length, roughly
// five to nine minutes, prose in a spoken register with the beats marked. That
// is one of these six, and the other five are not it scaled up or down. A 15
// second hook and a 20 minute investigation are different objects: the short
// one spends its whole budget on a single turn and has no room to earn
// anything, the long one has to earn everything and cannot rely on a turn.
// Handing a model a word count and hoping is how you get a 20 minute script
// that is a 60 second script with padding.
//
// So each format carries its own SHAPE. The word targets are ~150 spoken words
// per minute, which is unhurried delivery rather than a read-aloud record.
//
// Mirrors VIDEO_FORMATS in src/lib/contentEngine.ts, which supplies the picker.
// scripts/check-video-formats.mts keeps the two in step.

export interface VideoFormat {
  id: string
  label: string
  seconds: number
  /** Spoken words, at ~150/min. */
  words: number
  /** The structure this length can actually carry. */
  shape: string
}

export const VIDEO_FORMATS: VideoFormat[] = [
  {
    id: '15s', label: '15 second hook', seconds: 15, words: 40,
    shape: [
      'ONE claim, ONE turn, hard out. Three or four sentences total.',
      'Sentence one states the claim as though mid-argument. No setup, no "in this video", no naming the topic before making the point.',
      'The turn is the whole piece: the thing the viewer did not expect, arriving by the second sentence.',
      'End on the consequence, not a summary and not a question. Never a call to action.',
      'There is no room to earn anything here, so do not try: assert, turn, stop.',
    ].join(' '),
  },
  {
    id: '30s', label: '30 seconds', seconds: 30, words: 80,
    shape: [
      'Claim, proof, verdict. Three beats, roughly even.',
      'The claim lands in the first five seconds and is arguable, not descriptive.',
      'The proof is ONE specific artifact: a number, a named company, a dated event. One only; a second proof at this length costs the verdict.',
      'The verdict is forward-looking and hands the viewer something reusable.',
    ].join(' '),
  },
  {
    id: '60s', label: '60 second reel', seconds: 60, words: 160,
    shape: [
      'Hook, proof, turn, verdict.',
      'The hook is the surprising claim, inside ten seconds, with no throat-clearing.',
      'The proof grounds it in named specifics.',
      'The turn is the part the viewer did not see coming: the second-order effect, the counter-reading, the part that inverts the obvious take.',
      'The verdict is hard and forward-looking. No summary, no question, no CTA.',
    ].join(' '),
  },
  {
    id: '3min', label: '3 minutes', seconds: 180, words: 450,
    shape: [
      'Hook, then three beats, then verdict.',
      'Each beat makes ONE point and carries its own evidence. A beat that restates the one above it is cut.',
      'Beats escalate: the third should be the one that would not have been believed at the start.',
      'Mark the beats explicitly so the edit has cut points.',
      'The verdict is a hard forward-looking read, not a recap of the three beats.',
    ].join(' '),
  },
  {
    id: '10min', label: '10 minutes', seconds: 600, words: 1500,
    shape: [
      'Cold open, four sections, close.',
      'The cold open is a scene or a concrete artifact, not a thesis statement. The thesis arrives after the viewer is already in.',
      'Each of the four sections advances the argument and ends on a hook into the next. A section that could be reordered freely is a list, not an argument.',
      'Pick ONE analogy and carry it the whole way, including through the part where it breaks, and say out loud where it stops working.',
      'Hold one genuine counterpoint, in full, before answering it.',
      'The close is a hard verdict plus the specific thing to watch next.',
    ].join(' '),
  },
  {
    id: '20min', label: '20 minutes', seconds: 1200, words: 3000,
    shape: [
      'Full investigative structure.',
      'Cold open on the artifact. State the belief being prosecuted. Take the load-bearing claim apart and check each part against dated evidence, attributing every number to whoever produced it.',
      'One analogy, carried the whole way, broken honestly where it stops mapping.',
      'Hold the strongest counterpoint in its best form, not a straw version, and answer it or concede it.',
      'Say plainly where the knowable record ends rather than papering over it.',
      'Close on a hard verdict and the terminal question the evidence actually leaves open.',
      'At this length the viewer will forgive slowness but not padding: every section must move the argument or come out.',
    ].join(' '),
  },
]

export function videoFormat(id?: string | null): VideoFormat | null {
  return VIDEO_FORMATS.find(f => f.id === id) || null
}

/** Spoken-delivery rules every length obeys. */
export const SPOKEN_RULES = [
  'This is spoken, not an essay read aloud. Contractions, asides, and sentences a person can say in one breath.',
  'Plain words even where the idea is not. Expand every acronym once, the first time it appears.',
  'It has to pass a read-aloud test: if a sentence needs a second pass to parse, it is written, not spoken.',
  'Dry humour that makes the next idea easier to hold. Aim it at the industry, the hype, or yourself, never at the viewer for not knowing.',
  'No "hey guys", no "in today\'s video", no "make sure to like and subscribe", no restating the title.',
  'No em dashes. Use commas, periods or parentheses.',
].join('\n')

// ── The script pass itself ────────────────────────────────────────────────
// Shared by both callers: a content piece (content-ideas/[id]/video-script)
// and the weekly brief (briefs/[week]/video-script). They differ only in where
// the draft comes from and where the result is stored, so the prompt, the
// spoken rules, the structure-per-length and the number check live here rather
// than being written twice and drifting.

import { unsupportedNumbers } from './_numbers.js'
import {
  callClaude, corpusForChannel, loadCorpus, loadVoiceBlock, materialsContext,
  robustJson, sanitizeVoice, type Material,
} from './_content.js'

export interface VideoBeat { t: string; say: string; shot: string }

export interface VideoScript {
  duration: string
  label: string
  title: string | null
  hook: string | null
  beats: VideoBeat[]
  /** Plain text, in the shape growth_creative_queue.script wants. */
  script: string
  /** Plain text, in the shape growth_creative_queue.shot_notes wants. */
  shot_notes: string
  word_count: number
  target_words: number
  notes: string | null
  unsupported_numbers: string[]
  generated_at: string
  model: string
}

const MODEL = 'claude-sonnet-4-6'

export async function buildVideoScript(o: {
  format: VideoFormat
  source: string
  title?: string | null
  thesis?: string | null
  citations?: string[]
  materials?: Material[]
  hint?: string | null
}): Promise<VideoScript> {
  const citations = (o.citations || []).filter(Boolean).slice(0, 8)
  const materials = o.materials || []

  const [voice, corpus] = await Promise.all([
    loadVoiceBlock().catch(() => ''),
    loadCorpus().catch(() => ''),
  ])
  // The house already has a spoken register written down, under YouTube.
  const register = corpusForChannel(corpus, 'youtube')
  const f = o.format

  const system = [
    'You are cutting an existing piece into a spoken video script. The argument does not change. The length, register and scaffolding do.',
    voice ? `VOICE REFERENCE:\n${voice}` : '',
    register ? `CHANNEL REGISTER (bend the script toward THIS rather than doing a generic rewrite):\n${register}` : '',
    `TARGET LENGTH: ${f.label}. The spoken words across ALL beats must total no more than ${Math.round(f.words * 1.1)} words, and should land near ${f.words}. Count them before you answer.`,
    `This is a hard ceiling, not a style note: ${f.words} words is what fits in ${f.seconds} seconds at an unhurried pace. Going over does not produce a longer ${f.label}, it produces a script that overruns, and at the short lengths that is the difference between a hook and a rambling clip. If the material will not fit, cut material. Do not speed up the delivery to make room.`,
    `STRUCTURE FOR THIS LENGTH (not a suggestion, this is what this length can carry):\n${f.shape}`,
    SPOKEN_RULES,
    'You may cut, compress, reorder and re-voice. You may NOT add a claim the source piece did not earn. EVERY NUMBER MUST APPEAR VERBATIM IN THE SOURCE. Do not compute totals, differences, percentages or rates, even when the arithmetic looks obvious.',
    'Return JSON only: {"beats":[{"t":string,"say":string,"shot":string}],"title":string,"hook":string,"notes":string|null}',
    '"t" is an approximate timecode for the start of the beat, as m:ss (for example "0:00", "0:12"). "say" is the spoken words for that beat, verbatim, ready to read. "shot" is what is on screen during it: framing, b-roll, on-screen text, or a cut instruction. Keep "shot" concrete and short.',
    '"title" is a working video title that states the claim rather than teasing it. "hook" is the first line, repeated on its own because it does the most work.',
  ].filter(Boolean).join('\n\n')

  const user = [
    `PIECE: ${o.title || '(untitled)'}`,
    o.thesis ? `THESIS: ${o.thesis}` : '',
    citations.length ? `Citations available:\n${citations.join('\n')}` : '',
    materials.length ? materialsContext(materials) : '',
    `DRAFT:\n${o.source.slice(0, 14_000)}`,
    o.hint ? `INSTRUCTION: ${o.hint}` : '',
  ].filter(Boolean).join('\n\n')

  const ask = async (extra?: string) => {
    const out = await callClaude({
      timeoutMs: 110_000,
      model: MODEL,
      temperature: 0.5,
      // A 20 minute script is ~3000 spoken words plus shot notes and JSON
      // scaffolding, so the ceiling scales with the format or the long ones
      // truncate mid-beat.
      maxTokens: Math.min(8000, 1500 + f.words * 2),
      system,
      user: extra ? `${user}\n\n${extra}` : user,
    })
    const parsed = (robustJson(out) || {}) as { beats?: any[]; title?: string; hook?: string; notes?: string | null }
    const beats: VideoBeat[] = (Array.isArray(parsed.beats) ? parsed.beats : [])
      .map((x: any) => ({
        t: String(x?.t || '').trim(),
        say: sanitizeVoice(String(x?.say || '').trim()),
        shot: String(x?.shot || '').trim(),
      }))
      .filter(x => x.say)
    return { parsed, beats, words: beats.map(x => x.say).join(' ').split(/\s+/).filter(Boolean).length }
  }

  // Measure, then hold it to the budget. The word count is the one instruction
  // the model reliably nods at and ignores: asked for a 15 second script at 40
  // words it returned 77, which is a competent 31 second script and therefore
  // the wrong object. One corrective pass with the real numbers in front of it
  // fixes this where restating the rule up front does not.
  const CEILING = 1.15
  let attempt = await ask()
  if (attempt.beats.length && attempt.words > f.words * CEILING) {
    const trimmed = await ask(
      `Your previous attempt ran to ${attempt.words} spoken words. The ceiling is ${Math.round(f.words * 1.1)} and the target is ${f.words}. ` +
      `That is ${Math.round((attempt.words / f.words - 1) * 100)}% over, which at ${f.seconds} seconds overruns badly. ` +
      'Cut material, do not compress delivery: drop the least load-bearing beat entirely, and shorten the sentences that remain. Keep the hook and the ending. Return the same JSON shape.',
    ).catch(() => null)
    // Keep the retry only if it actually helped; a shorter-but-empty answer is
    // not an improvement.
    if (trimmed?.beats.length && trimmed.words < attempt.words) attempt = trimmed
  }

  const { parsed, beats } = attempt
  if (!beats.length) throw new Error('script came back empty')

  const spoken = beats.map(x => x.say).join(' ')
  // Same check channel-cut runs. A script is read to camera, so an invented
  // figure gets said out loud with total confidence.
  const grounding = `${o.source} ${materials.map(m => m.content || '').join(' ')} ${citations.join(' ')}`

  return {
    duration: f.id,
    label: f.label,
    title: String(parsed.title || '').trim() || null,
    hook: String(parsed.hook || '').trim() || null,
    beats,
    script: beats.map(x => x.say).join('\n\n'),
    shot_notes: beats.map(x => `${x.t || '-'} ${x.shot}`.trim()).filter(Boolean).join('\n'),
    word_count: spoken.split(/\s+/).filter(Boolean).length,
    target_words: f.words,
    notes: parsed.notes ? String(parsed.notes) : null,
    unsupported_numbers: unsupportedNumbers(spoken, grounding),
    generated_at: new Date().toISOString(),
    model: MODEL,
  }
}
