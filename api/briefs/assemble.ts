import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { callClaude, robustJson, sanitizeVoice, loadVoiceBlock, loadCorpus, corpusForChannel } from '../_content.js'
import { isoWeekLabel, startOfIsoWeek } from '../_weeks.js'
import { realSource } from '../shifts/detect.js'
import { loadStandingNotes, standingNotesPrompt } from '../_briefNotes.js'

// Weekly brief assembly (Content Engine v2, spec §4). Fri 18:00 UTC.
//
// R9: the brief arrives fully DRAFTED; Krish's job is editorial. One Sonnet
// pass reads the week's corpus (pool headlines + newsletters + Zara) plus the
// live shifts register and writes the MYMU weekly shape: Headlines (with a
// why-line per story), What this actually means (the connective essay, grounded
// in the register), Perspectives (seeded from Krish's own week: bets +
// decisions). Voice is krish-voice + the makeyourmindup corpus mandate. The
// result is one weekly_briefs row (status 'ready', version 1) plus the weekend
// decision cards: brief_review, purge_preview, graduation candidates.
//
//   GET (CRON_SECRET) — Fri 18:00 UTC   ·   POST — manual re-assemble (only
//   while status is 'assembling'/'ready'; never clobbers a brief Krish touched)

interface WeekItem { id: string; idea: string; thesis: string | null; source_url: string | null; day: string; source: string }

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
    .in('status', ['active', 'fading', 'proposed'])
    .order('momentum', { ascending: false })
    .limit(12)
  if (!data?.length) return 'No shifts on the register yet.'
  return data.map(s => `- [${s.status}] ${s.title}: ${s.summary}`).join('\n')
}

async function loadKrishWeek(weekStart: Date): Promise<string> {
  const bits: string[] = []
  const { data: bets } = await supabase
    .from('bets').select('title, hypothesis, status, learning')
    .gte('updated_at', weekStart.toISOString()).limit(5)
  for (const b of bets || []) bits.push(`Bet (${b.status}): ${b.title}. ${b.learning || b.hypothesis || ''}`)
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

  const [voice, corpus, register, krishWeek, standingNotes] = await Promise.all([
    loadVoiceBlock(), loadCorpus(), loadRegisterSummary(), loadKrishWeek(weekStart), loadStandingNotes(),
  ])
  const channelMandate = corpusForChannel(corpus, 'makeyourmindup', 3000)

  const system = [
    'You write the MYMU weekly brief for business leaders making real AI decisions. You write as Krish.',
    voice ? `VOICE:\n${voice}` : '',
    channelMandate ? `CHANNEL MANDATE:\n${channelMandate}` : '',
    standingNotesPrompt(standingNotes),
    'Shape: Headlines (5 to 8 stories, each with a one-line "why it matters" for an operator), then "What this actually means" (the connective essay: find the ONE movement under this week\'s stories, grounded in the shifts register below; 200-350 words), then Perspectives (a sharp first-person take seeded from Krish\'s own week; 80-160 words).',
    'HONESTY: every headline must come from the supplied stories with its real URL. Never invent facts, numbers, companies or quotes. No em dashes anywhere.',
    'Reply ONLY with JSON: {"title":"...","headlines":[{"id":"<story id>","headline":"...","why":"...","url":"...","source":"..."}],"meaning_md":"...","perspectives_md":"..."}',
  ].filter(Boolean).join('\n\n')

  const user = JSON.stringify({
    week,
    stories: items.map(i => ({ id: i.id, day: i.day, headline: i.idea, snippet: (i.thesis || '').slice(0, 200), url: i.source_url, source: i.source })),
    shifts_register: register,
    krish_week: krishWeek,
  })

  const raw = await callClaude({ model: 'claude-sonnet-4-6', maxTokens: 3500, temperature: 0.4, system, user })
  const parsed = robustJson(raw)
  if (!parsed?.title || !Array.isArray(parsed.headlines) || !parsed.meaning_md) {
    throw new Error('assemble: model returned an unusable shape')
  }

  // Ground-check: only keep headlines whose id resolves to a real story; take
  // the URL from OUR row, never the model's.
  const byId = new Map(items.map(i => [i.id, i]))
  const headlines = parsed.headlines
    .map((h: any) => {
      const src = byId.get(String(h?.id))
      if (!src || !h?.headline || !h?.why) return null
      return {
        id: src.id,
        headline: sanitizeVoice(String(h.headline)).slice(0, 200),
        why: sanitizeVoice(String(h.why)).slice(0, 240),
        url: src.source_url,
        source: src.source,
      }
    })
    .filter(Boolean)
  if (headlines.length < 3) throw new Error('assemble: fewer than 3 grounded headlines survived verification')

  const title = sanitizeVoice(String(parsed.title)).slice(0, 120)
  const meaning = sanitizeVoice(String(parsed.meaning_md))
  const perspectives = sanitizeVoice(String(parsed.perspectives_md || ''))

  // Citations live at the END, not inline: each headline carries a small [n]
  // marker and the sources are listed under "## Sources" so the piece reads
  // clean top to bottom (mirrors src/lib/citations.ts, the display contract).
  const body_md = [
    `# ${title}`,
    '',
    '## Headlines',
    ...headlines.map((h: any, i: number) => `- **${h.headline}** [${i + 1}]\n  Why it matters: ${h.why}`),
    '',
    '## What this actually means',
    meaning,
    '',
    '## Perspectives',
    perspectives,
    '',
    '## Sources',
    '',
    ...headlines.map((h: any, i: number) => {
      const label = h.source || 'source'
      return h.url ? `${i + 1}. [${label}](${h.url})` : `${i + 1}. ${label}`
    }),
  ].join('\n')

  const sections = { headlines, meaning_md: meaning, perspectives_md: perspectives }
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
  let force = false
  if (req.method === 'GET') {
    const secret = process.env.CRON_SECRET || ''
    const auth = req.headers.authorization || ''
    if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: 'unauthorized' })
  } else if (req.method === 'POST') {
    force = Boolean((req.body || {}).force)
  } else {
    return res.status(405).json({ ok: false, error: 'GET (cron) or POST only' })
  }
  try {
    const result = await runAssemble(force)
    return res.json({ ok: true, ...result })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}

export const config = { maxDuration: 300 }
