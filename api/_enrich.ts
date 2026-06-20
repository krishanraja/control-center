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
  email?: string | null
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

// Apollo.io people/match — structured B2B data (title, org, seniority, career
// history) when APOLLO_API_KEY is set. Returns a context block for the synthesis
// prompt plus the LinkedIn URL it resolved. Best-effort: any failure returns ''.
async function apolloPerson(input: BriefInput): Promise<{ context: string; linkedin?: string }> {
  const key = process.env.APOLLO_API_KEY
  if (!key) return { context: '' }
  const parts = (input.name || '').trim().split(/\s+/)
  const first = parts[0] || undefined
  const last = parts.length > 1 ? parts.slice(1).join(' ') : undefined
  const body: Record<string, any> = {}
  if (input.email) body.email = input.email
  if (first) body.first_name = first
  if (last) body.last_name = last
  if (input.company) body.organization_name = input.company
  if (input.url && /linkedin\.com/i.test(input.url)) body.linkedin_url = input.url
  if (!body.email && !body.linkedin_url && !(body.first_name && body.organization_name)) return { context: '' }
  try {
    const r = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': key },
      body: JSON.stringify(body),
    })
    const j: any = await r.json().catch(() => ({}))
    const p = j?.person
    if (!r.ok || !p) return { context: '' }
    const org = p.organization || {}
    const lines = [
      p.title ? `Title: ${p.title}` : '',
      p.headline ? `Headline: ${p.headline}` : '',
      org.name ? `Company: ${org.name}${org.industry ? ` (${org.industry})` : ''}` : '',
      org.website_url ? `Company site: ${org.website_url}` : '',
      org.estimated_num_employees ? `Company size: ~${org.estimated_num_employees} employees` : '',
      [p.city, p.state, p.country].filter(Boolean).length ? `Location: ${[p.city, p.state, p.country].filter(Boolean).join(', ')}` : '',
      Array.isArray(p.employment_history) && p.employment_history.length
        ? `Career: ${p.employment_history.slice(0, 4).map((e: any) => `${e.title || ''}${e.organization_name ? ` @ ${e.organization_name}` : ''}`).filter((s: string) => s.trim()).join('; ')}`
        : '',
    ].filter(Boolean)
    return { context: lines.length ? `APOLLO DATA:\n${lines.join('\n')}` : '', linkedin: p.linkedin_url || undefined }
  } catch {
    return { context: '' }
  }
}

/** Build a grounded research brief. Uses Apollo for structured B2B data (people)
 *  and Perplexity for web facts when their keys are set, then Claude to
 *  synthesize. Degrades to a Claude-only summary from known context otherwise. */
export async function researchBrief(input: BriefInput): Promise<BriefResult> {
  const pplxKey = process.env.PERPLEXITY_API_KEY

  // Structured + web research in parallel.
  const apolloP = input.kind === 'person' ? apolloPerson(input) : Promise.resolve({ context: '' as string, linkedin: undefined as string | undefined })
  const pplxP: Promise<{ text: string; citations: string[] }> = pplxKey
    ? perplexity(
        pplxKey,
        'You are a precise research assistant. Be factual, cite sources, never speculate.',
        input.kind === 'event'
          ? `Research this event/visibility opportunity for a prospective speaker: "${input.name}"${input.url ? ` (${input.url})` : ''}. Who organises it, the audience and size, dates/deadlines, how to get on stage, and why it would matter. Cite sources.`
          : `Research this person: ${input.name}${input.title ? `, ${input.title}` : ''}${input.company ? ` at ${input.company}` : ''}${input.url ? ` (${input.url})` : ''}. What they work on now, recent public activity, and what they care about. Cite sources.`,
      )
    : Promise.resolve({ text: '', citations: [] })

  const [apollo, pplx] = await Promise.all([apolloP, pplxP])
  const sources = pplx.citations

  const system = 'You write a tight research brief an operator can act on immediately. 4–7 sentences, concrete and specific. Prefer the structured Apollo data for facts; use the web findings for recent/contextual colour. If the facts are thin, say so plainly rather than inventing anything.'
  const user = [
    input.kind === 'event' ? `EVENT: ${input.name}` : `PERSON: ${input.name}`,
    input.company ? `Company: ${input.company}` : '',
    input.title ? `Title: ${input.title}` : '',
    input.extra ? `Known context: ${input.extra}` : '',
    apollo.context || '',
    pplx.text ? `WEB FINDINGS:\n${pplx.text}` : '',
    (!apollo.context && !pplx.text) ? '(no external research available — use only the known context above and stay honest about gaps)' : '',
  ].filter(Boolean).join('\n')

  const summary = (await callClaude({ system, user, maxTokens: 600, temperature: 0.4 })).trim()
  return { summary, sources }
}
