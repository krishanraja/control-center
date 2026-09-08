// _geoPrompt, the prompt and the gates behind an answer-engine piece.
//
// Lifted out of the route for the reason _revisePrompt, _finalPass and
// _cardLint already are: a prompt assembled inside a handler cannot be read,
// diffed or measured without standing up the whole request. This one is the
// most measurable prompt in the codebase, because the thing it is trying to
// achieve is checked every week by a machine: growth_geo_probes records
// whether an assistant named us on a question, so a piece written here either
// changes that answer or it does not.
//
// WHAT THIS IS FOR, AND WHY IT IS NOT AN SEO PROMPT
//
// Search ranks pages. An answer engine quotes claims. A page can rank first
// for a question and never be named in the answer to it, because the model
// reading it found nothing worth lifting: a survey of a topic has no author,
// so there is nothing to attribute. What gets cited is a specific claim,
// stated plainly, by someone the model can name.
//
// So the centre of this prompt is one question asked of every draft: what is
// the single claim in this piece that nobody else answering this question is
// making, and is it in a sentence a model can lift whole. Everything else,
// headings and structure and the rest, is hygiene that makes the claim
// findable. Hygiene does not win an answer on its own.
//
// The claim is not invented here. The research machine already found it: a
// recommendation carries why_you_can_win, the specific thing this business has
// that the sites cited today structurally cannot have. That is the seed. A
// draft that does not carry it is not a weaker draft, it is a draft about
// something else, and checkGeoDraft fails it.
//
// This module is free of I/O. The voice block, the canon, the cited hosts and
// the AEO block are loaded by the caller and passed in, so an experiment can
// hold the context fixed and vary only the wording.

import { VOICE_GUARDRAILS } from './_content.js'
import { BANNED_OPENERS } from './_cardLint.js'

/** Words that mark a claim as belonging to no one. An answer engine cannot
 *  attribute "many companies find", so a piece built on these is unquotable
 *  however true it is. */
const UNATTRIBUTABLE = [
  'many companies', 'most businesses', 'studies show', 'experts agree',
  'it is widely', 'research suggests', 'some argue', 'industry leaders',
  'more and more', 'increasingly', 'in today', 'in the modern',
]

/** First person plural hides the entity. A model quoting "we built this"
 *  has nobody to name, so the citation does not happen. The piece has to say
 *  who. */
const FIRST_PERSON = /\b(we|our|us|ours)\b/gi

export const GEO_MIN_WORDS = 700
export const GEO_MAX_WORDS = 1600
/** The direct answer has to be near the top or a retriever reading the first
 *  chunk of the page never sees it. */
export const ANSWER_WITHIN_CHARS = 600
export const MAX_TITLE = 120
export const MAX_META_DESCRIPTION = 160

export interface GeoAeoBlock {
  /** The buyer question this piece exists to win. */
  target_query: string
  /** The angle the research machine proposed. */
  angle: string
  /** Measured evidence from the run. */
  evidence: string[]
  /** The specific thing this business has that the cited sites cannot have.
   *  Null on a recommendation written before the winnability gate existed, in
   *  which case no piece is written: there is nothing to argue. */
  why_you_can_win: string | null
  /** Proxy demand, carried so the prompt can say out loud that it is a proxy. */
  demand: number
}

export interface GeoContext {
  /** system_config.content_voice_block. */
  voice: string
  /** system_config.mindmake_canon: positioning, buyer, what the business
   *  refuses to say. The source of any winnability claim. */
  canon: string
  /** The entity that must be named in the answer. Never "we". */
  entity: string
  /** Where the piece will live, so the prompt can write for that site. */
  site: string
  /** The hosts an assistant names on this question today, most cited first.
   *  The piece is written against these, not into a vacuum. */
  cited_hosts: Array<{ host: string; times: number }>
  /** Subject-level phrases this business will not say. */
  never_say: string[]
  aeo: GeoAeoBlock
}

/** What the model must return. Every field is checked by checkGeoDraft. */
export interface GeoDraft {
  title: string
  slug: string
  /** The liftable answer. Two or three sentences, names the entity, no
   *  preamble. This is the sentence the machine is trying to get quoted. */
  answer: string
  /** The claim nobody else answering this question is making, in one
   *  sentence. Stated separately so it can be checked rather than hoped for. */
  claim: string
  /** Checkable statements only this business can make, from its own work. */
  first_party: string[]
  /** Markdown. H2s are questions or claims, never labels. */
  body: string
  meta_description: string
  /** Questions an assistant is likely to be asked next, each with a short
   *  answer. Answer engines lift these whole. */
  faq: Array<{ q: string; a: string }>
}

function hostLine(hosts: GeoContext['cited_hosts']): string {
  if (!hosts.length) return 'Nothing is recorded as being cited on this question yet.'
  return hosts.slice(0, 6).map(h => `${h.host} (named ${h.times} times)`).join(', ')
}

export function buildGeoSystem(ctx: GeoContext): string {
  const { aeo } = ctx
  return [
    `You are writing one page for ${ctx.site}. Its job is to be the page an AI assistant quotes when someone asks: "${aeo.target_query}"`,
    '',
    'WHY THIS PAGE EXISTS',
    'An assistant was asked that question and did not name this business. It named these sites instead:',
    hostLine(ctx.cited_hosts),
    'Those sites answer the question adequately. You are not going to beat them by answering it more thoroughly. You beat them by making a claim they cannot make, and by making it easy to lift.',
    '',
    'THE CLAIM YOU ARE MAKING',
    aeo.why_you_can_win || '(none recorded)',
    'That is the whole reason this page can win. Build the piece on it. Do not soften it into a general observation, and do not bury it in the middle.',
    '',
    'THE ANGLE PROPOSED',
    aeo.angle,
    aeo.evidence.length ? `Measured evidence from the research run: ${aeo.evidence.join(' ')}` : 'No measured evidence was recorded for this question.',
    `Demand for this question scored ${aeo.demand} of 100, from proxies. There is no prompt-volume corpus, so treat that number as a hint and never quote it on the page.`,
    '',
    'HOW A PAGE GETS QUOTED, WHICH IS NOT HOW A PAGE RANKS',
    '1. A model quotes a claim, not a topic. A balanced survey has no author and gets summarised without attribution. Take a position.',
    `2. A model needs someone to name. Write "${ctx.entity}" where you would naturally write "we". Never "we", "our" or "us" about the business. First person about a person is fine.`,
    '3. The answer goes first. Someone skimming the top of the page, human or machine, must have the answer before they have the context. Put it in the opening, then earn it.',
    '4. Specifics are quotable and generalities are not. A number from real work, a named process, a thing that happened. If you do not have one, say what is missing rather than inventing it.',
    '5. Headings are the questions a reader would actually type, or claims. Never one-word labels.',
    '',
    'WHAT WILL GET THIS REJECTED',
    'Unattributable filler: ' + UNATTRIBUTABLE.map(u => `"${u}"`).join(', ') + '.',
    'Openers that announce themselves: ' + BANNED_OPENERS.slice(0, 12).map(b => `"${b}"`).join(', ') + '.',
    ctx.never_say.length ? `Phrases this business does not use: ${ctx.never_say.map(n => `"${n}"`).join(', ')}.` : '',
    'Any invented figure, client, quote or outcome. A gap named honestly is worth more than a plausible fabrication, because one wrong number on a cited page is worse than not being cited.',
    '',
    'IT ALSO HAS TO BE WORTH READING',
    'This is a page a real person lands on. Dry and correct loses to sharp and correct. Open on the thing that is actually at stake for the reader, keep sentences short, and let the argument carry the piece rather than the structure. If the piece would bore you, it will bore them.',
    '',
    'WHO THIS BUSINESS IS',
    ctx.canon.slice(0, 6000),
    '',
    'HOW IT WRITES',
    ctx.voice.slice(0, 5000),
    '',
    VOICE_GUARDRAILS,
    '',
    `Length ${GEO_MIN_WORDS} to ${GEO_MAX_WORDS} words in the body.`,
    '',
    'Return JSON only, no prose around it:',
    '{',
    '  "title": "the h1, under 120 chars, carries the question\'s substance without being the question verbatim",',
    '  "slug": "lowercase-hyphenated-under-70-chars",',
    '  "answer": "two or three sentences that answer the question outright and name the entity. This is the sentence you want quoted. No preamble.",',
    '  "claim": "one sentence: the thing this page says that no other page answering this question says",',
    '  "first_party": ["checkable statements only this business can make, from its own work"],',
    '  "body": "markdown. Opens with the answer. H2s are questions or claims.",',
    '  "meta_description": "under 160 chars",',
    '  "faq": [{ "q": "a question someone asks straight after this one", "a": "a short direct answer" }]',
    '}',
  ].filter(Boolean).join('\n')
}

export function buildGeoUser(ctx: GeoContext): string {
  return [
    `Question to win: ${ctx.aeo.target_query}`,
    `Currently answered by: ${hostLine(ctx.cited_hosts)}`,
    `Your claim: ${ctx.aeo.why_you_can_win || '(none recorded)'}`,
    '',
    'Write the page.',
  ].join('\n')
}

export interface GeoFailure {
  /** The check that failed, for the ledger. */
  code: string
  /** Said plainly, because a human reads this when a draft is rejected. */
  why: string
  /** A hard failure is not sent back for repair. */
  hard: boolean
}

function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

function stripCode(s: string): string {
  return s.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ')
}

/** The gates, applied in code rather than trusted to the prompt. A model
 *  asked to grade its own work grades it generously; a regular expression
 *  does not. Same posture as _cardLint, which exists because 13 of 14 cards
 *  failed a check the prompt had politely requested. */
export function checkGeoDraft(draft: Partial<GeoDraft> | null, ctx: GeoContext): GeoFailure[] {
  const out: GeoFailure[] = []
  const fail = (code: string, why: string, hard = false) => out.push({ code, why, hard })

  if (!draft || typeof draft !== 'object') {
    fail('no_draft', 'The model returned nothing usable.', true)
    return out
  }

  const title = typeof draft.title === 'string' ? draft.title.trim() : ''
  const answer = typeof draft.answer === 'string' ? draft.answer.trim() : ''
  const claim = typeof draft.claim === 'string' ? draft.claim.trim() : ''
  const body = typeof draft.body === 'string' ? draft.body : ''
  const slug = typeof draft.slug === 'string' ? draft.slug.trim() : ''
  const firstParty = Array.isArray(draft.first_party) ? draft.first_party.filter(x => typeof x === 'string' && x.trim()) : []
  const prose = stripCode(body)

  // The reason the page can win has to exist before anything else matters.
  if (!ctx.aeo.why_you_can_win) {
    fail('no_winnability_reason', 'This recommendation carries no reason the business can win the question, so there is nothing to argue. It predates the winnability gate and should be re-researched rather than written.', true)
  }

  if (!title) fail('no_title', 'No title.', true)
  else if (title.length > MAX_TITLE) fail('title_too_long', `The title is ${title.length} characters, over ${MAX_TITLE}.`)

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fail('bad_slug', 'The slug is not lowercase and hyphenated.')
  else if (slug.length > 70) fail('slug_too_long', `The slug is ${slug.length} characters, over 70.`)

  // The quotable answer, and it has to be near the top of the page.
  if (!answer) {
    fail('no_answer', 'There is no direct answer, so there is nothing for an assistant to lift.', true)
  } else {
    if (words(answer) < 15) fail('answer_too_short', 'The direct answer is too short to stand on its own when quoted.')
    if (words(answer) > 90) fail('answer_too_long', 'The direct answer is too long to be lifted whole.')
    if (!answer.includes(ctx.entity)) {
      fail('answer_unnamed', `The direct answer never says "${ctx.entity}", so a model quoting it has nobody to name.`, true)
    }
    const head = prose.slice(0, ANSWER_WITHIN_CHARS)
    const firstSentence = answer.split(/(?<=[.!?])\s/)[0]?.trim() || answer
    if (firstSentence && !head.includes(firstSentence.slice(0, Math.min(60, firstSentence.length)))) {
      fail('answer_not_at_top', `The answer does not appear in the first ${ANSWER_WITHIN_CHARS} characters of the body, so a retriever reading the opening never finds it.`)
    }
  }

  // The claim is the whole point.
  if (!claim) fail('no_claim', 'The page names no claim of its own, so it is a summary of what the other sites already say.', true)
  else if (words(claim) < 6) fail('claim_too_thin', 'The claim is too thin to be a position.')

  if (!firstParty.length) {
    fail('no_first_party', 'Nothing on this page could only have been written by this business, so there is no reason to cite it over the sites already answering.', true)
  }

  if (!body) fail('no_body', 'No body.', true)
  else {
    const n = words(prose)
    if (n < GEO_MIN_WORDS) fail('too_short', `The body is ${n} words, under ${GEO_MIN_WORDS}.`)
    if (n > GEO_MAX_WORDS) fail('too_long', `The body is ${n} words, over ${GEO_MAX_WORDS}.`)

    const headings = body.match(/^##\s+(.+)$/gm) || []
    if (headings.length < 2) fail('no_structure', 'Fewer than two section headings, so a retriever has no way to find the part of the page that answers a follow-up.')
    const labels = headings.filter(h => words(h.replace(/^##\s+/, '')) <= 2)
    if (labels.length) fail('label_headings', `These headings are labels rather than questions or claims: ${labels.map(l => l.replace(/^##\s+/, '')).join(', ')}.`)
  }

  // First person hides the entity from the model doing the citing.
  const fp = prose.match(FIRST_PERSON) || []
  if (fp.length > 4) {
    fail('first_person', `The page says "we" or "our" ${fp.length} times. A model quoting those sentences has no name to attribute them to. Say "${ctx.entity}".`)
  }

  const lowerProse = prose.toLowerCase()
  const filler = UNATTRIBUTABLE.filter(u => lowerProse.includes(u))
  if (filler.length) fail('unattributable', `Unattributable filler: ${filler.join(', ')}.`)

  const opener = BANNED_OPENERS.find(b => lowerProse.trimStart().startsWith(b.toLowerCase()))
  if (opener) fail('banned_opener', `Opens with "${opener}".`)

  const banned = ctx.never_say.filter(n => n && lowerProse.includes(n.toLowerCase()))
  if (banned.length) fail('never_say', `Says what this business does not say: ${banned.join(', ')}.`, true)

  if (/[—–]/.test(body) || /[—–]/.test(title) || /[—–]/.test(answer)) {
    fail('em_dash', 'Contains an em dash or en dash.')
  }

  const md = typeof draft.meta_description === 'string' ? draft.meta_description.trim() : ''
  if (!md) fail('no_meta_description', 'No meta description.')
  else if (md.length > MAX_META_DESCRIPTION) fail('meta_description_too_long', `The meta description is ${md.length} characters, over ${MAX_META_DESCRIPTION}.`)

  const faq = Array.isArray(draft.faq) ? draft.faq.filter(f => f && typeof f.q === 'string' && typeof f.a === 'string') : []
  if (faq.length < 2) fail('thin_faq', 'Fewer than two follow-up questions, so the page answers one question and stops.')

  return out
}

export const geoDraftPasses = (draft: Partial<GeoDraft> | null, ctx: GeoContext) => checkGeoDraft(draft, ctx).length === 0
export const geoHardFailures = (draft: Partial<GeoDraft> | null, ctx: GeoContext) => checkGeoDraft(draft, ctx).filter(f => f.hard)

/** One bounded repair, the _cardLint posture: the failures are handed back
 *  verbatim and the lint stays the authority. A draft that fails twice is
 *  reported, never published weaker. */
export function buildGeoRepair(failures: GeoFailure[]): string {
  return [
    'This draft failed the checks below. Fix exactly these and change nothing else.',
    '',
    ...failures.filter(f => !f.hard).map(f => `- ${f.why}`),
    '',
    'Return the same JSON shape.',
  ].join('\n')
}

export const GEO_VOCAB = { UNATTRIBUTABLE }
