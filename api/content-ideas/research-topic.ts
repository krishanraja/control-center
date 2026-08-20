import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import {
  callClaude, corpusForChannel, loadCorpus, loadVoiceBlock, preamble, robustJson, sanitizeVoice, slug,
} from '../_content.js'
import { webResearch } from '../_enrich.js'
import { canonicalUrl, titleNorm, contentHash } from '../_text.js'

// POST /api/content-ideas/research-topic
//   body: { topic, format?: 'paid'|'built', angle?: string, web?: boolean,
//           materials?: [{title,content,url}] }
//
// "Go and research this, then come back with something I can work on."
//
// ── THE GAP THIS FILLS ───────────────────────────────────────────────────
// Every other way an idea entered the system was something the machine found
// on its own: inspiration_sweep, lane_sourcing, pool_headline,
// synthesis_hypothesis, a zara_signal. Quick capture existed, but it either
// handed the text to the n8n capture workflow or fell back to storing the raw
// line at state 'seeded'. Nothing anywhere took a topic Krish named and went
// and researched it. dive-deeper researches a sub-question of an idea that
// already exists, which is the step after this one, not this one.
//
// It also accepts research Krish brings himself. Pasted material is attached to
// the piece as durable materials (the same meta.materials[] the composer and
// revise already read) AND folded into the synthesis, so "research this for me"
// and "here is my own research on this" land in exactly the same place and go
// through exactly the same steps afterwards: transform to a format, cut for a
// channel, push to Cleo.

const MAX_MATERIAL = 400_000

interface Synth {
  title?: string
  thesis?: string
  body?: string
  why_non_obvious?: string
  falsifiable_test?: string
  named_entities?: string[]
  gaps?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return

  const b = (req.body || {}) as {
    topic?: string
    format?: string
    angle?: string
    materials?: { title?: string; content?: string; url?: string }[]
    /** Search the web as well. Omit to keep the original behaviour, where
     *  supplying your own material means you did not want a search. */
    web?: boolean
  }
  const topic = String(b.topic || '').trim()
  if (topic.length < 8) {
    return res.status(400).json({ ok: false, error: 'topic required (at least 8 characters)' })
  }
  const format = b.format === 'paid' || b.format === 'built' ? b.format : null
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' })
  }

  // Krish's own material, when he brought some. Stored in the SAME shape
  // /materials writes, so the composer surfaces it and revise grounds on it
  // without any special casing for "research that came from Krish".
  const ownMaterials = (b.materials || [])
    .filter(m => (m?.content || m?.url))
    .slice(0, 8)
    .map(m => ({
      id: `mat_${slug(String(m.title || m.url || 'material')).slice(0, 24)}_${Math.abs(hash(String(m.content || m.url || ''))).toString(36)}`,
      kind: m.content ? 'paste' : 'link',
      title: String(m.title || m.url || 'Pasted research').slice(0, 200),
      content: String(m.content || '').slice(0, MAX_MATERIAL),
      url: m.url ? String(m.url).slice(0, 2000) : null,
      added_at: new Date().toISOString(),
    }))

  // Three angles on the same topic, so the research is not one query deep.
  // Skipped entirely when Krish supplied his own material and asked for no
  // extra digging, which is the "ingest my own research" path.
  // Bringing your own research used to silently mean "and do not search",
  // which is right for an ingest and wrong when you have one source and want
  // it checked against the record. `web` makes it a choice; without it the
  // original behaviour stands, so existing callers are unaffected.
  const wantWeb = typeof b.web === 'boolean'
    ? b.web
    : (b.materials?.length ? ownMaterials.length === 0 : true)
  const queries = [
    `${topic}. What actually happened, with named companies, real numbers and dates.`,
    format === 'paid'
      ? `${topic}. Who is paying, who is collecting, and what it does to pricing, margin and unit economics. Name the parties.`
      : `${topic}. Who has actually built or shipped something here, and what specifically they built.`,
    `${topic}. The strongest counterargument, and what the evidence does NOT yet show.`,
  ]

  const findings: { query: string; text: string; sources: string[] }[] = []
  if (wantWeb) {
    const results = await Promise.all(queries.map(q => webResearch(q).catch(() => ({ text: '', sources: [] }))))
    results.forEach((r, i) => { if (r.text) findings.push({ query: queries[i], text: r.text, sources: r.sources }) })
  }

  if (!findings.length && !ownMaterials.length) {
    // Refuse rather than write a confident-sounding idea with nothing under it.
    return res.status(502).json({
      ok: false,
      error: 'no_research',
      hint: 'No web research came back and no material was supplied. Check PERPLEXITY_API_KEY / EXA_API_KEY / BRAVE_API_KEY, or paste your own research in the materials field.',
    })
  }

  const citations = [...new Set(findings.flatMap(f => f.sources).filter(Boolean))].slice(0, 20)
  const [voice, corpus] = await Promise.all([loadVoiceBlock(), loadCorpus()])
  const formatCorpus = format ? corpusForChannel(corpus, format) : ''

  const system = [
    voice,
    formatCorpus ? `\n\nFORMAT PLAYBOOK (write toward THIS format's mandate and evidence bar):\n${formatCorpus}` : '',
    '\n\nYou are turning research into one publishable idea with a real argument. ' +
    'Ground every claim in the findings supplied. Never invent a company, a number or a date. ' +
    'Where the evidence is thin or contradictory, say so in "gaps" rather than papering over it, and keep it out of the body. ' +
    'No em dashes.',
  ].filter(Boolean).join('')

  const researchBlock = [
    ...findings.map(f => `FINDING (${f.query}):\n${f.text}`),
    ...ownMaterials.map(m => `KRISH'S OWN MATERIAL (${m.title}):\n${(m.content || m.url || '').slice(0, 6000)}`),
  ].join('\n\n')

  let text: string
  try {
    text = await callClaude({
      model: 'claude-sonnet-4-6',
      system,
      user:
        `TOPIC KRISH ASKED FOR: ${topic}\n` +
        `${format ? `FORMAT: ${format}\n` : ''}` +
        `${b.angle ? `HIS STEER ON THE ANGLE: ${b.angle}\n` : ''}` +
        `\nRESEARCH:\n${researchBlock.slice(0, 24_000)}\n\n` +
        'Return ONLY a single JSON object: ' +
        '{"title":string,"thesis":string,"body":string,"why_non_obvious":string,' +
        '"falsifiable_test":string,"named_entities":[string],"gaps":string|null}. ' +
        'body is 500-900 words, the argument written out with its evidence. ' +
        'falsifiable_test is the thing that would have to be true for this to be wrong.',
      maxTokens: 5000,
      temperature: 0.55,
      timeoutMs: 120_000,
    })
  } catch (e) {
    return res.status(502).json({ ok: false, error: String((e as Error)?.message || e).slice(0, 200) })
  }

  const s = (robustJson(text) || {}) as Synth
  const title = sanitizeVoice(String(s.title || topic)).slice(0, 300)
  const body = sanitizeVoice(String(s.body || '')).trim()
  if (!body) return res.status(502).json({ ok: false, error: 'empty_generation' })

  const row = {
    idea: title,
    thesis: s.thesis ? sanitizeVoice(String(s.thesis)).slice(0, 2000) : null,
    body,
    // Researched with a real argument written out, so it is genuinely at
    // 'drafting'. Calling this 'seeded' would put a finished draft behind two
    // more clicks for no reason; calling it 'review' would cross a human gate
    // the machine is not allowed to cross.
    state: 'drafting',
    source_type: 'requested_research',
    source_url: citations[0] || null,
    source_snippet: sanitizeVoice(String(s.thesis || topic)).slice(0, 500),
    source_captured_at: new Date().toISOString(),
    lane: format ? 'mindmaker_live' : null,
    lane_slot: format,
    origin: 'user',
    distribution: [],
    meta: {
      research: citations,
      sources: citations,
      requested_topic: topic,
      angle_hint: b.angle || null,
      why_non_obvious: s.why_non_obvious || null,
      falsifiable_test: s.falsifiable_test || null,
      named_entities: Array.isArray(s.named_entities) ? s.named_entities.slice(0, 20) : [],
      research_gaps: s.gaps || null,
      generated_by: 'research-topic',
      deep_dives: findings.map(f => ({
        query: f.query,
        findings: f.text.slice(0, 4000),
        citations: f.sources,
        at: new Date().toISOString(),
      })),
      materials: ownMaterials,
    },
    canonical_url: canonicalUrl(citations[0] || null),
    title_norm: titleNorm(title),
    content_hash: contentHash(body.slice(0, 280)),
    concept_id: `concept:content:requested:${slug(title)}`,
  }

  const { data: ins, error } = await supabase
    .from('content_ideas').insert(row).select('id,idea,state,lane,lane_slot').single()
  if (error) return res.status(500).json({ ok: false, error: error.message })

  return res.status(200).json({
    ok: true,
    idea: ins,
    citations: citations.length,
    queriesRun: findings.length,
    materialsAttached: ownMaterials.length,
    gaps: s.gaps || null,
  })
}

/** Small stable hash for material ids. Not security relevant. */
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0 }
  return h
}

// Three web-research calls plus a long synthesis.
export const config = { maxDuration: 300 }
