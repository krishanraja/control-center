// _content — shared helpers for the Content Engine API routes
// (revise / challenge / score / push-to-cleo). Mirrors the inline helpers in
// transform.ts but de-duplicated, since four routes need the same primitives.

import { priceUsd } from './_prices.js'
import * as meter from './_meter.js'


import { UTILITY_MODEL, MODEL_PRICES, thinkingParam } from './_models.js'

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

/** Load one or more system_config values by exact key. Returns key -> parsed value.
 *
 *  The Supabase client is imported HERE rather than at the top of the file, and
 *  that placement is load-bearing. `_supabase.ts` throws at module scope when
 *  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are absent, so a static import made
 *  this module — and every prompt-building module downstream of it — impossible
 *  to import without a live database. That is what stopped the prompt layer from
 *  being testable offline: you could not so much as assemble a system prompt and
 *  read it back without credentials. Config reads are the only thing in this file
 *  that need the database, so they are the only thing that should pay for it. */
export async function loadConfig(keys: string[]): Promise<Record<string, any>> {
  const { supabase } = await import('./_supabase.js')
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
  // THE LIVE MODEL (canon, 2026-08-28). One publication, exactly two channels:
  // The Money of AI and Built with AI. There is no third. Legacy slot values
  // ('paid', 'built', 'teardown', 'investigation') map forward, never rejected.
  const MONEY = new Set(['money_of_ai', 'paid', 'teardown', 'investigation'])
  const BUILT = new Set(['built_with_ai', 'built'])
  if (lane === 'publication' || lane === 'mindmaker_live') {
    if (slot && MONEY.has(slot)) return 'money_of_ai'
    if (slot && BUILT.has(slot)) return 'built_with_ai'
    return 'publication'   // the house register
  }
  // ── Legacy stored values, mapped never rejected ───────────────────────────
  // 'mindmake' was the content lane before the venture split; 'mymu' and
  // 'makeyourmindup' were the content brand before it became the CTRL lead
  // magnet; 'techonomic' was the retired investigative brand; signal_noise and
  // builder_economy were ventures until 2026-08-11.
  if (lane === 'mymu' || lane === 'makeyourmindup') {
    if (slot && MONEY.has(slot)) return 'money_of_ai'
    if (slot && BUILT.has(slot)) return 'built_with_ai'
    return 'publication'
  }
  if (lane === 'mindmaker' || lane === 'mindmake') {
    if (slot === 'field_learning') return 'linkedin'
    if (slot && MONEY.has(slot)) return 'money_of_ai'
    return 'publication'
  }
  if (lane === 'techonomic') return 'money_of_ai'
  if (lane === 'builder_economy' || lane === 'builder_economy_ig') return 'built_with_ai'
  // Still a real corpus playbook, just a channel rather than a venture now.
  if (lane === 'signal_noise') return 'signal_noise'
  return null
}

// channel key -> a matcher against the playbook heading text in the corpus.
const CHANNEL_HEADING: Record<string, RegExp> = {
  // COLLISION RULE. These patterns are tested against every `##` heading in the
  // corpus (the heading TEXT, with the # markers already stripped) and the
  // FIRST match wins, so a heading must match exactly one key. The live corpus
  // headings are deliberately disjoint:
  //   ## 0. Publication house register   ## 1. The Money of AI   ## 2. Built with AI
  //   ## 3. Signal & Noise   ## 4. Maven   ## 5. Substack   ## 6. LinkedIn
  //   ## 7. YouTube   ## 8. Instagram   ## 9. Podcast
  //
  // THE TRAP, which has now bitten three times. A format name is also an
  // ordinary English word, so an UNANCHORED pattern captures the wrong section:
  //   - "Built" appears inside "How a piece gets built (the pipeline)", which
  //     is a real heading in this corpus and sits ABOVE the playbooks.
  //   - "Paid" appears in prose about the publication's paid tiers.
  // Both format patterns are therefore anchored to the START of the heading
  // text, past an optional section numeral. Never relax that anchor, and never
  // give a format an alternation that can match mid-heading.
  //
  // The house register is matched on the exact phrase "Publication house
  // register" so a bare "Publication" elsewhere cannot claim it.
  //
  // CANON 2026-08-28: the publication runs exactly two channels, The Money of
  // AI and Built with AI. 'paid' and 'built' remain as LEGACY aliases that
  // resolve to those same two playbooks, so a stored legacy row still gets its
  // real playbook instead of the whole-corpus fallback. Single anchored
  // patterns only, never an alternation.
  money_of_ai: /^#*\s*\d*\.?\s*(The\s+)?Money\s+of\s+AI\b/i,
  built_with_ai: /^#*\s*\d*\.?\s*Built\s+with\s+AI\b/i,
  paid: /^#*\s*\d*\.?\s*(The\s+)?Money\s+of\s+AI\b/i,
  built: /^#*\s*\d*\.?\s*Built\b/i,
  publication: /Publication house register/i,
  signal_noise: /Signal\s*&?\s*Noise/i,
  maven: /Maven/i,

  // ── Distribution registers (added 2026-08-13) ──────────────────────────
  // Each of these now has its OWN section in the corpus. Before this, LinkedIn
  // pointed at the Built regex and the other four had no entry at all, so
  // "adapt for Substack" silently fell through to the one-paragraph synopsis
  // and produced a generic rewrite. A channel with no register is a channel
  // the engine cannot actually write for.
  //
  // Same anchoring discipline as the formats: past an optional numeral, tied
  // to the start of the heading text. "Podcast" in particular must not match
  // "Visibility (Nova, speaking, podcasts, CFPs...)", which it cannot, both
  // because that heading is an h3 (sliceSections only takes # and ##) and
  // because the anchor holds.
  substack: /^#*\s*\d*\.?\s*Substack\b/i,
  linkedin: /^#*\s*\d*\.?\s*LinkedIn\b/i,
  youtube: /^#*\s*\d*\.?\s*YouTube\b/i,
  instagram: /^#*\s*\d*\.?\s*Instagram\b/i,
  podcast: /^#*\s*\d*\.?\s*Podcast\b/i,

  // ── Legacy keys ────────────────────────────────────────────────────────
  // Kept ONLY so a corpus copy that has not been resynced, or an old stored
  // row, still resolves to something sane. Never offer these as a choice.
  investigation: /^#*\s*\d*\.?\s*Paid\b|Techonomic|Investigation|Teardown/i,
  makeyourmindup: /Publication house register|MYMU house register/i,
  mymu_weekly: /Publication house register|Make\s*Your\s*Mind\s*Up\s*\(the weekly\)/i,
  builder_economy: /^#*\s*\d*\.?\s*Built\b|Builder Economy/i,
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

/** Models that reject temperature/top_p/top_k with a 400.
 *
 *  One list, because there were two behaviours. `_harness.ts` knew about this
 *  and guarded (its ladder runs on opus); the helpers here did not, and sent
 *  `temperature` unconditionally — so pointing callClaude() at an opus model
 *  400'd, and the streaming helper avoided that only by sending no temperature
 *  at all, which cost it sampling control on every model. Both now consult this.
 *  Update it here when the model list moves. */
export const NO_SAMPLING_MODELS = /^claude-(opus-4-7|opus-4-8|opus-5|sonnet-5|fable-5|mythos-5)/

/** Whether `model` accepts sampling parameters at all. */
export function supportsSampling(model: string): boolean {
  return !NO_SAMPLING_MODELS.test(model)
}

export interface ClaudeImage {
  /** e.g. 'image/png'. Must be one Anthropic accepts: png, jpeg, gif, webp. */
  mime: string
  /** Base64, WITHOUT the `data:...;base64,` prefix. */
  data: string
}

export interface ClaudeOpts {
  /** Abort after this many ms. Omit for no deadline (batch/cron callers). */
  timeoutMs?: number
  system: string
  user: string
  /** Images to send alongside `user`, for the vision path.
   *
   *  Anthropic only accepts images inside a content-block array, so supplying
   *  this switches the message from the plain-string form to blocks. Images go
   *  BEFORE the text: Anthropic's own guidance is that a question placed after
   *  the image it refers to is answered more accurately. */
  images?: ClaudeImage[]
  model?: string
  maxTokens?: number
  temperature?: number
  /** Ask for adaptive thinking on models that support it.
   *
   *  Off by default and explicitly so. On Sonnet 5 and the Opus 5 family,
   *  OMITTING the thinking field means adaptive thinking runs, and it spends
   *  max_tokens before writing a word — a JSON call site budgeted for its
   *  answer alone comes back empty from a 200 response. So every request here
   *  states its intent, and a caller that turns this on must raise maxTokens to
   *  cover the reasoning as well as the answer. */
  think?: boolean
  /** Optional token accounting. Called once on a successful response.
   *
   *  `usage` was previously read off the wire and thrown away, which is fine for
   *  a route that only wants the text and fatal for anything that needs to know
   *  what a run cost — an eval comparing two prompts has to be able to say that
   *  the better one is also three times the price. Opt-in, so the twelve routes
   *  that just want text are unaffected. */
  onUsage?: (u: TokenUsage) => void
  /** Which agent this call is on behalf of, for the usage meter.
   *
   *  Anthropic's own per-agent spend is unreadable from an API key (the usage
   *  and cost reports need an Admin key, which an individual account cannot
   *  have), so the OS meters itself and this is the stamp that makes the
   *  numbers mean something. A call that omits it meters as 'unattributed' —
   *  a visible gap in the console, never folded into another agent's total. */
  agent?: string
}

export interface TokenUsage { input: number; output: number; model: string }

/** Cost of a usage record in USD. Unknown models price at 0 rather than guess;
 *  the rates live in api/_prices.ts, the only copy of them. */
export function usageCost(u: TokenUsage): number {
  return priceUsd(u.model, u.input, u.output)
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

/** The `content` for the single user turn: a bare string when there are no
 *  images (unchanged for every existing caller), a block array when there are. */
function userContent(opts: ClaudeOpts): string | ContentBlock[] {
  if (!opts.images?.length) return opts.user
  return [
    ...opts.images.map((img): ContentBlock => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mime, data: img.data },
    })),
    { type: 'text', text: opts.user },
  ]
}

/** Single-shot Anthropic Messages call. Returns the first text block (or throws). */
export async function callClaude(opts: ClaudeOpts): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')
  // A deadline, because there was none. An upstream that stalls otherwise burns
  // the entire 60s function budget and the caller gets no response at all, which
  // on a phone is indistinguishable from the app being broken. Callers on a
  // user-facing path should pass something well under maxDuration.
  const model = opts.model || UTILITY_MODEL
  const ctrl = new AbortController()
  const tid = opts.timeoutMs ? setTimeout(() => ctrl.abort(), opts.timeoutMs) : null
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 4000,
        ...thinkingParam(model, opts.think === true),
        ...(supportsSampling(model) ? { temperature: opts.temperature ?? 0.5 } : {}),
        system: opts.system,
        messages: [{ role: 'user', content: userContent(opts) }],
      }),
      signal: opts.timeoutMs ? ctrl.signal : undefined,
    })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok) {
      // The status and body ride along on the Error so a caller can tell a
      // spent credit balance (429 insufficient_quota / 400 credit balance too
      // low) from a malformed request. Without them the only signal is a
      // string, and "half enriched because Anthropic is out of credits" is
      // exactly the failure this has to stay distinguishable from.
      const e = new Error(`anthropic_${r.status}:${(j?.error?.message || '').slice(0, 120)}`) as Error & {
        status?: number; body?: string
      }
      e.status = r.status
      e.body = JSON.stringify(j?.error || j || {}).slice(0, 400)
      throw e
    }
    const inputTokens = Number(j?.usage?.input_tokens) || 0
    const outputTokens = Number(j?.usage?.output_tokens) || 0
    if (opts.onUsage) opts.onUsage({ input: inputTokens, output: outputTokens, model })
    // Unconditional, unlike onUsage: a route that does not care what it cost is
    // exactly the route whose spend nobody was watching.
    await meter.anthropicCall({ agent: opts.agent, model, inputTokens, outputTokens })
    return firstText(j)
  } catch (e: unknown) {
    if ((e as Error)?.name === 'AbortError') throw new Error(`anthropic_timeout_${opts.timeoutMs}ms`)
    throw e
  } finally {
    if (tid) clearTimeout(tid)
  }
}

/**
 * The first TEXT block of a response.
 *
 * `content[0].text` was right until a model could put a thinking block first,
 * at which point it silently returns undefined and every caller sees an empty
 * answer from a 200 response. Indexing by position was always an assumption
 * about the content array; this reads what it is actually looking for.
 */
function firstText(j: any): string {
  const blocks = Array.isArray(j?.content) ? j.content : []
  for (const b of blocks) if (b?.type === 'text' && typeof b.text === 'string') return b.text
  return ''
}

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

/** Multi-turn Anthropic Messages call for the Cleo writing-assistant chat. */
export async function callClaudeMessages(
  system: string,
  messages: ChatTurn[],
  opts: { model?: string; maxTokens?: number; temperature?: number; think?: boolean; agent?: string } = {},
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')
  const model = opts.model || UTILITY_MODEL
  const clean = messages
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-16)
  if (!clean.length || clean[0].role !== 'user') clean.unshift({ role: 'user', content: 'Help me with this draft.' })
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 2000,
      ...thinkingParam(model, opts.think === true),
      ...(supportsSampling(model) ? { temperature: opts.temperature ?? 0.6 } : {}),
      system,
      messages: clean,
    }),
  })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`anthropic_${r.status}:${(j?.error?.message || '').slice(0, 120)}`)
  await meter.anthropicCall({
    agent: opts.agent,
    model,
    inputTokens: Number(j?.usage?.input_tokens) || 0,
    outputTokens: Number(j?.usage?.output_tokens) || 0,
  })
  return firstText(j)
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
