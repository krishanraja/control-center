import { callClaude } from './_content.js'

// Direct (non-n8n) enrichment. The n8n enrich workflows (Agatha/Nova/Dossier
// Engine) run rich multi-pass pipelines; this is the fallback that keeps a
// "research this" action working when those are down or out of quota. It is
// deliberately ADDITIVE and lightweight: it produces a grounded research brief
// (Perplexity for facts when available, Claude to synthesize) and the callers
// store it in a clearly-namespaced field without touching the n8n dossier shape.

export interface BriefInput {
  name: string
  company?: string | null
  title?: string | null
  url?: string | null
  kind: 'person' | 'event'
  extra?: string | null
}
export interface BriefResult { summary: string; sources: string[] }

async function perplexity(key: string, system: string, user: string): Promise<{ text: string; citations: string[] }> {
  try {
    const r = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.2, max_tokens: 1100,
      }),
    })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok) return { text: '', citations: [] }
    return { text: j?.choices?.[0]?.message?.content || '', citations: Array.isArray(j?.citations) ? j.citations : [] }
  } catch {
    return { text: '', citations: [] }
  }
}

/** Build a grounded research brief. Works with Perplexity for facts when the key
 *  is set, and degrades to a Claude-only synthesis from known context otherwise. */
export async function researchBrief(input: BriefInput): Promise<BriefResult> {
  const pplxKey = process.env.PERPLEXITY_API_KEY
  let research = ''
  let sources: string[] = []
  if (pplxKey) {
    const q = input.kind === 'event'
      ? `Research this event/visibility opportunity for a prospective speaker: "${input.name}"${input.url ? ` (${input.url})` : ''}. Who organises it, the audience and size, dates/deadlines, how to get on stage, and why it would matter. Cite sources.`
      : `Research this person: ${input.name}${input.title ? `, ${input.title}` : ''}${input.company ? ` at ${input.company}` : ''}${input.url ? ` (${input.url})` : ''}. What they work on now, recent public activity, and what they care about. Cite sources.`
    const r = await perplexity(pplxKey, 'You are a precise research assistant. Be factual, cite sources, never speculate.', q)
    research = r.text
    sources = r.citations
  }

  const system = 'You write a tight research brief an operator can act on immediately. 4–7 sentences, concrete and specific. If the facts are thin, say so plainly rather than inventing anything.'
  const user = [
    input.kind === 'event' ? `EVENT: ${input.name}` : `PERSON: ${input.name}`,
    input.company ? `Company: ${input.company}` : '',
    input.title ? `Title: ${input.title}` : '',
    input.extra ? `Known context: ${input.extra}` : '',
    research ? `RESEARCH FINDINGS:\n${research}` : '(no external research available — use only the known context above and stay honest about gaps)',
  ].filter(Boolean).join('\n')

  const summary = (await callClaude({ system, user, maxTokens: 600, temperature: 0.4 })).trim()
  return { summary, sources }
}
