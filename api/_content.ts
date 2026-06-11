// _content — shared helpers for the Content Engine API routes
// (revise / challenge / score / push-to-cleo). Mirrors the inline helpers in
// transform.ts but de-duplicated, since four routes need the same primitives.

import { supabase } from './_supabase.js'

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

export interface ClaudeOpts {
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
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Method not allowed' }); return true }
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
