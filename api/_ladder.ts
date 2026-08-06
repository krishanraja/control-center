// _ladder: prompts and parsing for the why-ladder. Pure module: builds strings
// and reads JSON, no I/O and no clients, so the route is the only thing that
// spends money.
//
// THE LADDER IS 2 TO 3 RUNGS, published honestly as such. Depth 5 was
// arithmetically unreachable: each rung needs 2 citable rows on 2 distinct
// domains, and the record simply does not go that deep on a weekly cadence.
// The differentiator is not rung count. It is that the TERMINAL LAYER GETS
// PUBLISHED rather than hidden. Printing "past this point the explanations are
// motive, not mechanism" is worth more than two more rungs of abstraction.

import { MECHANISM_TYPES, SOURCE_CLASSES, MAX_RUNGS } from './_gates.js'

export const VOICE_RULES = [
  'NO EM DASHES. Not in any field, not ever. Use a comma, a period or parentheses.',
  'No hype, no listicle phrasing, no "game changer", no "unlock".',
  'Write for a commercial leader who checks sources and has read the press release already.',
].join(' ')

export const HONESTY_RULES = [
  'NEVER invent a source, a statistic, a company, a person or a capability.',
  'Every quote you return must be copied VERBATIM from the supplied source text. Character for character. If you cannot find a verbatim span that supports a claim, do not make the claim.',
  'Every number in a claim must appear in the quote you attach to it, at the same magnitude. A number in a claim that is absent from the quote is the single worst failure you can produce here.',
  'If the supplied material does not support a claim, return fewer claims. An empty list is a valid and respected answer.',
].join(' ')

// ── Decomposition (one sonnet call) ─────────────────────────────────────────

export interface RawClaim {
  id?: string
  text?: string
  claim_type?: string
  quantity?: string | null
  quote?: string
  surprise?: number
  verifiability?: number
  falsifier?: string
  mechanism_type?: string | null
}

export function buildDecomposePrompt(headline: string, sourceText: string, pillarEvidence: string[]): { system: string; user: string } {
  const system = [
    'You decompose a news item into its component factual claims for an investigative essay on the economics of AI.',
    'You do not write prose. You return JSON.',
    HONESTY_RULES,
    VOICE_RULES,
    '',
    'For each claim return:',
    '- "id": c1, c2, c3 in order.',
    '- "text": the claim in one sentence, stated at exactly the strength the source supports. If the source says "may" or "plans to", your claim says "may" or "plans to". Removing a hedge the source used is a failure.',
    '- "claim_type": one of thesis, mechanism, observation, analogy.',
    '- "quantity": the load-bearing number if there is one, else null.',
    '- "quote": a VERBATIM span copied from the SOURCE TEXT that carries this claim. Copy it exactly, do not paraphrase, do not fix typos, do not re-punctuate.',
    '- "surprise": 0 to 10. How much this would update the prior of a well-read commercial leader. A press release restating a known strategy is 1.',
    '- "verifiability": 0 to 5. 5 means a named artifact settles it (a filing, a docket, a pricing page). 0 means it is unfalsifiable in principle.',
    `- "falsifier": the specific observation that would show this claim is WRONG. It MUST name a source class (${SOURCE_CLASSES.slice(0, 9).join(', ')}), MUST contain either a number with a comparator or a named artifact class, and MUST carry a date, quarter or duration. "This would be falsified if it turned out not to be true" is a non-answer and will be rejected by code.`,
    `- "mechanism_type": if and only if the claim names a mechanism, one of: ${MECHANISM_TYPES.join(', ')}. Otherwise null. Note what is NOT on that list: incentives, culture, strategy, vision. "Because incentives" is not a mechanism. A contract is, because a contract is a document you can cite.`,
    '',
    'Return at most 8 claims. Reply ONLY with JSON: {"claims":[...]}',
  ].join('\n')

  const user = JSON.stringify({
    headline,
    pillar_evidence_bar: pillarEvidence,
    source_text: sourceText.slice(0, 12_000),
  })
  return { system, user }
}

/** Second attempt after a grounding failure. The failed quotes are echoed back
 *  verbatim, which is the only phrasing that reliably works: a model told
 *  "these were not found in the source" corrects the copy rather than
 *  re-paraphrasing. Still failing on attempt two aborts the week. */
export function buildRegroundPrompt(headline: string, sourceText: string, failedQuotes: string[]): { system: string; user: string } {
  const system = [
    'You previously returned claims whose quotes were NOT FOUND in the source text. That is a hard failure.',
    'These were not found in the source:',
    ...failedQuotes.slice(0, 8).map(q => `  NOT FOUND: ${q.slice(0, 220)}`),
    '',
    'Return the claims again. This time copy each quote character for character out of the SOURCE TEXT below. Do not paraphrase, do not tidy, do not translate. If you cannot find a verbatim span for a claim, DROP that claim.',
    HONESTY_RULES,
    'Reply ONLY with JSON in the same shape as before: {"claims":[{"id","text","claim_type","quantity","quote","surprise","verifiability","falsifier","mechanism_type"}]}',
  ].join('\n')
  return { system, user: JSON.stringify({ headline, source_text: sourceText.slice(0, 12_000) }) }
}

export function readClaims(parsed: unknown): RawClaim[] {
  const p = parsed as { claims?: unknown }
  return Array.isArray(p?.claims) ? (p.claims as RawClaim[]).filter(c => c && typeof c === 'object') : []
}

// ── Descent (one opus call per rung attempt, 2 to 3 total) ──────────────────

export interface RawRung {
  answer?: string
  mechanism_type?: string | null
  quote?: string
  evidence_refs?: string[]
  shared_mechanism?: string | null
  breaks_if?: string | null
  next_question?: string
  exhausted?: boolean
  exhausted_reason?: string
}

export interface DescentEvidence { ref: string; domain: string; headline: string; snippet: string }

/** One descent step. This is the one place where reasoning quality IS the
 *  product, so it runs on opus. The stopping rule is NOT in this prompt: it is
 *  enforced by gateRung() and by the loop bound, because a prompt-level rule is
 *  a rule the model can talk itself out of. */
export function buildDescentPrompt(
  question: string,
  rung: number,
  priorRungs: string[],
  evidence: DescentEvidence[],
): { system: string; user: string } {
  const system = [
    'You are answering one WHY question for an investigative essay on the economics of AI, for senior commercial leaders who check sources.',
    `This is rung ${rung} of at most ${MAX_RUNGS}. You are descending toward mechanism, not ascending toward abstraction.`,
    HONESTY_RULES,
    VOICE_RULES,
    '',
    'Answer ONLY from the supplied evidence rows. Each row has a ref (e1, e2), a domain, a headline and a snippet.',
    '',
    'Return JSON:',
    '- "answer": the answer to the question, in at most 60 words. It MUST introduce at least one named entity or number that does NOT appear in any prior rung. An answer that restates the question in grander words will be rejected by code, so do not write one.',
    `- "mechanism_type": the mechanism doing the work, one of: ${MECHANISM_TYPES.join(', ')}. If the honest answer is motive rather than mechanism (someone WANTS an outcome), set this to null and set "exhausted": true with "exhausted_reason": "motive_not_mechanism". That is a respected answer, not a failure.`,
    '- "quote": a VERBATIM span from one of the supplied snippets that carries the answer.',
    '- "evidence_refs": the refs of the rows this answer rests on. At least 2, and they must not all be the same domain.',
    '- "shared_mechanism" and "breaks_if": only if the answer is an analogy to another market. shared_mechanism must be from the same enum. breaks_if must name the specific, dated, observable point at which the analogy stops holding. An analogy with no stated breaking point is a flourish, not evidence.',
    '- "next_question": the next WHY question one rung down, or null if there is none worth asking.',
    '- "exhausted": true when the record genuinely runs out here, with "exhausted_reason" one of: motive_not_mechanism, evidence_exhausted.',
    '',
    'Stopping honestly is worth more than continuing. The terminal statement gets PUBLISHED, so a false floor is a lie in print.',
    'Reply ONLY with JSON.',
  ].join('\n')

  const user = JSON.stringify({
    question,
    rung,
    prior_rungs: priorRungs,
    evidence: evidence.map(e => ({ ref: e.ref, domain: e.domain, headline: e.headline, snippet: e.snippet.slice(0, 900) })),
  })
  return { system, user }
}

// ── Vendor entity adjudication (G1, at most one sonnet call) ────────────────

export function buildVendorEntityPrompt(sentence: string, candidate: string | null): { system: string; user: string } {
  const system = [
    'One question. Answer in JSON, nothing else.',
    'Given a sentence containing a number, identify the entity the number is ABOUT, and say whether that entity SELLS the thing being measured.',
    'A vendor reporting its own product metric sells the thing measured. A regulator, a court, a statistical agency or a journalist measuring someone else does not.',
    'Return: {"entity":"...","entity_is_seller_of_the_thing_measured":true|false,"confidence":0.0-1.0}',
    'If you are not sure, return a low confidence. Do not guess an entity that is not named in the sentence.',
  ].join('\n')
  return { system, user: JSON.stringify({ sentence: sentence.slice(0, 600), candidate_entity: candidate }) }
}

// ── Publisher plausibility (G5.4, one batched sonnet call per run) ──────────

export function buildPublisherBeatPrompt(triples: { domain: string; headline: string; claim: string }[]): { system: string; user: string } {
  const system = [
    'For each (domain, headline, claim) triple, say whether it is PLAUSIBLE that this publisher published this story.',
    'A marketing training site does not publish G7 policy stories. A trade journal for dentists does not break semiconductor supply news.',
    'Assign each domain its beat tags from exactly this set: policy, markets, enterprise_tech, marketing, research, security, consumer.',
    'Return: {"results":[{"domain":"...","plausible":true|false,"beat":["..."],"why":"one short clause"}]}',
    'Judge the publisher, not the claim. A real publisher covering its own beat is plausible even if the claim is surprising.',
  ].join('\n')
  return { system, user: JSON.stringify({ triples: triples.slice(0, 8) }) }
}

// ── Draft assertion extraction (G6, one sonnet call) ────────────────────────

export function buildAssertionPrompt(body: string, evidence: { ref: string; headline: string; url: string }[]): { system: string; user: string } {
  const system = [
    'Extract every factual assertion from the draft and map each one to an evidence row. You MAP, you do not JUDGE.',
    'A factual assertion is a sentence carrying a number, a named entity plus an action verb, a date, or a quoted statement.',
    'Return: {"assertions":[{"sentence":"...","assertion":"...","kind":"number|event|quote|attribution","evidence_ref":"e1"}]}',
    'evidence_ref MUST be one of the supplied refs, or null if no supplied row carries it. NEVER invent a ref. A ref that does not resolve is treated as a fabricated citation and blocks the piece.',
    'Copy "sentence" verbatim from the draft.',
  ].join('\n')
  return { system, user: JSON.stringify({ draft: body.slice(0, 14_000), evidence: evidence.slice(0, 40) }) }
}
