import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { callClaude, robustJson, sanitizeVoice, loadVoiceBlock, loadCorpus, corpusForChannel } from '../_content.js'
import { isoWeekLabel, startOfIsoWeek } from '../_weeks.js'
import { realSource } from '../shifts/detect.js'
import { loadStandingNotes, standingNotesPrompt } from '../_briefNotes.js'
import { goalsSpine } from '../_goals.js'

// Weekly brief assembly (Content Engine v2, spec §4). Fri 18:00 UTC.
//
// R9: the brief arrives fully DRAFTED; Krish's job is editorial. One Sonnet
// pass reads the week's corpus (pool headlines + newsletters + Zara) plus the
// live shifts register and writes the weekly as an INVESTIGATIVE OPINION PIECE,
// not a roundup with a comment bolted on (Krish, 2026-08-08): the week's stories
// are clues, and the piece prosecutes one belief with them, either contradicting
// a widely held view about AI or business building, or confirming a thesis about
// the next twelve months. The lens is commercial and strategic throughout
// (pricing, margin, who pays, build vs buy, competitive position), never model
// capability for its own sake.
//
// Voice is krish-voice + the Mindmaker Live house mandate. The argument order
// is the Signal & Noise rule: steelman the consensus and credit what it gets
// right BEFORE challenging it, so the piece never wins against a strawman. The
// investigation traces a mechanism (the Techonomic register, which ships as the
// Paid format since the 2026-08-11 refocus). The result is one
// weekly_briefs row (status 'ready', version 1) plus the weekend decision
// cards: brief_review, purge_preview, graduation candidates.
//
// NOTE (2026-08-11): this is the internal weekly BRIEF, not the retired "Make
// Your Mind Up" weekly format. The brief is the editorial artifact Krish works
// from; it fans out into the two live formats (Paid, Built) plus channels via
// briefs/[week]/push.ts. Retiring the weekly format did not retire this, and
// the investigative shape above IS the Paid register.
//
//   GET (CRON_SECRET) — Fri 18:00 UTC   ·   POST — manual re-assemble (only
//   while status is 'assembling'/'ready'; never clobbers a brief Krish touched)

interface WeekItem { id: string; idea: string; thesis: string | null; source_url: string | null; day: string; source: string }

// Cut to a length WITHOUT slicing a word in half. The old raw `.slice(240)` on
// the per-clue line is what shipped "you're paying a premium to be outper" into
// a published brief: the sentence simply stopped mid-word. Truncation is still a
// backstop (the prompt sets the real budget), but it now lands on a boundary and
// prefers the last complete sentence.
function clip(input: string, max: number): string {
  const s = input.trim()
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  // Prefer the last complete sentence, provided it keeps at least half the
  // budget. Below that the sentence break is too early to be worth the words it
  // would throw away, so fall back to the last whole word.
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1).trim()
  const word = cut.lastIndexOf(' ')
  return (word > 0 ? cut.slice(0, word) : cut).replace(/[\s,;:]+$/, '').trim()
}

// ── The editorial contract ────────────────────────────────────────────────
// The weekly is an argument, and these three blocks are what make it one. Kept
// as named constants because `revise.ts` has to sharpen the same piece, and a
// preset that does not know the shape flattens it back into a roundup.

const BRIEF_SHAPE = [
  'SHAPE. This is an investigative opinion piece about how AI is actually changing business creation. It is NOT a roundup with a comment attached. The week\'s stories are CLUES, and the piece uses them to prosecute exactly one belief. Write it in this order:',
  '1. TITLE: the claim, not the topic. Someone who reads only the title knows what you are arguing and which way you came down.',
  '2. STANDFIRST, 2 to 3 sentences: the clue the week turned up, the belief it lands on, and your verdict. Start on the load-bearing change. No scene-setting, no "this week in AI".',
  '3. THE CLUES, 5 to 8 stories: each carries one line of INFERENCE, not summary, 35 words at most and finishing its sentence. Say what the story tells a commercial operator that the story itself does not say. If a story only makes sense as evidence for the argument, that is the right reason to include it; if it is merely interesting, leave it out.',
  '4. THE CONSENSUS, 70 to 120 words: state the belief you are testing in its STRONGEST form and credit precisely what it gets right. It is a belief in circulation, never a named person\'s stupidity. A piece that beats a strawman has failed.',
  '5. WHERE THE EVIDENCE LANDS, 300 to 450 words: the investigation. Trace the mechanism, who pays, where the margin moves, what changes in the operating model when this lands. Name the second-order effect, not the obvious one. Then calibrate honestly: if the week only dents the belief rather than breaking it, say exactly that, and say what the evidence cannot support. Overclaiming is the failure this section exists to prevent.',
  '6. THE NEXT TWELVE MONTHS, 100 to 160 words: the thesis this confirms or forces, with its commercial consequence and the specific thing to watch that would prove it early. Use the shifts register momentum, an accelerating shift earns a firmer claim than a fading one. Close on a forward verdict. Never "time will tell", never a summary, never a question.',
  '7. MY POSITION, 80 to 140 words, first person, grounded in the krish_week material supplied: the move you are making or the bet you are holding because of this. This is the section nobody else could write, so it needs a real decision in it, not a restatement of the argument.',
].join('\n')

const BRIEF_LENS = [
  'LENS. Commercialisation and corporate strategy, throughout. The material is pricing, margin, cost structure, who pays and who captures, buying behaviour, build versus buy, capital allocation, org design, distribution and competitive position.',
  'Model capability is only interesting where it moves one of those. Benchmark scores, parameter counts and demo quality are not the subject.',
  'The antagonist is an incentive or a failing model, never a person or a company as a villain. Sharp with ideas, warm with people.',
  'STANCE. Pick ONE and commit: either the week CONTRADICTS a widely held belief about AI or business building, or it CONFIRMS a thesis about the next twelve months. Do not attempt both, and do not hedge between them.',
].join('\n')

const BRIEF_HONESTY = [
  'HONESTY: every clue must come from the supplied stories, cited by its real id. Never invent facts, numbers, companies, quotes or dates. Where the week leaves a gap in the argument, name the gap.',
  'FORMAT: only THE CLUES uses a bulleted list. Every other section is plain paragraphs, with no bullets and no bold text anywhere in them (bold bullets carry the citation markers, so bold outside the clues breaks the numbering).',
  'No em dashes anywhere.',
].join('\n')

// `headlines` keeps its historic key: it is the clue list, and every stored
// brief plus the factory payload already reads that name.
const BRIEF_JSON = '{"title":"...","stance":"contradicts"|"confirms","belief":"the one belief being contradicted, or the twelve-month thesis being confirmed, in a single sentence","standfirst":"...","headlines":[{"id":"<story id>","headline":"...","why":"the inference, one line","url":"...","source":"..."}],"consensus_md":"...","evidence_md":"...","next_year_md":"...","position_md":"..."}'

/** Name the first missing piece of the contract, or '' when the shape is good. */
function shapeFault(p: any): string {
  if (!p || typeof p !== 'object') return 'not JSON'
  if (!p.title) return 'no title'
  if (!Array.isArray(p.headlines) || p.headlines.length < 3) return 'fewer than 3 clues'
  if (!p.belief) return 'no belief named, so there is nothing being argued'
  if (!p.standfirst) return 'no standfirst, so the verdict is buried'
  if (!p.evidence_md) return 'no investigation section'
  if (!p.next_year_md) return 'no twelve-month section'
  return ''
}

async function loadWeekItems(weekStart: Date): Promise<WeekItem[]> {
  const { data, error } = await supabase
    .from('content_ideas')
    .select('id, idea, thesis, source_snippet, source_url, source_type, source_captured_at, created_at, meta, state')
    .in('source_type', ['pool_headline', 'inspiration_sweep', 'zara_signal', 'signal_inbox'])
    .not('state', 'in', '("dropped","absorbed")')
    .gte('created_at', weekStart.toISOString())
    .limit(600)
  if (error) throw new Error(error.message)
  return (data || []).map((r: any) => ({
    id: r.id,
    idea: r.idea,
    thesis: r.thesis || r.source_snippet || null,
    source_url: r.source_url || null,
    day: String(r.source_captured_at || r.created_at).slice(0, 10),
    source: realSource(r),
  }))
}

async function loadRegisterSummary(): Promise<string> {
  const { data } = await supabase
    .from('shifts')
    .select('title, summary, implication, status, momentum')
    // Merged arcs are kept rather than deleted so a merge is reversible
    // (api/shifts/[id].ts). Excluded here or a folded arc reappears.
    .is('superseded_by', null)
    .in('status', ['active', 'fading', 'proposed'])
    .order('momentum', { ascending: false })
    .limit(12)
  if (!data?.length) return 'No shifts on the register yet.'
  // The implication and the momentum score are the whole point of the register
  // for this piece: the implication is the standing thesis the week either
  // confirms or dents, and momentum is the trajectory that makes a twelve-month
  // claim more than a guess. Both were being selected and then dropped, so the
  // model was arguing from titles alone.
  return data.map(s => [
    `- [${s.status}, momentum ${s.momentum ?? 0}] ${s.title}: ${s.summary}`,
    s.implication ? `  standing implication: ${s.implication}` : '',
  ].filter(Boolean).join('\n')).join('\n')
}

async function loadKrishWeek(weekStart: Date): Promise<string> {
  const bits: string[] = []
  const { data: bets } = await supabase
    // `bets` has no title column — the label is the hypothesis.
    .from('bets').select('hypothesis, status, learning')
    .gte('updated_at', weekStart.toISOString()).limit(5)
  for (const b of bets || []) bits.push(`Bet (${b.status}): ${b.hypothesis}${b.learning ? `. ${b.learning}` : ''}`)
  const { data: decisions } = await supabase
    .from('content_decisions').select('kind, payload, resolution')
    .eq('status', 'done').gte('resolved_at', weekStart.toISOString()).limit(5)
  for (const d of decisions || []) bits.push(`Ruling: ${d.kind} on "${(d.payload as any)?.title || ''}"`)
  return bits.length ? bits.join('\n') : 'Quiet week internally.'
}

export async function runAssemble(force = false) {
  const week = isoWeekLabel()
  const weekStart = startOfIsoWeek()

  const { data: existing } = await supabase.from('weekly_briefs').select('id, status').eq('week', week).single()
  if (existing && !['assembling', 'ready'].includes(existing.status) && !force) {
    return { week, skipped: `brief already ${existing.status}; not clobbering Krish's work` }
  }

  const items = await loadWeekItems(weekStart)
  if (items.length < 5) {
    return { week, items: items.length, skipped: 'fewer than 5 items this week (honest skip)' }
  }

  const [voice, corpus, register, krishWeek, standingNotes, goals] = await Promise.all([
    loadVoiceBlock(), loadCorpus(), loadRegisterSummary(), loadKrishWeek(weekStart), loadStandingNotes(),
    goalsSpine('choosing what the brief argues this week'),
  ])
  const channelMandate = corpusForChannel(corpus, 'mindmaker_live', 3000)

  const system = [
    'You write the Mindmaker Live weekly brief for business leaders making real AI decisions. You write as Krish.',
    voice ? `VOICE:\n${voice}` : '',
    channelMandate ? `CHANNEL MANDATE:\n${channelMandate}` : '',
    standingNotesPrompt(standingNotes),
    goals.prompt,
    BRIEF_SHAPE,
    BRIEF_LENS,
    BRIEF_HONESTY,
    `Reply ONLY with JSON, no preamble: ${BRIEF_JSON}`,
  ].filter(Boolean).join('\n\n')

  const user = JSON.stringify({
    week,
    stories: items.map(i => ({ id: i.id, day: i.day, headline: i.idea, snippet: (i.thesis || '').slice(0, 200), url: i.source_url, source: i.source })),
    shifts_register: register,
    krish_week: krishWeek,
  })

  // One retry, and only one. The shape is stricter than it was (a piece with no
  // named belief is the roundup this brief exists to stop being), so a miss is
  // worth a second pass with the failure named. Two misses is a real fault and
  // throws: the cron surfaces it and POST re-assembles on demand.
  let parsed: any = null
  let shapeError = ''
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const raw = await callClaude({
      model: 'claude-sonnet-4-6',
      maxTokens: 5000,
      temperature: 0.4,
      system: attempt === 0 ? system : `${system}\n\nYour last reply was rejected: ${shapeError}. Return the full JSON with every required field.`,
      user,
    })
    const candidate = robustJson(raw)
    shapeError = shapeFault(candidate)
    if (!shapeError) parsed = candidate
  }
  if (!parsed) throw new Error(`assemble: model returned an unusable shape (${shapeError})`)

  // Ground-check: only keep headlines whose id resolves to a real story; take
  // the URL from OUR row, never the model's.
  const byId = new Map(items.map(i => [i.id, i]))
  const headlines = parsed.headlines
    .map((h: any) => {
      const src = byId.get(String(h?.id))
      if (!src || !h?.headline || !h?.why) return null
      return {
        id: src.id,
        headline: clip(sanitizeVoice(String(h.headline)), 200),
        why: clip(sanitizeVoice(String(h.why)), 320),
        url: src.source_url,
        source: src.source,
      }
    })
    .filter(Boolean)
  if (headlines.length < 3) throw new Error('assemble: fewer than 3 grounded headlines survived verification')

  const title = clip(sanitizeVoice(String(parsed.title)), 120)
  const stance = parsed.stance === 'confirms' ? 'confirms' : parsed.stance === 'contradicts' ? 'contradicts' : null
  const belief = clip(sanitizeVoice(String(parsed.belief || '')), 300)
  const standfirst = sanitizeVoice(String(parsed.standfirst || ''))
  const consensus = sanitizeVoice(String(parsed.consensus_md || ''))
  // `meaning_md` keeps its name in storage: it is what the factory reads as the
  // contrarian angle and what every existing brief carries.
  const meaning = sanitizeVoice(String(parsed.evidence_md || parsed.meaning_md || ''))
  const nextYear = sanitizeVoice(String(parsed.next_year_md || ''))
  const position = sanitizeVoice(String(parsed.position_md || parsed.perspectives_md || ''))

  // Citations live at the END, not inline: each clue carries a small [n] marker
  // and the sources are listed under "## Sources" so the piece reads clean top
  // to bottom (mirrors src/lib/citations.ts, the display contract).
  //
  // The clue bullets must stay the ONLY bold list items in the body. Markers are
  // re-attached by position in src/lib/citations.ts, so a bold bullet anywhere
  // above or between them silently shifts every citation by one.
  const body_md = [
    `# ${title}`,
    '',
    standfirst,
    '',
    '## The clues',
    ...headlines.map((h: any, i: number) => `- **${h.headline}** [${i + 1}]\n  What it tells you: ${h.why}`),
    '',
    '## The consensus',
    consensus,
    '',
    '## Where the evidence lands',
    meaning,
    '',
    '## The next twelve months',
    nextYear,
    '',
    '## My position',
    position,
    '',
    '## Sources',
    '',
    ...headlines.map((h: any, i: number) => {
      const label = h.source || 'source'
      return h.url ? `${i + 1}. [${label}](${h.url})` : `${i + 1}. ${label}`
    }),
  ].join('\n').replace(/\n{3,}/g, '\n\n')

  const sections = {
    headlines,
    stance,
    belief,
    standfirst,
    consensus_md: consensus,
    meaning_md: meaning,
    next_year_md: nextYear,
    position_md: position,
    // Read by any surface still expecting the old key set.
    perspectives_md: position,
  }
  const stats = {
    stories_read: items.length,
    headlines: headlines.length,
    assembled_by: 'engine',
  }
  const nowIso = new Date().toISOString()
  const version = { v: 1, at: nowIso, source: 'engine', body_md }

  const briefRow = {
    week, title, status: 'ready', sections, body_md,
    versions: [version], stats, assembled_at: nowIso,
  }
  const { data: brief, error: upErr } = existing
    ? await supabase.from('weekly_briefs').update(briefRow).eq('id', existing.id).select('id').single()
    : await supabase.from('weekly_briefs').insert(briefRow).select('id').single()
  if (upErr || !brief) throw new Error(upErr?.message || 'brief upsert failed')

  // The weekend decision cards. Dedupe via the (week, kind, ref) unique index.
  await supabase.from('content_decisions').upsert(
    { week, kind: 'brief_review', ref: brief.id, payload: { title, headlines: headlines.length } },
    { onConflict: 'week,kind,ref', ignoreDuplicates: true },
  )
  const { count: expiring } = await supabase
    .from('content_ideas')
    .select('id', { count: 'exact', head: true })
    .not('expires_at', 'is', null)
    .is('shift_id', null)
    .is('library_at', null)
    .lte('expires_at', new Date(Date.now() + 4 * 86_400_000).toISOString())
  await supabase.from('content_decisions').upsert(
    { week, kind: 'purge_preview', ref: brief.id, payload: { expiring: expiring ?? 0 } },
    { onConflict: 'week,kind,ref', ignoreDuplicates: true },
  )

  // Graduation candidates: evergreen-horizon pieces still alive, or protected.
  const { data: evergreens } = await supabase
    .from('content_ideas')
    .select('id, idea, state')
    .eq('horizon', 'evergreen')
    .is('library_at', null)
    .not('state', 'in', '("dropped","absorbed","published")')
    .limit(3)
  for (const e of evergreens || []) {
    await supabase.from('content_decisions').upsert(
      { week, kind: 'graduation', ref: e.id, payload: { title: e.idea, state: e.state } },
      { onConflict: 'week,kind,ref', ignoreDuplicates: true },
    )
  }

  return { week, brief_id: brief.id, items: items.length, headlines: headlines.length, expiring: expiring ?? 0 }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (guardCronRoute(req, res)) return
  const force = req.method === 'POST' ? Boolean((req.body || {}).force) : false
  try {
    const result = await runAssemble(force)
    return res.json({ ok: true, ...result })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}

export const config = { maxDuration: 300 }
