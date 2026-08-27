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

// People Data Labs person enrichment — a second structured source alongside
// Apollo (catches people Apollo misses). Gated on PEOPLE_DATA_LABS_API_KEY.
async function peopleDataLabs(input: BriefInput): Promise<string> {
  const key = process.env.PEOPLE_DATA_LABS_API_KEY
  if (!key) return ''
  const params = new URLSearchParams({ min_likelihood: '6' })
  if (input.email) params.set('email', input.email)
  if (input.url && /linkedin\.com/i.test(input.url)) params.set('profile', input.url)
  if (input.name) params.set('name', input.name)
  if (input.company) params.set('company', input.company)
  if (!params.has('email') && !params.has('profile') && !(params.has('name') && params.has('company'))) return ''
  try {
    const r = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?${params}`, {
      headers: { 'X-Api-Key': key },
    })
    const j: any = await r.json().catch(() => ({}))
    const d = j?.data
    if (!r.ok || !d) return ''
    const lines = [
      d.job_title ? `Title: ${d.job_title}` : '',
      d.job_company_name ? `Company: ${d.job_company_name}${d.job_company_industry ? ` (${d.job_company_industry})` : ''}` : '',
      d.job_company_size ? `Company size: ${d.job_company_size}` : '',
      d.location_name ? `Location: ${d.location_name}` : '',
      Array.isArray(d.experience) && d.experience.length
        ? `Career: ${d.experience.slice(0, 4).map((e: any) => `${e?.title?.name || ''}${e?.company?.name ? ` @ ${e.company.name}` : ''}`).filter((s: string) => s.trim()).join('; ')}`
        : '',
      Array.isArray(d.skills) && d.skills.length ? `Skills: ${d.skills.slice(0, 8).join(', ')}` : '',
    ].filter(Boolean)
    return lines.length ? `PEOPLE DATA LABS:\n${lines.join('\n')}` : ''
  } catch {
    return ''
  }
}

async function exaSearch(query: string): Promise<{ text: string; sources: string[] }> {
  const key = process.env.EXA_API_KEY
  if (!key) return { text: '', sources: [] }
  try {
    const r = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, numResults: 4, contents: { text: { maxCharacters: 900 } } }),
    })
    const j: any = await r.json().catch(() => ({}))
    const results = Array.isArray(j?.results) ? j.results : []
    if (!r.ok || !results.length) return { text: '', sources: [] }
    const text = results.map((x: any) => `- ${x.title || ''}: ${(x.text || '').replace(/\s+/g, ' ').slice(0, 400)}`).join('\n')
    return { text, sources: results.map((x: any) => x.url).filter(Boolean) }
  } catch {
    return { text: '', sources: [] }
  }
}

async function braveSearch(query: string): Promise<{ text: string; sources: string[] }> {
  const key = process.env.BRAVE_API_KEY
  if (!key) return { text: '', sources: [] }
  try {
    const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
      headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
    })
    const j: any = await r.json().catch(() => ({}))
    const results = Array.isArray(j?.web?.results) ? j.web.results : []
    if (!r.ok || !results.length) return { text: '', sources: [] }
    const text = results.map((x: any) => `- ${x.title || ''}: ${(x.description || '').replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')
    return { text, sources: results.map((x: any) => x.url).filter(Boolean) }
  } catch {
    return { text: '', sources: [] }
  }
}

// Web research, cost-aware: prefer Perplexity (synthesized + cited); fall back to
// Exa, then Brave, only when the prior source is unavailable/empty. Exported so
// the ICP scorer can augment lanes Apollo can't judge (e.g. builder_economy,
// where audience + "impossible before AI" novelty live on the open web).
export async function webResearch(query: string): Promise<{ text: string; sources: string[] }> {
  const pplxKey = process.env.PERPLEXITY_API_KEY
  if (pplxKey) {
    const r = await perplexity(pplxKey, 'You are a precise research assistant. Be factual, cite sources, never speculate.', query)
    if (r.text) return { text: r.text, sources: r.citations }
  }
  const exa = await exaSearch(query)
  if (exa.text) return exa
  return braveSearch(query)
}

/** Build a grounded research brief. Combines structured B2B data (Apollo +
 *  People Data Labs) with web research (Perplexity → Exa → Brave), then Claude
 *  to synthesize. Every source is independently gated on its key; with none set
 *  it degrades to a Claude-only summary from known context. */
export async function researchBrief(input: BriefInput): Promise<BriefResult> {
  const query = input.kind === 'event'
    ? `Research this event/visibility opportunity for a prospective speaker: "${input.name}"${input.url ? ` (${input.url})` : ''}. Who organises it, the audience and size, dates/deadlines, how to get on stage, and why it would matter.`
    : `Research this person: ${input.name}${input.title ? `, ${input.title}` : ''}${input.company ? ` at ${input.company}` : ''}${input.url ? ` (${input.url})` : ''}. What they work on now, recent public activity, and what they care about.`

  // Structured (people only) + web research in parallel.
  const structuredP = input.kind === 'person'
    ? Promise.all([apolloPerson(input), peopleDataLabs(input)]).then(([a, pdl]) => [a.context, pdl].filter(Boolean).join('\n\n'))
    : Promise.resolve('')
  const [structured, web] = await Promise.all([structuredP, webResearch(query)])

  const system = 'You write a tight research brief an operator can act on immediately. 4–7 sentences, concrete and specific. Prefer the structured data (Apollo / People Data Labs) for hard facts; use the web findings for recent/contextual colour. If the facts are thin, say so plainly rather than inventing anything.'
  const user = [
    input.kind === 'event' ? `EVENT: ${input.name}` : `PERSON: ${input.name}`,
    input.company ? `Company: ${input.company}` : '',
    input.title ? `Title: ${input.title}` : '',
    input.extra ? `Known context: ${input.extra}` : '',
    structured || '',
    web.text ? `WEB FINDINGS:\n${web.text}` : '',
    (!structured && !web.text) ? '(no external research available — use only the known context above and stay honest about gaps)' : '',
  ].filter(Boolean).join('\n')

  const summary = (await callClaude({ agent: 'enrich', system, user, maxTokens: 600, temperature: 0.4 })).trim()
  return { summary, sources: web.sources }
}
