import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'node:crypto'
import { supabase } from '../../_supabase.js'
import { webResearch } from '../../_enrich.js'
import { unsupportedNumbers } from '../../_numbers.js'
import {
  callClaude, corpusForChannel, loadCorpus, readMaterials, robustJson, type Material,
} from '../../_content.js'

// POST /api/content-ideas/:id/deepen   body: { format?: 'paid' | 'built' }
//
// The deep research pass behind the Paid and Built buttons.
//
// Choosing a format used to change how a piece was WRITTEN and, at push time,
// which Google Doc it became. It never changed how hard the topic was dug
// into, so "make it a Paid piece" restyled an argument that had whatever
// evidence the original happened to carry. This runs the format's own
// investigation instead, and the two ask genuinely different questions:
//
//   Paid  — follow the money, and follow it THROUGH TIME. Who pays, who
//           collects, what the price was a year ago against what it is now,
//           what that does to margin, how buying behaviour moved, and where
//           the economics do not hold.
//   Built — find the people who actually shipped it. What they built, the
//           stack, the cost, the time, what broke, and what it replaced.
//
// Both end in a comparison, and the comparison is the point: a fixed column
// set per format, the same columns for every subject, so two approaches are
// read on the same axes rather than described one after the other. A model
// asked to "compare" without fixed columns will happily give three rows with
// three different shapes, which is prose in a table costume. Where the record
// is silent the cell says "unknown" and the row stays; dropping the row is how
// a comparison quietly becomes a highlight reel of whoever published most.
//
// Findings attach as a material (kind 'research'), so they ground later drafts
// and ride into the Google Doc without being re-pasted, exactly as dive-deeper
// does. Nothing here writes the piece.

type Format = 'paid' | 'built'

const COLUMNS: Record<Format, string[]> = {
  // Money, and how it MOVES. price_before against price_now is the axis the
  // whole format exists for; a snapshot of today's pricing is a fact sheet.
  paid: ['subject', 'who_pays', 'what_they_buy', 'unit_of_revenue', 'price_before', 'price_now', 'direction', 'margin_effect', 'source'],
  built: ['subject', 'what_they_built', 'stack', 'cost', 'time_to_ship', 'what_broke', 'what_it_replaced', 'source'],
}

const MIN_ROWS: Record<Format, number> = { paid: 2, built: 3 }

function queriesFor(format: Format, topic: string): string[] {
  if (format === 'paid') {
    return [
      `${topic}. Who pays, who collects, and what the unit of revenue actually is. Name the parties.`,
      `${topic}. Pricing over time: what this cost 12 to 24 months ago against what it costs now, with dated figures and the direction of travel.`,
      `${topic}. The effect on gross margin and unit economics, with named companies and real numbers.`,
      `${topic}. At least two named companies approaching this differently, with enough detail to compare them on the same axes.`,
      `${topic}. How buyer or consumer behaviour is changing as a result, with data rather than assertion.`,
      `${topic}. The strongest counter-case: where these economics do not hold, which numbers are disputed, and what the public record does not show.`,
    ]
  }
  return [
    `${topic}. Who has actually shipped something real here. Named people and products, with links to the thing itself.`,
    `${topic}. The build itself: stack, tools, sequence, time to ship, and what it cost.`,
    `${topic}. At least three different implementations of this, with enough detail to compare them on the same axes.`,
    `${topic}. What broke, what was abandoned, and what did not work as planned. Post-mortems and honest write-ups.`,
    `${topic}. What this replaced, and the measured difference before and after.`,
  ]
}

const SYSTEM = (format: Format) => [
  'You are a research analyst assembling evidence for an investigative piece. You do not write the piece.',
  format === 'paid'
    ? 'The subject is HOW MONEY MOVES: who pays, who collects, what the price was and what it is now, and what that does to margin and behaviour. An announcement, a launch or a funding round is not the story unless it repriced something. Second-order economic effects are the story.'
    : 'The subject is WHAT PEOPLE ACTUALLY BUILT: the artifact, the stack, the cost, the time, the friction. A description of a category is not evidence. One named person shipping one real thing beats any amount of market commentary.',
  `Return JSON only: {"comparison": [...], "findings": string, "open_question": string, "gaps": string[]}`,
  `Every object in "comparison" MUST have exactly these keys, in this order: ${COLUMNS[format].join(', ')}.`,
  `Aim for at least ${MIN_ROWS[format]} rows. Compare like for like: the same columns for every subject, filled from the same kind of evidence.`,
  'Where the record does not say, the value is the literal string "unknown". Never estimate into the gap, never infer a number from a neighbouring one, and never drop a row because it is incomplete: an incomplete row is evidence about the record, and dropping it turns a comparison into a highlight reel of whoever published most.',
  '"source" is the URL the row rests on. If a row rests on more than one, use the strongest.',
  '"findings" is prose: what the evidence actually shows, with named companies, dated events and figures attributed to whoever produced them. "open_question" is the one thing the evidence leaves genuinely unresolved. "gaps" lists what you looked for and could not find.',
  'HONESTY: every number must appear in the research provided. Do not compute totals, differences, percentages or rates, even when the arithmetic looks obvious. Do not invent companies, people or quotes.',
  'No em dashes. Use commas, periods or parentheses.',
].join('\n\n')

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const raw = req.query?.id
  const ideaId = Array.isArray(raw) ? raw[0] : raw
  if (!ideaId) return res.status(400).json({ ok: false, error: 'id required' })

  const b = (req.body || {}) as { format?: string }

  const { data: idea, error: iErr } = await supabase
    .from('content_ideas').select('id, idea, thesis, body, meta, lane, lane_slot').eq('id', ideaId).single()
  if (iErr || !idea) return res.status(404).json({ ok: false, error: 'idea not found' })

  const asked = (b.format || idea.lane_slot || 'paid') as string
  if (asked !== 'paid' && asked !== 'built') {
    return res.status(400).json({ ok: false, error: "format must be 'paid' or 'built'" })
  }
  const format: Format = asked

  const topic = [idea.idea, idea.thesis].filter(Boolean).join('. ').slice(0, 400)
  if (!topic.trim()) return res.status(409).json({ ok: false, error: 'no_topic', hint: 'Give the piece a title or a thesis first.' })

  // One query per axis, in parallel. Each provider failure degrades to empty
  // rather than taking the pass down, but if every axis comes back empty there
  // is nothing to compare and saying so beats writing a table from priors.
  const queries = queriesFor(format, topic)
  const results = await Promise.all(
    queries.map(q => webResearch(q).catch(() => ({ text: '', sources: [] as string[] }))),
  )
  const grounded = results.map((r, i) => (r.text ? `### ${queries[i]}\n${r.text}` : '')).filter(Boolean).join('\n\n')
  const sources = Array.from(new Set(results.flatMap(r => r.sources).filter(Boolean)))
  if (!grounded.trim()) {
    return res.status(502).json({
      ok: false,
      error: 'no_research',
      hint: 'Every research query came back empty. Check PERPLEXITY_API_KEY, then try again.',
    })
  }

  const corpus = await loadCorpus().catch(() => '')
  const playbook = corpusForChannel(corpus, format)

  let parsed: { comparison?: any[]; findings?: string; open_question?: string; gaps?: string[] }
  try {
    const out = await callClaude({
      timeoutMs: 120_000,
      model: 'claude-sonnet-4-6',
      temperature: 0.3,
      maxTokens: 5000,
      system: [SYSTEM(format), playbook ? `FORMAT PLAYBOOK (the mandate and evidence bar this is being gathered for):\n${playbook}` : ''].filter(Boolean).join('\n\n'),
      user: `TOPIC: ${topic}\n\nRESEARCH:\n${grounded.slice(0, 60_000)}`,
    })
    parsed = robustJson(out) || {}
  } catch (e: unknown) {
    return res.status(502).json({ ok: false, error: 'synthesis_failed', detail: String((e as Error)?.message || e) })
  }

  // Normalise every row to the format's columns. A model that returns extra
  // keys on one row and misses them on another has produced prose in a table
  // costume, and the whole point of this pass is that the rows line up.
  const cols = COLUMNS[format]
  const comparison = (Array.isArray(parsed.comparison) ? parsed.comparison : [])
    .map((row: any) => Object.fromEntries(cols.map(c => [c, String(row?.[c] ?? 'unknown').trim() || 'unknown'])))
    .filter(row => row.subject && row.subject !== 'unknown')

  // Same check channel-cut runs, for the same reason: the prompt forbids
  // arithmetic and the model obeys until it quietly does not.
  const written = [parsed.findings || '', ...comparison.map(r => cols.map(c => r[c]).join(' '))].join('\n')
  const unsupported = unsupportedNumbers(written, `${grounded} ${sources.join(' ')}`)

  const at = new Date().toISOString()
  const meta = (idea.meta || {}) as any
  const entry = {
    format, topic, at,
    columns: cols,
    comparison,
    findings: parsed.findings || '',
    open_question: parsed.open_question || '',
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
    sources,
    unsupported_numbers: unsupported,
  }

  const table = comparison.length
    ? [cols.join(' | '), cols.map(() => '---').join(' | '), ...comparison.map(r => cols.map(c => r[c]).join(' | '))].join('\n')
    : ''
  const material: Material = {
    id: randomUUID(),
    kind: 'research',
    title: `${format === 'paid' ? 'Paid' : 'Built'} deep research`,
    content: [entry.findings, table && `Comparison:\n${table}`, entry.open_question && `Open question: ${entry.open_question}`, sources.length && `Sources:\n${sources.join('\n')}`]
      .filter(Boolean).join('\n\n'),
    url: null,
    bytes: grounded.length,
    at,
  }

  const { error: uErr } = await supabase
    .from('content_ideas')
    .update({
      meta: {
        ...meta,
        deepen: [...(Array.isArray(meta.deepen) ? meta.deepen : []), entry].slice(-6),
        research: Array.from(new Set([...(Array.isArray(meta.research) ? meta.research : []), ...sources])),
        materials: [material, ...readMaterials(meta)].slice(0, 40),
      },
      updated_at: at,
    })
    .eq('id', ideaId)
  if (uErr) return res.status(500).json({ ok: false, error: uErr.message })

  return res.status(200).json({ ok: true, entry, material })
}

export const config = { maxDuration: 300 }
