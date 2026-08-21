import { supabase } from './_supabase.js'
import { callClaude, robustJson } from './_content.js'
import { runNetworkSearch } from './_networkSearch.js'

// ─────────────────────────────────────────────────────────────────────────────
// Guest sources — the five places a person worth interviewing comes from.
//
// This replaces the old single-source scout, which seeded from a hardcoded
// curatedVoices array plus the lens_seed_candidates table. Both were dry: the
// curated voices were all already in `guests` so the dedup emptied the list
// every run, and lens_seed_candidates has never held a row. The scout therefore
// wrote zero guests and returned ok:true, which is the worst possible failure
// shape because nothing looks broken. Guests stopped arriving on 2026-08-05 and
// no alarm fired.
//
// The rule that follows: every source here reports what it FOUND and what it
// SKIPPED, the orchestrator refuses to call a run healthy when every source
// returned nothing, and a source that cannot run says so by name rather than
// quietly contributing an empty array.
//
// Each source is independently gated on its own key and degrades alone. With no
// keys at all the network source still works, because it reads Postgres.
// ─────────────────────────────────────────────────────────────────────────────

export type DiscoverySource = 'network' | 'radar' | 'web' | 'linkedin' | 'events'
export type GuestFormat = 'built' | 'paid' | 'either'

export interface GuestCandidate {
  name: string
  linkedin: string | null
  email: string | null
  company: string | null
  title: string | null
  /** Free text the fit scorer and the drafter both read. */
  context: string
  /** Which source produced this person. */
  discoverySource: DiscoverySource
  /** True when they are already in the contacts network. */
  inNetwork: boolean
  contactId: string | null
  /** What the claim rests on. Never empty: a candidate with no evidence is a guess. */
  evidence: { kind: string; label: string; url: string | null }[]
  /** 0..1, source-local. The orchestrator blends this with the format fit. */
  sourceScore: number
}

const clamp = (n: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, n))

export const normName = (s: string | null | undefined): string =>
  (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

export const normLinkedIn = (s: string | null | undefined): string => {
  if (!s) return ''
  return String(s)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .replace(/\?.*$/, '')
}

// A LinkedIn keyword search for "AI agent architecture" returns as many job ads
// as opinions, and a job ad is dense in exactly the vocabulary the format
// scorer rewards, so recruiters were outranking builders. The first live run
// wrote three: "Hiring: Agentforce Architect", "We're hiring a Staff Software
// Developer". The author of a job ad is a recruiter, not someone with a view on
// the thing, so the post is dropped before it ever reaches scoring.
const RECRUITING_POST = /\b(hiring|we are hiring|we're hiring|now hiring|job alert|apply now|job opening|open role|open position|join our team|send your (cv|resume)|recruiting for|vacancy|jd\b|full[- ]time role|contract role)\b/i

/** True for posts that are recruitment advertising rather than a point of view. */
export function isRecruitingPost(text: string): boolean {
  const t = (text || '').slice(0, 600)
  if (!t) return false
  if (RECRUITING_POST.test(t)) return true
  // Job ads are also recognisable by shape: a stack of labelled fields.
  const fieldish = (t.match(/(location|salary|experience|years?|onsite|hybrid|remote|apply|role|position)\s*[:|]/gi) || []).length
  return fieldish >= 3
}

/** A person name has to look like one. Web and LinkedIn sources otherwise
 *  return company names, article titles and "Read more" as people. */
export function looksLikePerson(name: string): boolean {
  const t = (name || '').trim()
  if (t.length < 4 || t.length > 60) return false
  const words = t.split(/\s+/)
  if (words.length < 2 || words.length > 4) return false
  // Every word starts with a capital, no digits, no obvious org suffix.
  if (!/^[A-Z]/.test(t)) return false
  if (/\d/.test(t)) return false
  if (/\b(inc|ltd|llc|gmbh|corp|group|labs?|media|ventures?|capital|partners|studio|agency|podcast|show|newsletter)\b/i.test(t)) return false
  return words.every(w => /^[A-Z][a-zA-Z'’.-]*$/.test(w))
}

// ── 1. Network ───────────────────────────────────────────────────────────────
// Krish's own 10,767 contacts, ranked by the existing network_search RPC
// (semantic + lexical + constraint + relationship + actionability). This is the
// source the old scout never touched at all, and it is the one he asked to run
// FIRST: a warm intro beats a cold web result every time.

export async function fromNetwork(
  brief: string,
  format: GuestFormat,
  limit: number,
): Promise<{ candidates: GuestCandidate[]; note: string }> {
  try {
    const r = await runNetworkSearch({ question: brief, limit, rerank: false })
    const candidates: GuestCandidate[] = []
    for (const p of r.results) {
      if (!p.full_name) continue
      // The network scorer ranks for reachability as much as fit, so a low
      // query_relevance here means "well connected but not about this". Those
      // are exactly the people who make a scout look stupid.
      const rel = Number(p.query_relevance ?? 0)
      if (rel < 0.12) continue
      candidates.push({
        name: p.full_name,
        linkedin: p.linkedin_url,
        email: p.email,
        company: p.company,
        title: p.title,
        context: [p.who, p.why_them, p.hook].filter(Boolean).join('. ').slice(0, 900),
        discoverySource: 'network',
        inNetwork: true,
        contactId: p.contact_id,
        evidence: [{
          kind: 'network',
          label: `In network (${p.network_tier || 'unknown tier'})${p.why_them ? `: ${p.why_them.slice(0, 160)}` : ''}`,
          url: p.linkedin_url,
        }],
        sourceScore: clamp(rel),
      })
    }
    return {
      candidates,
      note: `network: ${candidates.length} of ${r.results.length} cleared relevance${r.degraded.length ? ` (degraded: ${r.degraded.join(', ')})` : ''}`,
    }
  } catch (e) {
    return { candidates: [], note: `network: FAILED ${(e as Error)?.message?.slice(0, 120) || 'error'}` }
  }
}

// ── 2. Radar ─────────────────────────────────────────────────────────────────
// People the content engine already surfaced. Two inputs: lens_seed_candidates
// (author column, when the lens radar has run) and the shift evidence the
// investigation pipeline collected. A voice worth citing is a voice worth
// booking, which is the content-to-guest flywheel the old scout described in a
// comment but only half-implemented.

export async function fromRadar(
  format: GuestFormat,
  freshDays: number,
): Promise<{ candidates: GuestCandidate[]; note: string }> {
  const sinceISO = new Date(Date.now() - freshDays * 86_400_000).toISOString()
  const out: GuestCandidate[] = []
  const seen = new Set<string>()
  const notes: string[] = []

  // 2a. lens_seed_candidates.author — kept because when the lens radar is
  //     healthy this is the highest-precision radar signal we have.
  try {
    const { data } = await supabase
      .from('lens_seed_candidates')
      .select('author,text,source_url,fit_score')
      .not('author', 'is', null)
      .gte('occurred_at', sinceISO)
      .limit(200)
    for (const r of (data ?? []) as { author: string | null; text: string | null; source_url: string | null; fit_score: number | null }[]) {
      const name = (r.author || '').trim()
      if (!looksLikePerson(name) || seen.has(normName(name))) continue
      seen.add(normName(name))
      out.push({
        name, linkedin: null, email: null, company: null, title: null,
        context: (r.text || '').slice(0, 700),
        discoverySource: 'radar', inNetwork: false, contactId: null,
        evidence: [{ kind: 'radar', label: 'Surfaced by the lens radar', url: r.source_url }],
        sourceScore: clamp(Number(r.fit_score ?? 0.5)),
      })
    }
    notes.push(`lens_seed_candidates: ${data?.length ?? 0} rows`)
  } catch (e) {
    notes.push(`lens_seed_candidates: FAILED ${(e as Error)?.message?.slice(0, 80)}`)
  }

  // 2b. shift_evidence headlines. There is no author column, so the names have
  //     to be read out of the headline text by a model. Cheap (one call over a
  //     batch) and gated: with no key this contributes nothing rather than
  //     regex-guessing names out of prose, which produced garbage in testing.
  try {
    const { data: ev } = await supabase
      .from('shift_evidence')
      .select('headline,url,source,occurred_on,shift_id')
      .eq('citable', true)
      .gte('occurred_on', sinceISO.slice(0, 10))
      .order('occurred_on', { ascending: false })
      .limit(120)
    const rows = (ev ?? []) as { headline: string | null; url: string | null; source: string | null }[]
    if (rows.length && process.env.ANTHROPIC_API_KEY) {
      const extracted = await extractPeopleFromHeadlines(rows.map(r => r.headline || '').filter(Boolean))
      const byHeadline = new Map(rows.map(r => [(r.headline || '').slice(0, 120), r]))
      for (const p of extracted) {
        if (!looksLikePerson(p.name) || seen.has(normName(p.name))) continue
        seen.add(normName(p.name))
        const src = byHeadline.get((p.headline || '').slice(0, 120))
        out.push({
          name: p.name, linkedin: null, email: null, company: p.company || null, title: p.title || null,
          context: `${p.headline}. ${p.why || ''}`.slice(0, 700),
          discoverySource: 'radar', inNetwork: false, contactId: null,
          evidence: [{ kind: 'shift', label: `Named in shift evidence: ${(p.headline || '').slice(0, 140)}`, url: src?.url ?? null }],
          sourceScore: 0.6,
        })
      }
      notes.push(`shift_evidence: ${rows.length} headlines, ${extracted.length} people`)
    } else {
      notes.push(`shift_evidence: ${rows.length} headlines, extraction skipped (${process.env.ANTHROPIC_API_KEY ? 'no rows' : 'no ANTHROPIC_API_KEY'})`)
    }
  } catch (e) {
    notes.push(`shift_evidence: FAILED ${(e as Error)?.message?.slice(0, 80)}`)
  }

  return { candidates: out, note: `radar: ${out.length} found (${notes.join('; ')})` }
}

interface ExtractedPerson { name: string; company?: string; title?: string; headline?: string; why?: string }

async function extractPeopleFromHeadlines(headlines: string[]): Promise<ExtractedPerson[]> {
  if (!headlines.length) return []
  try {
    const text = await callClaude({
      model: 'claude-sonnet-4-6',
      system:
        'You extract named individual PEOPLE from news headlines. Return only real named humans who are ' +
        'operators, founders or executives, never journalists, never companies, never analysts quoted in ' +
        'passing. If a headline names no such person, skip it entirely. Never invent a name.',
      user:
        `HEADLINES:\n${headlines.slice(0, 120).map((h, i) => `${i + 1}. ${h}`).join('\n')}\n\n` +
        'Reply ONLY with JSON: {"people":[{"name":"","company":"","title":"","headline":"<the headline verbatim>","why":"<why they are interesting in one clause>"}]}',
      maxTokens: 1800,
      temperature: 0,
      timeoutMs: 30_000,
    })
    const j = robustJson(text) as { people?: ExtractedPerson[] } | null
    return Array.isArray(j?.people) ? j!.people!.filter(p => p && typeof p.name === 'string') : []
  } catch {
    return []
  }
}

// ── 3. Web ───────────────────────────────────────────────────────────────────
// Live search for operators talking about the format's subject right now.
// Perplexity answers "who is saying this" better than Exa, Exa finds the
// primary documents better. Both run when both keys exist; either alone works.

export async function fromWeb(
  brief: string,
  format: GuestFormat,
  queries: string[],
): Promise<{ candidates: GuestCandidate[]; note: string }> {
  const out: GuestCandidate[] = []
  const seen = new Set<string>()
  const notes: string[] = []

  const pplxKey = process.env.PERPLEXITY_API_KEY
  const exaKey = process.env.EXA_API_KEY
  if (!pplxKey && !exaKey) return { candidates: [], note: 'web: SKIPPED (no PERPLEXITY_API_KEY or EXA_API_KEY)' }

  for (const q of queries) {
    if (pplxKey) {
      try {
        const r = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${pplxKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'sonar-pro',
            messages: [
              {
                role: 'system',
                content:
                  'You find NAMED individual operators, founders and executives, with their company and role. ' +
                  'Never return journalists, analysts, consultants selling a framework, or companies. ' +
                  'Only people who have personally done the thing. Never invent a person.',
              },
              {
                role: 'user',
                content:
                  `${q}\n\nReply ONLY with JSON: {"people":[{"name":"","company":"","title":"","why":"<the specific thing they did, with a number or a date if you have one>"}]}. ` +
                  'Maximum 8 people. If you cannot name real people, return {"people":[]}.',
              },
            ],
            temperature: 0.1,
            max_tokens: 1200,
          }),
        })
        const j: any = await r.json().catch(() => ({}))
        if (r.ok) {
          const parsed = robustJson(j?.choices?.[0]?.message?.content || '') as { people?: ExtractedPerson[] } | null
          const citations: string[] = Array.isArray(j?.citations) ? j.citations : []
          for (const p of parsed?.people ?? []) {
            if (!p?.name || !looksLikePerson(p.name) || seen.has(normName(p.name))) continue
            seen.add(normName(p.name))
            out.push({
              name: p.name, linkedin: null, email: null,
              company: p.company || null, title: p.title || null,
              context: `${p.title || ''} ${p.company ? `at ${p.company}` : ''}. ${p.why || ''}`.trim().slice(0, 700),
              discoverySource: 'web', inNetwork: false, contactId: null,
              evidence: [{ kind: 'web', label: `Perplexity: ${(p.why || q).slice(0, 180)}`, url: citations[0] ?? null }],
              sourceScore: 0.62,
            })
          }
        } else {
          notes.push(`perplexity ${r.status}`)
        }
      } catch (e) {
        notes.push(`perplexity FAILED ${(e as Error)?.message?.slice(0, 60)}`)
      }
    }

    if (exaKey) {
      try {
        const r = await fetch('https://api.exa.ai/search', {
          method: 'POST',
          headers: { 'x-api-key': exaKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: q,
            numResults: 6,
            type: 'auto',
            contents: { text: { maxCharacters: 700 } },
          }),
        })
        const j: any = await r.json().catch(() => ({}))
        const results: any[] = Array.isArray(j?.results) ? j.results : []
        if (r.ok && results.length && process.env.ANTHROPIC_API_KEY) {
          const people = await extractPeopleFromHeadlines(
            results.map(x => `${x.title || ''}: ${(x.text || '').replace(/\s+/g, ' ').slice(0, 300)}`),
          )
          for (const p of people) {
            if (!looksLikePerson(p.name) || seen.has(normName(p.name))) continue
            seen.add(normName(p.name))
            out.push({
              name: p.name, linkedin: null, email: null,
              company: p.company || null, title: p.title || null,
              context: `${p.headline || ''} ${p.why || ''}`.slice(0, 700),
              discoverySource: 'web', inNetwork: false, contactId: null,
              evidence: [{ kind: 'web', label: `Exa: ${(p.headline || q).slice(0, 180)}`, url: results[0]?.url ?? null }],
              sourceScore: 0.55,
            })
          }
        } else if (!r.ok) {
          notes.push(`exa ${r.status}`)
        }
      } catch (e) {
        notes.push(`exa FAILED ${(e as Error)?.message?.slice(0, 60)}`)
      }
    }
  }

  return { candidates: out, note: `web: ${out.length} found across ${queries.length} queries${notes.length ? ` (${notes.join(', ')})` : ''}` }
}

// ── 4. LinkedIn (Apify) ──────────────────────────────────────────────────────
// harvestapi/linkedin-post-search is the registry's primary post-search actor
// (36 runs, cheapest at scale, zero-result guard). People posting substantively
// on the format's subject this month are, by construction, people with a
// current opinion worth recording.

// Each actor has its OWN input schema and they are not interchangeable. Both
// were being sent `{ keywords, searchQuery, maxItems }`, which neither declares,
// so the actor ran, parsed an empty search and exited 0 with an empty dataset.
// A successful run returning nothing is indistinguishable from a bad query
// unless you read the actor log, which is how this stayed invisible.
//
// Verified against each actor's published input schema on 2026-08-13.
function actorInput(slug: string, keywords: string[], maxPosts: number): Record<string, unknown> {
  if (slug.startsWith('benjarapi/')) {
    return {
      keywords: keywords.join(' OR '),
      maxPosts,
      datePosted: 'past-month',
      sortBy: 'relevance',
    }
  }
  // harvestapi/linkedin-post-search and anything else registry-shaped.
  return {
    searchQueries: keywords,
    maxPosts,
    postedLimit: 'month',
    sortBy: 'relevance',
  }
}

export async function fromLinkedIn(
  keywords: string[],
  maxPosts: number,
): Promise<{ candidates: GuestCandidate[]; note: string }> {
  const token = process.env.APIFY_TOKEN
  if (!token) return { candidates: [], note: 'linkedin: SKIPPED (no APIFY_TOKEN)' }

  // Resolve actors from the registry rather than hardcoding, so a kill switch
  // on a misbehaving actor takes effect without a deploy. Primary first, then
  // the registered fallback: a zero-result primary is worth one retry
  // elsewhere, because "LinkedIn returned nothing" and "this actor is broken"
  // look identical from one run.
  let slugs = ['harvestapi/linkedin-post-search', 'benjarapi/linkedin-post-search']
  try {
    const { data } = await supabase
      .from('apify_actor_registry')
      .select('actor_slug,is_primary,killed')
      .eq('task_category', 'linkedin_post_search')
      .eq('killed', false)
      .order('is_primary', { ascending: false })
    const registered = ((data ?? []) as { actor_slug: string }[]).map(r => r.actor_slug).filter(Boolean)
    if (registered.length) slugs = registered
  } catch { /* keep the defaults */ }

  const out: GuestCandidate[] = []
  const seen = new Set<string>()
  const tried: string[] = []
  let skippedAds = 0

  for (const slug of slugs.slice(0, 2)) {
    const actor = slug.replace('/', '~')
    try {
      const r = await fetch(
        `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}&timeout=90`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(actorInput(slug, keywords, maxPosts)),
        },
      )
      if (!r.ok) {
        const t = await r.text().catch(() => '')
        tried.push(`${slug} HTTP ${r.status} ${t.slice(0, 60)}`)
        continue
      }
      const items = (await r.json().catch(() => [])) as any[]
      const count = Array.isArray(items) ? items.length : 0
      tried.push(`${slug} ${count} posts`)
      for (const it of Array.isArray(items) ? items : []) {
        const a = it?.author || it?.actor || {}
        const name = String(a.name || a.fullName || [a.firstName, a.lastName].filter(Boolean).join(' ') || '').trim()
        if (!looksLikePerson(name) || seen.has(normName(name))) continue
        const postText = String(it?.content || it?.text || it?.postContent || '')
        if (isRecruitingPost(postText)) { skippedAds++; continue }
        seen.add(normName(name))
        const url = a.linkedinUrl || a.url || a.profileUrl || it?.authorProfileUrl || null
        out.push({
          name,
          linkedin: url ? String(url) : null,
          email: null,
          company: a.companyName || a.company || null,
          title: a.headline || a.occupation || a.position || null,
          context: postText.replace(/\s+/g, ' ').slice(0, 700),
          discoverySource: 'linkedin', inNetwork: false, contactId: null,
          evidence: [{
            kind: 'linkedin',
            label: `Posted on this in the last month: ${postText.replace(/\s+/g, ' ').slice(0, 160)}`,
            url: it?.url || it?.postUrl || url || null,
          }],
          sourceScore: 0.58,
        })
      }
      if (out.length) break
    } catch (e) {
      tried.push(`${slug} FAILED ${(e as Error)?.message?.slice(0, 60)}`)
    }
  }

  // Zero is reported as DEGRADED, never as a clean empty. These actors exit 0
  // with an empty dataset when a query simply matches nothing on LinkedIn, so a
  // healthy run and a broken one look identical from the status code alone.
  // Naming the actor and its post count in the note is what separates them.
  return {
    candidates: out,
    note: out.length
      ? `linkedin: ${out.length} authors${skippedAds ? `, ${skippedAds} job ads skipped` : ''} (${tried.join('; ')})`
      : `linkedin: DEGRADED 0 authors${skippedAds ? `, ${skippedAds} job ads skipped` : ''}, actors ran but yielded no usable posts (${tried.join('; ')})`,
  }
}

// ── 5. Events ────────────────────────────────────────────────────────────────
// The conference circuit. visibility_targets already holds 57 events with a
// past_speakers column, but every one of them is empty, so this source reads
// the column when it is populated AND fills it when it is not: a lineup fetched
// once is worth keeping, and it is the same data the Events lane wants anyway.
//
// Someone booked to speak at an event Krish would speak at has already been
// vetted by a programme committee, and is already comfortable on a microphone.

export async function fromEvents(
  maxEvents: number,
): Promise<{ candidates: GuestCandidate[]; note: string; backfilled: number }> {
  const out: GuestCandidate[] = []
  const seen = new Set<string>()
  let backfilled = 0
  const notes: string[] = []

  const { data, error } = await supabase
    .from('visibility_targets')
    .select('id,title,event_url,source_url,past_speakers,audience_sector,event_start_at')
    .is('buried_at', null)
    .not('status', 'in', '("dropped","rejected")')
    .order('event_start_at', { ascending: false, nullsFirst: false })
    .limit(maxEvents)
  if (error) return { candidates: [], note: `events: FAILED ${error.message.slice(0, 120)}`, backfilled: 0 }

  const rows = (data ?? []) as {
    id: string; title: string | null; event_url: string | null; source_url: string | null
    past_speakers: unknown; audience_sector: string | null
  }[]

  for (const ev of rows) {
    let speakers: ExtractedPerson[] = []
    const stored = Array.isArray(ev.past_speakers) ? (ev.past_speakers as any[]) : []

    if (stored.length) {
      speakers = stored
        .map((s): ExtractedPerson => (typeof s === 'string'
          ? { name: s }
          : { name: String(s?.name ?? ''), company: s?.company, title: s?.title }))
        .filter(s => Boolean(s.name))
    } else if (process.env.PERPLEXITY_API_KEY && ev.title) {
      // Fetch the lineup once, then persist it so the next run is free.
      const found = await speakersForEvent(ev.title, ev.event_url || ev.source_url)
      if (found.length) {
        speakers = found
        const { error: upErr } = await supabase
          .from('visibility_targets')
          .update({ past_speakers: found, updated_at: new Date().toISOString() })
          .eq('id', ev.id)
        if (!upErr) backfilled++
      }
    }

    for (const s of speakers) {
      if (!s.name || !looksLikePerson(s.name) || seen.has(normName(s.name))) continue
      seen.add(normName(s.name))
      out.push({
        name: s.name, linkedin: null, email: null,
        company: s.company || null, title: s.title || null,
        context: `Spoke at ${ev.title}. ${s.title || ''} ${s.company ? `at ${s.company}` : ''}`.trim().slice(0, 700),
        discoverySource: 'events', inNetwork: false, contactId: null,
        evidence: [{ kind: 'event', label: `On the speaker list for ${ev.title}`, url: ev.event_url || ev.source_url }],
        sourceScore: 0.6,
      })
    }
  }

  if (!process.env.PERPLEXITY_API_KEY) notes.push('no PERPLEXITY_API_KEY, stored lineups only')
  return {
    candidates: out,
    note: `events: ${out.length} speakers from ${rows.length} events, ${backfilled} lineups backfilled${notes.length ? ` (${notes.join(', ')})` : ''}`,
    backfilled,
  }
}

async function speakersForEvent(title: string, url: string | null): Promise<ExtractedPerson[]> {
  const key = process.env.PERPLEXITY_API_KEY
  if (!key) return []
  try {
    const r = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: 'You list confirmed speakers for a named event. Only real, verifiable names. Never invent a speaker. If you cannot verify the lineup, return an empty list.' },
          {
            role: 'user',
            content:
              `Who are the confirmed or past speakers at "${title}"${url ? ` (${url})` : ''}? ` +
              'Reply ONLY with JSON: {"people":[{"name":"","company":"","title":""}]}. Maximum 12. Empty list if unverifiable.',
          },
        ],
        temperature: 0,
        max_tokens: 900,
      }),
    })
    if (!r.ok) return []
    const j: any = await r.json().catch(() => ({}))
    const parsed = robustJson(j?.choices?.[0]?.message?.content || '') as { people?: ExtractedPerson[] } | null
    return Array.isArray(parsed?.people) ? parsed!.people!.filter(p => p?.name) : []
  } catch {
    return []
  }
}
