import { callClaude } from './_content.js'
import { embed } from './_embeddings.js'
import { linkedInProfile, type LinkedInProfile } from './_apify.js'
import { logApiCall } from './_alert.js'
import {
  outcomeFrom, skipped, empty, errored, ok,
  summarise, type OutcomeSummary, type ProviderOutcome,
} from './_quota.js'

// Structured person enrichment.
//
// _enrich.ts already fans out to Apollo + People Data Labs + Perplexity/Exa/
// Brave, and it stays exactly as it is: its four callers want a best-effort
// prose brief and are correct to swallow provider failures. This module is the
// version that has to be honest, because its output is written into the network
// as a permanent record:
//
//   1. It keeps the STRUCTURED fields. _enrich.ts flattens Apollo and PDL into
//      a prompt string and throws the fields away, so nothing lands in the
//      typed columns of contacts / contact_intelligence.
//   2. It returns a typed outcome per provider instead of ''. A provider that
//      is out of credits is not the same as a person with a thin footprint, and
//      the caller must be able to tell them apart before it writes.
//
// The contract with the caller: if `summary.blocked` is non-empty, the run did
// not complete and the record must NOT be marked enriched.

export interface PersonInput {
  name: string
  company?: string | null
  title?: string | null
  linkedinUrl?: string | null
  email?: string | null
  location?: string | null
  headline?: string | null
}

export interface PersonFacts {
  title?: string
  company?: string
  industry?: string
  companySize?: string
  location?: string
  country?: string
  seniority?: string
  headline?: string
  about?: string
  linkedinUrl?: string
  followerCount?: number
  career: { title?: string; company?: string; dates?: string }[]
  skills: string[]
  /** Providers that actually contributed a fact, for contact_intelligence.source_list. */
  sourceList: string[]
}

/** The judgment layer, shaped to contact_intelligence's columns. */
export interface Judgment {
  who: string
  why_them: string
  hook: string
  risk: string
  roles: string[]
  seniority?: string
  industry?: string
  best_channel?: string
  reachable_via: string[]
  confidence: 'low' | 'medium' | 'high'
}

export interface EnrichResult {
  facts: PersonFacts
  judgment: Judgment | null
  sources: string[]
  outcomes: ProviderOutcome[]
  summary: OutcomeSummary
  /** True when at least one provider returned a real fact. Distinct from
   *  "nothing was blocked": a run where every key is unset is not blocked and
   *  is also not enrichment. */
  hasEvidence: boolean
}

const ROLE_VOCAB = ['buyer', 'partner', 'introducer', 'guest', 'operator_peer', 'investor', 'hire', 'none']

// ── People Data Labs ────────────────────────────────────────────────────────

interface PdlOut { fields: Partial<PersonFacts>; outcome: ProviderOutcome; remaining?: number }

async function peopleDataLabs(input: PersonInput): Promise<PdlOut> {
  const key = process.env.PEOPLE_DATA_LABS_API_KEY
  if (!key) return { fields: {}, outcome: skipped('peopledatalabs') }

  const params = new URLSearchParams({ min_likelihood: '6' })
  if (input.email) params.set('email', input.email)
  if (input.linkedinUrl && /linkedin\.com/i.test(input.linkedinUrl)) params.set('profile', input.linkedinUrl)
  if (input.name) params.set('name', input.name)
  if (input.company) params.set('company', input.company)
  // PDL needs one strong identifier; name alone matches half the planet.
  if (!params.has('email') && !params.has('profile') && !(params.has('name') && params.has('company'))) {
    return { fields: {}, outcome: empty('peopledatalabs', 'not enough identifiers to query (need email, LinkedIn URL, or name+company)') }
  }

  try {
    const r = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?${params}`, { headers: { 'X-Api-Key': key } })
    const text = await r.text()
    // PDL publishes the remaining allowance on every response. Capturing it is
    // what turns "we ran out" into "you have 40 left" in an alert.
    const remainingRaw = r.headers.get('x-totallimit-remaining') ?? r.headers.get('x-ratelimit-remaining')
    const remaining = remainingRaw != null && remainingRaw !== '' ? Number(remainingRaw) : undefined

    if (!r.ok) {
      // 404 is PDL's "no match", not a fault. Everything else classifies.
      if (r.status === 404) return { fields: {}, outcome: empty('peopledatalabs', 'no match above min_likelihood 6'), remaining }
      return { fields: {}, outcome: outcomeFrom('peopledatalabs', r.status, text), remaining }
    }

    const j = JSON.parse(text) as { data?: Record<string, any> }
    const d = j?.data
    if (!d) return { fields: {}, outcome: empty('peopledatalabs', 'empty data'), remaining }

    await logApiCall({ api: 'peopledatalabs', endpoint: 'v5/person/enrich', units: 1, source: 'network-add-person', meta: { remaining } })

    const career = (Array.isArray(d.experience) ? d.experience : []).slice(0, 6).map((e: Record<string, any>) => ({
      title: e?.title?.name || undefined,
      company: e?.company?.name || undefined,
      dates: e?.start_date ? `${e.start_date}${e.end_date ? `–${e.end_date}` : '–present'}` : undefined,
    })).filter((e: { title?: string; company?: string }) => e.title || e.company)

    return {
      remaining,
      outcome: ok('peopledatalabs'),
      fields: {
        title: d.job_title || undefined,
        company: d.job_company_name || undefined,
        industry: d.job_company_industry || undefined,
        companySize: d.job_company_size || undefined,
        location: d.location_name || undefined,
        country: d.location_country || undefined,
        seniority: d.job_title_levels?.[0] || undefined,
        linkedinUrl: d.linkedin_url ? `https://www.${String(d.linkedin_url).replace(/^https?:\/\/(www\.)?/, '')}` : undefined,
        career,
        skills: (Array.isArray(d.skills) ? d.skills : []).slice(0, 12),
      },
    }
  } catch (e: unknown) {
    return { fields: {}, outcome: errored('peopledatalabs', String((e as Error)?.message || e)) }
  }
}

// ── Apollo ──────────────────────────────────────────────────────────────────

async function apolloPerson(input: PersonInput): Promise<{ fields: Partial<PersonFacts>; outcome: ProviderOutcome }> {
  const key = process.env.APOLLO_API_KEY
  if (!key) return { fields: {}, outcome: skipped('apollo') }

  const parts = (input.name || '').trim().split(/\s+/)
  const body: Record<string, unknown> = {}
  if (input.email) body.email = input.email
  if (parts[0]) body.first_name = parts[0]
  if (parts.length > 1) body.last_name = parts.slice(1).join(' ')
  if (input.company) body.organization_name = input.company
  if (input.linkedinUrl && /linkedin\.com/i.test(input.linkedinUrl)) body.linkedin_url = input.linkedinUrl
  if (!body.email && !body.linkedin_url && !(body.first_name && body.organization_name)) {
    return { fields: {}, outcome: empty('apollo', 'not enough identifiers to match') }
  }

  try {
    const r = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': key },
      body: JSON.stringify(body),
    })
    const text = await r.text()
    if (!r.ok) return { fields: {}, outcome: outcomeFrom('apollo', r.status, text) }

    const p = (JSON.parse(text) as { person?: Record<string, any> })?.person
    if (!p) return { fields: {}, outcome: empty('apollo', 'no match') }

    await logApiCall({ api: 'apollo', endpoint: 'v1/people/match', units: 1, source: 'network-add-person' })
    const org = p.organization || {}
    return {
      outcome: ok('apollo'),
      fields: {
        title: p.title || undefined,
        headline: p.headline || undefined,
        company: org.name || undefined,
        industry: org.industry || undefined,
        companySize: org.estimated_num_employees ? `~${org.estimated_num_employees}` : undefined,
        location: [p.city, p.state, p.country].filter(Boolean).join(', ') || undefined,
        country: p.country || undefined,
        seniority: p.seniority || undefined,
        linkedinUrl: p.linkedin_url || undefined,
        career: (Array.isArray(p.employment_history) ? p.employment_history : []).slice(0, 6).map((e: Record<string, any>) => ({
          title: e?.title || undefined,
          company: e?.organization_name || undefined,
          dates: e?.start_date ? `${e.start_date}${e.end_date ? `–${e.end_date}` : '–present'}` : undefined,
        })).filter((e: { title?: string; company?: string }) => e.title || e.company),
      },
    }
  } catch (e: unknown) {
    return { fields: {}, outcome: errored('apollo', String((e as Error)?.message || e)) }
  }
}

// ── Web research ────────────────────────────────────────────────────────────
//
// Same Perplexity → Exa → Brave cascade as _enrich.ts, but each hop reports why
// it did not answer instead of returning ''. Only the LAST provider's failure
// is blocking-relevant: if Perplexity is out of credits but Exa answers, the
// research happened and the credit state is still worth surfacing.

async function webResearch(query: string): Promise<{ text: string; sources: string[]; outcomes: ProviderOutcome[] }> {
  const outcomes: ProviderOutcome[] = []

  const pplxKey = process.env.PERPLEXITY_API_KEY
  if (!pplxKey) outcomes.push(skipped('perplexity'))
  else {
    try {
      const r = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${pplxKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
            { role: 'system', content: 'You are a precise research assistant. Be factual, cite sources, never speculate.' },
            { role: 'user', content: query },
          ],
          temperature: 0.2, max_tokens: 1100,
        }),
      })
      const text = await r.text()
      if (!r.ok) outcomes.push(outcomeFrom('perplexity', r.status, text))
      else {
        const j = JSON.parse(text) as { choices?: { message?: { content?: string } }[]; citations?: string[] }
        const content = j?.choices?.[0]?.message?.content || ''
        if (content) {
          outcomes.push(ok('perplexity'))
          await logApiCall({ api: 'perplexity', endpoint: 'chat/completions', units: 1, source: 'network-add-person' })
          return { text: content, sources: Array.isArray(j.citations) ? j.citations : [], outcomes }
        }
        outcomes.push(empty('perplexity', 'no content'))
      }
    } catch (e: unknown) { outcomes.push(errored('perplexity', String((e as Error)?.message || e))) }
  }

  const exaKey = process.env.EXA_API_KEY
  if (!exaKey) outcomes.push(skipped('exa'))
  else {
    try {
      const r = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: { 'x-api-key': exaKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, numResults: 4, contents: { text: { maxCharacters: 900 } } }),
      })
      const text = await r.text()
      if (!r.ok) outcomes.push(outcomeFrom('exa', r.status, text))
      else {
        const results = (JSON.parse(text) as { results?: Record<string, any>[] })?.results || []
        if (results.length) {
          outcomes.push(ok('exa'))
          await logApiCall({ api: 'exa', endpoint: 'search', units: 1, source: 'network-add-person' })
          return {
            text: results.map(x => `- ${x.title || ''}: ${String(x.text || '').replace(/\s+/g, ' ').slice(0, 400)}`).join('\n'),
            sources: results.map(x => x.url).filter(Boolean),
            outcomes,
          }
        }
        outcomes.push(empty('exa', 'no results'))
      }
    } catch (e: unknown) { outcomes.push(errored('exa', String((e as Error)?.message || e))) }
  }

  const braveKey = process.env.BRAVE_API_KEY
  if (!braveKey) outcomes.push(skipped('brave'))
  else {
    try {
      const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
        headers: { 'X-Subscription-Token': braveKey, Accept: 'application/json' },
      })
      const text = await r.text()
      if (!r.ok) outcomes.push(outcomeFrom('brave', r.status, text))
      else {
        const results = (JSON.parse(text) as { web?: { results?: Record<string, any>[] } })?.web?.results || []
        if (results.length) {
          outcomes.push(ok('brave'))
          await logApiCall({ api: 'brave', endpoint: 'web/search', units: 1, source: 'network-add-person' })
          return {
            text: results.map(x => `- ${x.title || ''}: ${String(x.description || '').replace(/\s+/g, ' ').slice(0, 300)}`).join('\n'),
            sources: results.map(x => x.url).filter(Boolean),
            outcomes,
          }
        }
        outcomes.push(empty('brave', 'no results'))
      }
    } catch (e: unknown) { outcomes.push(errored('brave', String((e as Error)?.message || e))) }
  }

  return { text: '', sources: [], outcomes }
}

// ── Merge ───────────────────────────────────────────────────────────────────

/** First non-empty wins, in the order the callers are listed. Apify's profile
 *  scrape goes first for the profile-shaped fields (it read the actual page),
 *  PDL and Apollo first for firmographics. */
function pick<T>(...vals: (T | undefined | null)[]): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v
  return undefined
}

function mergeFacts(
  input: PersonInput,
  li: LinkedInProfile | null,
  pdl: Partial<PersonFacts>,
  apollo: Partial<PersonFacts>,
  contributors: string[],
): PersonFacts {
  const career = [li?.experience, pdl.career, apollo.career].find(c => c && c.length) || []
  const skills = [li?.skills, pdl.skills].find(s => s && s.length) || []
  return {
    title: pick(li?.title, pdl.title, apollo.title, input.title ?? undefined),
    company: pick(li?.company, pdl.company, apollo.company, input.company ?? undefined),
    industry: pick(pdl.industry, apollo.industry),
    companySize: pick(pdl.companySize, apollo.companySize),
    location: pick(li?.location, pdl.location, apollo.location, input.location ?? undefined),
    country: pick(pdl.country, apollo.country),
    seniority: pick(pdl.seniority, apollo.seniority),
    headline: pick(li?.headline, apollo.headline, input.headline ?? undefined),
    about: li?.about,
    linkedinUrl: pick(input.linkedinUrl ?? undefined, li?.publicIdentifier ? `https://www.linkedin.com/in/${li.publicIdentifier}` : undefined, pdl.linkedinUrl, apollo.linkedinUrl),
    followerCount: li?.followerCount,
    career,
    skills,
    sourceList: contributors,
  }
}

// ── Judgment ────────────────────────────────────────────────────────────────

function factsBlock(f: PersonFacts): string {
  return [
    f.title ? `Title: ${f.title}` : '',
    f.company ? `Company: ${f.company}${f.industry ? ` (${f.industry})` : ''}` : '',
    f.companySize ? `Company size: ${f.companySize}` : '',
    f.location ? `Location: ${f.location}` : '',
    f.seniority ? `Seniority: ${f.seniority}` : '',
    f.headline ? `LinkedIn headline: ${f.headline}` : '',
    f.about ? `LinkedIn about: ${f.about.slice(0, 800)}` : '',
    f.career.length ? `Career: ${f.career.map(c => `${c.title || ''}${c.company ? ` @ ${c.company}` : ''}${c.dates ? ` (${c.dates})` : ''}`).join('; ')}` : '',
    f.skills.length ? `Skills: ${f.skills.join(', ')}` : '',
    f.followerCount ? `LinkedIn followers: ${f.followerCount}` : '',
  ].filter(Boolean).join('\n')
}

const JUDGMENT_SYSTEM = `You assess a person for an operator's professional network and return ONLY JSON.

Schema:
{
  "who": "one sentence, what they actually do now",
  "why_them": "2-3 sentences: why this person is worth knowing to this operator specifically",
  "hook": "one concrete opening line or shared surface — something real from the evidence, not flattery",
  "risk": "one sentence on what would make this a waste of time, or 'none apparent'",
  "roles": ["subset of: buyer, partner, introducer, guest, operator_peer, investor, hire, none"],
  "seniority": "ic | manager | director | vp | c_level | founder | owner | unknown",
  "industry": "short label or null",
  "best_channel": "linkedin | email | intro | event | unknown",
  "reachable_via": ["short list of surfaces where they are actually reachable"],
  "confidence": "low | medium | high"
}

Rules:
- Ground every claim in the supplied evidence. Invent nothing.
- If the evidence is thin, say so in why_them and set confidence to "low". Do NOT pad.
- "none" is a valid and useful roles answer.
- Return the JSON object only, with no prose, no markdown fence.`

function parseJudgment(raw: string): Judgment | null {
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const j = JSON.parse(text.slice(start, end + 1)) as Record<string, any>
    const roles = (Array.isArray(j.roles) ? j.roles : [])
      .map((r: unknown) => String(r).toLowerCase().trim())
      .filter((r: string) => ROLE_VOCAB.includes(r))
    const conf = ['low', 'medium', 'high'].includes(String(j.confidence)) ? j.confidence : 'low'
    if (!j.who && !j.why_them) return null
    return {
      who: String(j.who || '').slice(0, 600),
      why_them: String(j.why_them || '').slice(0, 1200),
      hook: String(j.hook || '').slice(0, 600),
      risk: String(j.risk || '').slice(0, 600),
      roles: roles.length ? roles : ['none'],
      seniority: j.seniority && j.seniority !== 'unknown' ? String(j.seniority).slice(0, 40) : undefined,
      industry: j.industry ? String(j.industry).slice(0, 80) : undefined,
      best_channel: j.best_channel && j.best_channel !== 'unknown' ? String(j.best_channel).slice(0, 40) : undefined,
      reachable_via: (Array.isArray(j.reachable_via) ? j.reachable_via : []).map((x: unknown) => String(x).slice(0, 60)).slice(0, 6),
      confidence: conf as Judgment['confidence'],
    }
  } catch { return null }
}

// ── The run ─────────────────────────────────────────────────────────────────

export interface EnrichOptions {
  /** Run the paid Apify LinkedIn profile scrape. */
  useApify?: boolean
  /** Skip web research (Perplexity/Exa/Brave) — faster, cheaper. */
  skipWeb?: boolean
  timeoutMs?: number
}

/** Fan out to every configured provider, merge into typed facts, then ask Claude
 *  for the judgment layer.
 *
 *  Returns rather than throws on provider failure. The caller decides what to do
 *  with `summary.blocked` — but it must not treat a run with a non-empty
 *  `blocked` as a completed enrichment. */
export async function enrichPerson(input: PersonInput, opts: EnrichOptions = {}): Promise<EnrichResult> {
  const query = `Research this person: ${input.name}${input.title ? `, ${input.title}` : ''}${input.company ? ` at ${input.company}` : ''}${input.linkedinUrl ? ` (${input.linkedinUrl})` : ''}. What they work on now, recent public activity, and what they care about.`

  const apifyP = opts.useApify && input.linkedinUrl
    ? linkedInProfile(input.linkedinUrl)
    : Promise.resolve({ profile: null, outcome: skipped('apify'), tried: [] })

  const [li, pdl, apollo, web] = await Promise.all([
    apifyP,
    peopleDataLabs(input),
    apolloPerson(input),
    opts.skipWeb
      ? Promise.resolve({ text: '', sources: [], outcomes: [] as ProviderOutcome[] })
      : webResearch(query),
  ])

  const outcomes: ProviderOutcome[] = [li.outcome, pdl.outcome, apollo.outcome, ...web.outcomes]
  const contributors = outcomes.filter(o => o.status === 'ok').map(o => o.api)
  const facts = mergeFacts(input, li.profile, pdl.fields, apollo.fields, contributors)
  const hasEvidence = contributors.length > 0

  // Ask for the judgment only when there is something to judge. A judgment
  // built from the screenshot alone would be the model describing a job title
  // back to itself, dressed as research.
  let judgment: Judgment | null = null
  if (hasEvidence) {
    const evidence = [
      `PERSON: ${input.name}`,
      factsBlock(facts),
      web.text ? `WEB FINDINGS:\n${web.text}` : '',
    ].filter(Boolean).join('\n')
    try {
      const raw = await callClaude({
        system: JUDGMENT_SYSTEM,
        user: evidence,
        maxTokens: 900,
        temperature: 0.3,
        timeoutMs: opts.timeoutMs ?? 25000,
      })
      judgment = parseJudgment(raw)
      if (!judgment) outcomes.push(empty('anthropic', 'judgment JSON did not parse'))
      else outcomes.push(ok('anthropic'))
    } catch (e: unknown) {
      const err = e as Error & { status?: number; body?: string }
      outcomes.push(err.status
        ? outcomeFrom('anthropic', err.status, err.body || err.message)
        : errored('anthropic', String(err?.message || e)))
    }
  }

  return { facts, judgment, sources: web.sources, outcomes, summary: summarise(outcomes), hasEvidence }
}

/** Embed the retrieval text, reporting WHY rather than returning a bare null.
 *
 *  This is the one provider failure that changes what "added to my network"
 *  means. contact_intelligence.embedding is how network_search's semantic
 *  recall path finds anyone; without it the person exists as a row and is
 *  invisible to the surface they were added for. So an OpenAI credit wall here
 *  is blocking, not degrading, and the caller alerts on it. */
export async function embedIntelDoc(intelDoc: string): Promise<{ vector: number[] | null; outcome: ProviderOutcome }> {
  if (!intelDoc.trim()) return { vector: null, outcome: empty('openai', 'nothing to embed') }
  try {
    const vector = await embed({ title: null, body: intelDoc })
    if (!vector) return { vector: null, outcome: skipped('openai') }
    await logApiCall({ api: 'openai', endpoint: 'v1/embeddings', units: 1, source: 'network-add-person' })
    return { vector, outcome: ok('openai') }
  } catch (e: unknown) {
    // embed() throws `openai_<status>:<body>`; recover the status so a spent
    // quota is classified as exhausted rather than as a generic error.
    const msg = String((e as Error)?.message || e)
    const m = /^openai_(\d{3}):([\s\S]*)$/.exec(msg)
    return {
      vector: null,
      outcome: m ? outcomeFrom('openai', Number(m[1]), m[2]) : errored('openai', msg),
    }
  }
}

/** The retrieval text contact_intelligence indexes. Mirrors buildIntelDoc() in
 *  scripts/network/import-intelligence.ts so a person added here is indexed on
 *  exactly the same shape as the 10,670 loaded by the bulk importer. */
export function buildIntelDoc(name: string, facts: PersonFacts, judgment: Partial<Judgment> | null): string {
  return [
    judgment?.who, judgment?.why_them, judgment?.hook,
    name,
    facts.title, facts.company, facts.industry, facts.location || facts.country,
    facts.headline, facts.about,
  ].filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim()
}
