// _content — shared helpers for the Content Engine API routes
// (revise / challenge / score / push-to-cleo). Mirrors the inline helpers in
// transform.ts but de-duplicated, since four routes need the same primitives.

import { supabase } from './_supabase.js'

/** Strip the cardinal sin — em dashes (and their lookalikes) — anywhere,
 *  replacing them with the comma/period Krish would actually use. Safe to run
 *  on any draft before it is shown, saved, or sent to the factory. Leaves
 *  hyphenated words and numeric en-dash ranges (2020–2024) intact. */
export function sanitizeVoice(input: string): string {
  if (!input) return input
  let t = String(input)
  // Em dash / horizontal bar / double-hyphen-as-dash -> comma.
  t = t.replace(/\s*[—―]\s*/g, ', ')
  t = t.replace(/(\S)\s+--\s+(\S)/g, '$1, $2')
  // En dash: keep numeric ranges (2020–2024), otherwise treat as a dash.
  t = t.replace(/(\d)\s*–\s*(\d)/g, '$1-$2')
  t = t.replace(/\s*–\s*/g, ', ')
  // Tidy the artefacts a comma swap can create.
  t = t.replace(/(^|\n)\s*,\s*/g, '$1')   // no line starting with a comma
  t = t.replace(/,\s*,/g, ',')
  t = t.replace(/\s+,/g, ',')
  t = t.replace(/,\s*([.!?;:])/g, '$1')   // ", ." -> "."
  t = t.replace(/([.!?])\s*,\s+/g, '$1 ') // ". ," -> ". "
  return t
}

export interface Material {
  id: string
  kind: 'paste' | 'link' | 'file' | 'research'
  title?: string | null
  content?: string | null
  url?: string | null
  bytes?: number
  at?: string
}

/** Read the materials a piece carries (lives in content_ideas.meta.materials). */
export function readMaterials(meta: any): Material[] {
  const m = meta && Array.isArray(meta.materials) ? meta.materials : []
  return m.filter((x: any) => x && typeof x === 'object')
}

/** Compact the corpus into a grounding block for the model. Truncates each item
 *  and the whole block so a large corpus never blows the context budget. */
export function materialsContext(materials: Material[], perItem = 2400, total = 9000): string {
  if (!materials.length) return ''
  const parts: string[] = []
  let used = 0
  for (const m of materials) {
    const head = m.title ? `### ${m.title}` : `### ${m.kind} material`
    const bodyRaw = m.kind === 'link' ? (m.url || '') : (m.content || '')
    const body = bodyRaw.slice(0, perItem)
    const block = `${head}\n${body}`.trim()
    if (used + block.length > total) { parts.push(`${head}\n[trimmed — ${bodyRaw.length} chars]`); break }
    parts.push(block); used += block.length
  }
  return `BACKGROUND MATERIALS Krish provided (his own research — treat as primary source, ground claims in it, never invent beyond it):\n\n${parts.join('\n\n')}`
}

export function slug(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
}

/** Tolerant JSON extraction from an LLM text response (handles ```json fences). */
export function robustJson(txt: string): any {
  let t = String(txt || '').trim()
  if (t.startsWith('```')) t = t.split('```')[1].replace(/^json/, '').trim()
  try { return JSON.parse(t) } catch { /* fallthrough */ }
  const i = t.indexOf('{'), j = t.lastIndexOf('}')
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)) } catch { /* noop */ } }
  return null
}

export function parseVal(v: unknown): any {
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return v } }
  return v
}

/** Load one or more system_config values by exact key. Returns key -> parsed value. */
export async function loadConfig(keys: string[]): Promise<Record<string, any>> {
  const { data } = await supabase.from('system_config').select('key,value').in('key', keys)
  const out: Record<string, any> = {}
  for (const r of data || []) out[(r as any).key] = parseVal((r as any).value)
  return out
}

/** The krish voice block (system_config.content_voice_block), for grounding rewrites. */
export async function loadVoiceBlock(): Promise<string> {
  const c = await loadConfig(['content_voice_block'])
  const v = c['content_voice_block']
  return typeof v === 'string' ? v : (v ? JSON.stringify(v) : '')
}

/** The channel corpus (system_config.content_corpus), for the Five Standards gate. */
export async function loadCorpus(): Promise<string> {
  const c = await loadConfig(['content_corpus'])
  const v = c['content_corpus']
  return typeof v === 'string' ? v : (v ? JSON.stringify(v) : '')
}

// ── Channel-aware corpus slicing ──────────────────────────────────────────
// The corpus is one long markdown doc (the Five Standards + five channel
// playbooks + cross-channel rules). Feeding the whole thing into every
// drafting/revision call would blow the context budget, so for the iterative
// surfaces (Cleo chat, Refine) we hand the model only the sections that bear on
// the channel it is actually writing for: the Five Standards (always), the one
// matching channel playbook, and the cross-channel rules. The score gate still
// loads the full corpus — it is grading against every standard.

/** venture (+format) -> the corpus playbook key that applies.
 *
 *  The venture/format/channel split (Krish 2026-08-06): venture answers "what am
 *  I working on", format answers "what shape is this", channel answers "where
 *  does it go". Before this, `lane` fused venture and channel, which is why
 *  signal_noise and builder_economy existed as both a venture and a lane. */
export function laneToCorpusChannel(lane?: string | null, slot?: string | null): string | null {
  if (lane === 'signal_noise') return 'signal_noise'
  if (lane === 'builder_economy') return 'built'
  if (lane === 'mymu') {
    // Teardown carries the investigation playbook and its harder bar. The slot
    // key stays 'investigation' to match content_cadence and venture_formats.
    if (slot === 'teardown' || slot === 'investigation') return 'investigation'
    if (slot === 'built') return 'built'
    if (slot === 'weekly') return 'mymu_weekly'
    return 'makeyourmindup'   // the house register
  }
  // Legacy stored values, mapped never rejected. `mindmaker` was the lane before
  // MYMU became a venture; `techonomic` was the retired brand; `mindmaker_live`
  // was the interim channel slug.
  if (lane === 'mindmaker') {
    if (slot === 'field_learning') return 'linkedin'
    if (slot === 'investigation' || slot === 'teardown') return 'investigation'
    return 'makeyourmindup'
  }
  if (lane === 'builder_economy_ig') return 'built'
  if (lane === 'techonomic') return 'investigation'
  if (lane === 'mindmaker_live' || lane === 'makeyourmindup') return 'makeyourmindup'
  return null
}

// channel key -> a matcher against the playbook heading text in the corpus.
const CHANNEL_HEADING: Record<string, RegExp> = {
  // COLLISION RULE. These patterns are tested against every `##` heading in the
  // corpus and the FIRST match wins, so a heading must match exactly one key.
  // The corpus headings are deliberately disjoint to guarantee that:
  //   ## 0. MYMU house register   ## 1. Teardown   ## 2. Built
  //   ## 3. Make Your Mind Up (the weekly)   ## 4. Signal & Noise   ## 5. Maven
  // Two traps, both of which have actually happened:
  //   1. Never title the investigation section with "MYMU" or "Mindmaker Live".
  //      It precedes the weekly section and would capture its lookup, handing
  //      every weekly piece the teardown bar.
  //   2. Never title the weekly section with "Teardown" or "Investigation". The
  //      hero format is literally called "MYMU: Teardown", so this is the easy
  //      mistake, and the investigation pattern is tested first.
  // The house register is matched on the exact phrase "MYMU house register"
  // precisely so that a bare "MYMU" in any other heading cannot claim it.
  investigation: /Techonomic|Investigation|Teardown/i,
  built: /^#*\s*\d*\.?\s*Built\b|Builder Economy/i,
  mymu_weekly: /Make\s*Your\s*Mind\s*Up\s*\(the weekly\)/i,
  makeyourmindup: /MYMU house register/i,
  signal_noise: /Signal\s*&?\s*Noise/i,
  // Legacy key kept so a corpus copy that has not been resynced still resolves.
  mindmaker_live: /MYMU house register|Mindmaker Live/i,
  // The "Builder Economy" playbook became "Built" when Builder Economy stopped
  // being a lane and became a venture with its own feed. Old name kept in the
  // pattern for an un-resynced corpus copy.
  builder_economy: /^#*\s*\d*\.?\s*Built\b|Builder Economy/i,
  // Social cutdowns (LinkedIn, Instagram) ride the Built register, so they
  // borrow that playbook.
  linkedin: /^#*\s*\d*\.?\s*Built\b|Builder Economy/i,
  maven: /Maven Sales Surface/i,
}

/** Split markdown into level-1/2 sections (### stays inside its ## parent). */
function sliceSections(md: string): Array<{ title: string; body: string }> {
  const lines = md.split('\n')
  const out: Array<{ title: string; body: string }> = []
  let cur: { title: string; body: string } | null = null
  for (const line of lines) {
    const m = /^(#{1,2})\s+(.*)$/.exec(line)
    if (m) {
      if (cur) out.push(cur)
      cur = { title: m[2].trim(), body: `${line}\n` }
    } else if (cur) {
      cur.body += `${line}\n`
    }
  }
  if (cur) out.push(cur)
  return out
}

/**
 * Extract the corpus the model needs to write for ONE channel: the Five
 * Standards gate, the matching channel playbook, and the cross-channel rules.
 * Falls back to a trimmed slice of the whole corpus if it can't be parsed or the
 * channel is unknown (e.g. a free 'dynamic' piece). Capped so it never dominates
 * the prompt.
 */
export function corpusForChannel(corpus: string, channel?: string | null, cap = 6000): string {
  if (!corpus) return ''
  const sections = sliceSections(corpus)
  if (!sections.length) return corpus.slice(0, cap)
  const find = (re: RegExp) => sections.find(s => re.test(s.title))

  const picked: string[] = []
  const five = find(/Five Standards/i)
  if (five) picked.push(five.body.trim())

  const re = channel ? CHANNEL_HEADING[channel] : null
  const play = re ? find(re) : null
  if (play) picked.push(play.body.trim())
  else {
    // Unknown channel: hand over the tight one-paragraph synopsis instead of a
    // single playbook so the model still has the whole map.
    const onePara = find(/One-Paragraph Version/i)
    if (onePara) picked.push(onePara.body.trim())
  }

  const cross = find(/Cross-Channel Rules/i)
  if (cross) picked.push(cross.body.trim())

  const joined = picked.join('\n\n').trim()
  return (joined ? joined : corpus).slice(0, cap)
}

export interface ClaudeOpts {
  /** Abort after this many ms. Omit for no deadline (batch/cron callers). */
  timeoutMs?: number
  system: string
  user: string
  model?: string
  maxTokens?: number
  temperature?: number
}

/** Single-shot Anthropic Messages call. Returns the first text block (or throws). */
export async function callClaude(opts: ClaudeOpts): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')
  // A deadline, because there was none. An upstream that stalls otherwise burns
  // the entire 60s function budget and the caller gets no response at all, which
  // on a phone is indistinguishable from the app being broken. Callers on a
  // user-facing path should pass something well under maxDuration.
  const ctrl = new AbortController()
  const tid = opts.timeoutMs ? setTimeout(() => ctrl.abort(), opts.timeoutMs) : null
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: opts.model || 'claude-sonnet-4-6',
        max_tokens: opts.maxTokens ?? 4000,
        temperature: opts.temperature ?? 0.5,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
      }),
      signal: opts.timeoutMs ? ctrl.signal : undefined,
    })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`anthropic_${r.status}:${(j?.error?.message || '').slice(0, 120)}`)
    return j?.content?.[0]?.text || ''
  } catch (e: unknown) {
    if ((e as Error)?.name === 'AbortError') throw new Error(`anthropic_timeout_${opts.timeoutMs}ms`)
    throw e
  } finally {
    if (tid) clearTimeout(tid)
  }
}

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

/** Multi-turn Anthropic Messages call for the Cleo writing-assistant chat. */
export async function callClaudeMessages(
  system: string,
  messages: ChatTurn[],
  opts: { model?: string; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')
  const clean = messages
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-16)
  if (!clean.length || clean[0].role !== 'user') clean.unshift({ role: 'user', content: 'Help me with this draft.' })
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: opts.model || 'claude-sonnet-4-6',
      max_tokens: opts.maxTokens ?? 2000,
      temperature: opts.temperature ?? 0.6,
      system,
      messages: clean,
    }),
  })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`anthropic_${r.status}:${(j?.error?.message || '').slice(0, 120)}`)
  return j?.content?.[0]?.text || ''
}

/** Standard CORS + method preamble. Returns true if the request was handled (OPTIONS/bad method). */
export function preamble(req: any, res: any, methods = 'POST, OPTIONS'): boolean {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') { res.status(200).end(); return true }
  // The methods string is the contract: a route declaring 'GET, PATCH, OPTIONS'
  // accepts exactly those. (Previously only POST ever passed, whatever was
  // declared, which 405'd the v2 GET/PATCH routes.)
  const allowed = methods.split(',').map(m => m.trim().toUpperCase())
  if (!allowed.includes(String(req.method).toUpperCase())) {
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return true
  }
  return false
}

/** Resolve the [id] path param. */
export function pathId(req: any): string | null {
  const id = req.query?.id
  const v = Array.isArray(id) ? id[0] : id
  return v || null
}

/** The KILL-LIST mechanics, restated for the model so rewrites never reintroduce tells. */
export const VOICE_GUARDRAILS = [
  'HARD RULES (never violate): No em dashes anywhere — use commas, periods, or parentheses.',
  'No self-credentialing, no company-name-dropping for credibility.',
  'No AI tells: no "hook line, gap, explanation" opening, no "here\'s the thing", no "the truth is", no "let\'s dive in", no "delve", no "unpack", no "deep dive".',
  'No synthetic enthusiasm ("excited", "thrilled"). No "leverage" (except "leverage audit"). No "utilise", "seamless", "empower", "journey", "landscape", "robust", "synergy".',
  'Active voice only. Dropped subject pronouns where natural ("Been thinking", not "I\'ve been thinking").',
  'End on a hard, forward-looking verdict — never a summary, rhetorical question, or CTA.',
  'Specific over general. Never invent numbers, outcomes, or quotes; flag gaps instead.',
].join('\n')
