import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { callClaude, loadVoiceBlock, pathId, preamble, robustJson, VOICE_GUARDRAILS } from '../../_content.js'

// POST /api/content-ideas/:id/challenge
//   body: { mode?: 'challenge' | 'counter' | 'hook' | 'sources', source_text?: string }
//
// Enrich + "Challenge this" (Phase 4). Tiered research to make the take STRONGER
// by testing it:
//   1. Perplexity (sonar-pro): the strongest counter-argument + named sources.
//   2. Perplexity, community-scoped: what Reddit / practitioner forums actually say.
//   3. NewsAPI (optional, if NEWSAPI_KEY): dated proof points.
// Then Claude synthesises a steelman of the opposing view, the sharpest counter,
// and a sharpened version of Krish's take (or a commercial hook). Writes the
// result to meta.challenges[]. Sourced, never invented.
//
// Apify community actors (true Reddit/LinkedIn scraping) are async/slow and are a
// planned follow-up (Phase 4b); the community pass here uses a forum-scoped
// Perplexity query so the route stays synchronous and reliable.

const MODES = new Set(['challenge', 'counter', 'hook', 'sources'])

async function perplexity(key: string, system: string, user: string): Promise<{ text: string; citations: string[] }> {
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
}

async function newsapi(key: string, q: string): Promise<string[]> {
  try {
    const r = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=publishedAt&pageSize=5&language=en&apiKey=${key}`)
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok || !Array.isArray(j?.articles)) return []
    return j.articles.map((a: any) => `${a.title} (${a.source?.name}, ${String(a.publishedAt || '').slice(0, 10)}) ${a.url}`).slice(0, 5)
  } catch { return [] }
}

// Apify run-sync: run an actor and get its dataset items in one call. Actor slug
// `user/name` maps to the URL form `user~name`. Bounded by `timeout` seconds so
// /challenge stays responsive; any failure degrades to the Perplexity pass.
async function apifyRun(token: string, slug: string, input: any, timeoutS = 40): Promise<any[]> {
  const path = slug.replace('/', '~')
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), (timeoutS + 8) * 1000)
  try {
    const r = await fetch(
      `https://api.apify.com/v2/acts/${path}/run-sync-get-dataset-items?token=${token}&timeout=${timeoutS}&maxItems=15`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: ctrl.signal },
    )
    if (!r.ok) return []
    const j = await r.json().catch(() => [])
    return Array.isArray(j) ? j : []
  } catch { return [] }
  finally { clearTimeout(t) }
}

// Pull real practitioner takes from Reddit (and optionally LinkedIn) via Apify.
// Returns a digest + the post URLs. Best-effort; empty when unconfigured.
async function apifyCommunity(token: string, query: string): Promise<{ text: string; links: string[] }> {
  const redditActor = process.env.APIFY_REDDIT_ACTOR || 'automation-lab/reddit-scraper'
  const linkedinActor = process.env.APIFY_LINKEDIN_ACTOR // optional; input shape varies
  const [reddit, linkedin] = await Promise.all([
    apifyRun(token, redditActor, { searches: [query], searchPosts: true, skipComments: true, maxItems: 12, sort: 'relevance' }),
    linkedinActor ? apifyRun(token, linkedinActor, { keywords: query, maxItems: 8 }) : Promise.resolve([]),
  ])
  const lines: string[] = []
  const links: string[] = []
  for (const p of reddit.slice(0, 12)) {
    const title = p.title || p.text || p.body || ''
    const url = p.url || p.link || p.permalink
    const up = p.upVotes ?? p.score ?? p.numberOfVotes
    if (title) lines.push(`[Reddit${up != null ? ` ↑${up}` : ''}] ${String(title).slice(0, 220)}`)
    if (url) links.push(String(url))
  }
  for (const p of (linkedin as any[]).slice(0, 8)) {
    const text = p.text || p.content || p.title || ''
    const url = p.url || p.postUrl || p.link
    if (text) lines.push(`[LinkedIn] ${String(text).slice(0, 220)}`)
    if (url) links.push(String(url))
  }
  return { text: lines.join('\n'), links: Array.from(new Set(links)) }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  const id = pathId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })

  const b = (req.body || {}) as { mode?: string; source_text?: string }
  const mode = b.mode && MODES.has(b.mode) ? b.mode : 'challenge'

  const pplxKey = process.env.PERPLEXITY_API_KEY
  if (!pplxKey) return res.status(500).json({ ok: false, error: 'PERPLEXITY_API_KEY not configured' })

  const { data: idea, error } = await supabase
    .from('content_ideas').select('idea,thesis,body,meta').eq('id', id).single()
  if (error || !idea) return res.status(404).json({ ok: false, error: 'idea not found' })

  const topic = `${idea.idea}${idea.thesis ? ` — thesis: ${idea.thesis}` : ''}`
  const draft = (b.source_text || idea.body || '').slice(0, 2000)

  // Tier 1-3: counter-evidence (Perplexity), community read (real Apify Reddit/
  // LinkedIn when configured, else Perplexity forum pass), and dated news.
  const apifyToken = process.env.APIFY_TOKEN
  const [counter, pplxCommunity, news, apifyComm] = await Promise.all([
    perplexity(pplxKey,
      'You are a sharp research analyst building the strongest possible case AGAINST a claim. Cite urls. Named facts, figures, dated events only.',
      `Build the strongest evidence-based counter-argument to this take: "${topic}". What would a smart skeptic cite? Give named companies, figures, and dated counter-examples.`),
    perplexity(pplxKey,
      'You surface what practitioners actually say on Reddit, Hacker News, and professional forums. Cite urls. Report real positions, including disagreement.',
      `On forums (Reddit, HN, LinkedIn discussions), what do operators and builders actually say about: "${topic}"? Surface the strongest dissenting and supporting practitioner takes, with links.`),
    process.env.NEWSAPI_KEY ? newsapi(process.env.NEWSAPI_KEY, idea.idea) : Promise.resolve([]),
    apifyToken ? apifyCommunity(apifyToken, idea.idea) : Promise.resolve({ text: '', links: [] }),
  ])

  // Real scraped community takes lead; the Perplexity forum pass supplements.
  const community = {
    text: [apifyComm.text ? `REAL COMMUNITY POSTS (Apify):\n${apifyComm.text}` : '', pplxCommunity.text].filter(Boolean).join('\n\n'),
    citations: [...apifyComm.links, ...pplxCommunity.citations],
  }
  const citations = Array.from(new Set([...counter.citations, ...community.citations].filter(Boolean)))

  if (mode === 'sources') {
    // Just enrich research, no synthesis.
    const meta = (idea.meta || {}) as any
    const research = Array.from(new Set([...(Array.isArray(meta.research) ? meta.research : []), ...citations]))
    await supabase.from('content_ideas').update({ meta: { ...meta, research }, updated_at: new Date().toISOString() }).eq('id', id)
    return res.status(200).json({ ok: true, mode, citations, news })
  }

  const voice = await loadVoiceBlock()
  const intent =
    mode === 'counter' ? 'Surface the single strongest counter-argument the reader will raise, then how the take survives it.'
    : mode === 'hook' ? 'Add a commercial hook: the explicit business mechanic / revenue consequence that makes this matter to an operator. Ground it, never inflate.'
    : 'Make the take STRONGER by testing it: steelman the opposing view, then dismantle it, then state a sharper version of the original take.'

  const system = [
    'You are Cleo, pressure-testing a content take for Krish Raja (British-Australian founder-operator, runs a production AI agent fleet). The wit\'s spike points at the idea/vendor/hype, NEVER at the reader. Steelman before you dismantle. Never invent numbers or quotes — only use the evidence provided, and flag gaps.',
    voice ? `\nVOICE REFERENCE:\n${voice}` : '',
    '\n' + VOICE_GUARDRAILS,
    '\nReturn ONLY JSON: {"steelman":string,"counter":string,"sharper_take":string,"commercial_hook":string|null,"gaps":string|null}',
  ].join('\n')

  const user = [
    `TAKE: ${topic}`,
    draft ? `\nCURRENT DRAFT:\n${draft}` : '',
    `\nCOUNTER-EVIDENCE (Perplexity):\n${counter.text || '(none returned)'}`,
    `\nPRACTITIONER / COMMUNITY READ:\n${community.text || '(none returned)'}`,
    news.length ? `\nDATED NEWS:\n${news.join('\n')}` : '',
    `\nINTENT: ${intent}`,
  ].filter(Boolean).join('\n')

  let parsed: any
  try {
    parsed = robustJson(await callClaude({ system, user, maxTokens: 1800, temperature: 0.5 }))
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) })
  }
  if (!parsed) return res.status(502).json({ ok: false, error: 'could not parse synthesis' })

  const meta = (idea.meta || {}) as any
  const challenges = Array.isArray(meta.challenges) ? meta.challenges : []
  const entry = { mode, ...parsed, citations, news, at: new Date().toISOString() }
  challenges.unshift(entry)
  const research = Array.from(new Set([...(Array.isArray(meta.research) ? meta.research : []), ...citations]))
  await supabase.from('content_ideas')
    .update({ meta: { ...meta, challenges: challenges.slice(0, 12), research }, updated_at: new Date().toISOString() })
    .eq('id', id)

  return res.status(200).json({ ok: true, mode, entry })
}
