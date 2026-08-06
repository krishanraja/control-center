// _relevance — shared topic/vertical relevance classifier for triage clearing.
//
// Used by two callers:
//   1. api/content-ideas.ts  — the ingest relevance gate (one card at a time):
//      an agent-sourced idea that is off-vertical or too-technical is dropped
//      at capture so it never reaches the triage deck ("forever").
//   2. scripts/triage/relevance-sweep.ts — the backlog sweep (many cards):
//      classifies the existing deck and routes off-vertical / too-technical
//      cards through the same -1 feedback path a manual swipe uses, so Vera
//      learns the pattern.
//
// Deliberately dependency-light: it does NOT import _supabase or _content, so
// it resolves cleanly both under the Vercel bundler (.js imports) and under
// tsx (extension-less). The caller loads config + supplies the API key.

export type Verdict = 'keep' | 'off_vertical' | 'too_technical'

export interface RelevanceItem {
  id: string
  title: string
  /** Optional extra context (snippet / company / why-relevant). */
  text?: string | null
}

export interface RelevanceVerdict {
  id: string
  verdict: Verdict
  /** Which muted vertical triggered an off_vertical call, else null. */
  vertical: string | null
  /** 0..1 — only act when >= the caller's min confidence. */
  confidence: number
  /** <= ~12 words, for the feedback_queue reason_text / audit trail. */
  rationale: string
}

// The user's policy (2026-06-17), encoded as the muted vertical set. KEEP
// anything with an AI / agents / economics angle; these are cut only when the
// card is primarily about the domain on its OWN terms. Consumer / retail / DTC
// / adtech are intentionally NOT here — they stay in-bounds.
export const DEFAULT_MUTED_VERTICALS = [
  'finance',            // traditional finance, markets, banking, personal finance, fintech-as-vertical
  'tax',
  'law',                // legal / litigation / regulation-as-news (not AI governance)
  'crypto',             // web3 / blockchain / tokens / DeFi / NFTs
  'healthcare',         // health / biotech / pharma
  'climate_energy',     // climate / energy / cleantech
  'real_estate',        // real estate / proptech
  'geopolitics_defense', // geopolitics / defense / public-sector
] as const

export interface ClassifyOpts {
  apiKey: string
  /** Defaults to DEFAULT_MUTED_VERTICALS. */
  mutedVerticals?: readonly string[]
  /** 'content' (default) tunes the prompt; other surfaces describe people/events. */
  surface?: 'content' | 'lead' | 'guest' | 'visibility' | 'contact'
  model?: string
  /** Items per Anthropic call. Default 25. */
  batchSize?: number
}

const HAIKU = 'claude-haiku-4-5-20251001'

function policyPrompt(muted: readonly string[], surface: string): string {
  const subject = surface === 'content'
    ? 'news cards and content seeds'
    : surface === 'lead' ? 'sales leads'
    : surface === 'guest' ? 'podcast-guest candidates'
    : surface === 'visibility' ? 'speaking / visibility targets'
    : 'network contacts'
  return [
    `You are a relevance filter for Krish Raja's triage. Krish publishes "MYMU" and "Signal & Noise": sharp, executive-level writing about the ECONOMICS of AI, autonomous agents, the builder economy, AI-native operating, and platform / marketplace / VC dynamics.`,
    ``,
    `You are filtering ${subject}. For each item return one verdict:`,
    ``,
    `- "keep": on-brand. ANYTHING about AI / agents / LLMs, the economics of AI, the builder economy, AI-native operating, platform / marketplace / VC dynamics, OR AI regulation & governance. Consumer, retail, DTC, advertising and adtech are IN-BOUNDS — keep them.`,
    ``,
    `- "off_vertical": the item is PRIMARILY about one of these domains on its OWN terms, NOT through an AI / agent lens — ${muted.join(', ')}. (finance = traditional finance, markets, banking, personal finance, fintech-as-a-vertical; law = legal / litigation / regulation-as-news, but NOT AI governance; crypto = web3 / blockchain / tokens.) If the SAME topic is framed as an AI / agents story, KEEP it instead.`,
    ``,
    `- "too_technical": low-level engineering / infrastructure / devops with no strategic angle — cloud-ops (AWS / GCP / Azure), Kubernetes, database internals, framework release notes, library changelogs. BUT keep builder-economy "how we built X with agents" strategic-technical pieces.`,
    ``,
    `When unsure, prefer "keep" with low confidence. Only mark off_vertical / too_technical when you are confident the item has no AI / agent / economics angle Krish would write about.`,
    ``,
    `Return ONLY a JSON array, one object per item, same order and ids:`,
    `[{"id":"<id>","verdict":"keep|off_vertical|too_technical","vertical":"<one muted key or null>","confidence":0.0-1.0,"rationale":"<=12 words"}]`,
  ].join('\n')
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

/** Tolerant JSON-array extraction from an LLM response (handles ```json fences). */
function robustJsonArray(txt: string): any[] {
  let t = String(txt || '').trim()
  if (t.startsWith('```')) t = t.split('```')[1].replace(/^json/, '').trim()
  try { const v = JSON.parse(t); return Array.isArray(v) ? v : [] } catch { /* fallthrough */ }
  const i = t.indexOf('['), j = t.lastIndexOf(']')
  if (i >= 0 && j > i) { try { const v = JSON.parse(t.slice(i, j + 1)); return Array.isArray(v) ? v : [] } catch { /* noop */ } }
  return []
}

async function classifyBatch(items: RelevanceItem[], opts: ClassifyOpts): Promise<RelevanceVerdict[]> {
  const muted = opts.mutedVerticals && opts.mutedVerticals.length ? opts.mutedVerticals : DEFAULT_MUTED_VERTICALS
  const system = policyPrompt(muted, opts.surface || 'content')
  const user = 'Classify these items:\n\n' + items
    .map(it => `- id ${it.id}: ${String(it.title || '').slice(0, 200)}${it.text ? ` — ${String(it.text).slice(0, 400)}` : ''}`)
    .join('\n')

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': opts.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: opts.model || HAIKU,
      max_tokens: 2000,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`anthropic_${r.status}:${(j?.error?.message || '').slice(0, 120)}`)
  const raw = robustJsonArray(j?.content?.[0]?.text || '')

  const byId = new Map<string, any>()
  for (const o of raw) if (o && o.id != null) byId.set(String(o.id), o)

  // Map back onto the input order; anything the model dropped defaults to keep.
  return items.map(it => {
    const o = byId.get(it.id) || {}
    const verdict: Verdict = o.verdict === 'off_vertical' || o.verdict === 'too_technical' ? o.verdict : 'keep'
    const confidence = typeof o.confidence === 'number' ? Math.max(0, Math.min(1, o.confidence)) : 0
    return {
      id: it.id,
      verdict,
      vertical: verdict === 'off_vertical' && typeof o.vertical === 'string' ? o.vertical : null,
      confidence,
      rationale: typeof o.rationale === 'string' ? o.rationale.slice(0, 120) : '',
    }
  })
}

/** Classify a batch of items. Chunks internally; on a chunk error those items
 *  default to keep (fail-open — we never auto-drop on a classifier failure). */
export async function classifyRelevance(items: RelevanceItem[], opts: ClassifyOpts): Promise<RelevanceVerdict[]> {
  if (!items.length) return []
  if (!opts.apiKey) throw new Error('ANTHROPIC_API_KEY not configured')
  const out: RelevanceVerdict[] = []
  for (const part of chunk(items, opts.batchSize || 25)) {
    try {
      out.push(...await classifyBatch(part, opts))
    } catch {
      for (const it of part) out.push({ id: it.id, verdict: 'keep', vertical: null, confidence: 0, rationale: 'classifier_error_kept' })
    }
  }
  return out
}

/** Map a non-keep verdict to the canonical per-surface reason_code that Vera
 *  clusters on (see REASON_OPTIONS in api/feedback.ts and REJECT_REASONS in
 *  src/lib/triageReasons.ts). */
export function relevanceReasonCode(prefix: string, verdict: Verdict): string {
  if (verdict === 'too_technical') return `${prefix}_too_technical`
  return `${prefix}_off_vertical`
}
