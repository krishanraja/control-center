import type { VercelRequest, VercelResponse } from '@vercel/node'
import { callClaude, preamble, robustJson } from '../_content.js'
import { fetchServerCandidates, FRESH_DAYS, type ServerCandidate } from '../_publishCandidates.js'
import { fetchOutreachCandidates, type OutreachCandidate } from '../_outreachCandidates.js'

/**
 * POST /api/pilot/resolve-ask
 *
 * The strategic judgment red mode was missing: given the operator's typed
 * intent, decide whether anything outstanding in the control center GENUINELY
 * matches it, or say honestly that nothing does so the client can offer the
 * next move (build the piece, draft the email, or keep the words). The
 * ask-marcus pattern throughout: a deterministic fetch grounds one LLM call,
 * and the model only judges, it never invents. Haiku tier per MT-003, this is
 * classification, not drafting.
 *
 * Two lanes, routed by the ask's verb:
 *   publish/post        -> the content queue (content_ideas shortlist)
 *   send/reply/email/dm -> the outreach inventory (unsent Gmail drafts,
 *                          enriched leads, pitched guests)
 *
 * Body:     { ask: string }
 * Response: { ok, intent: 'publish' | 'outreach',
 *             verdict: 'match' | 'no_match',
 *             candidate?,   // publish lane: content queue candidate
 *             outreach?,    // outreach lane: draft / lead / guest
 *             reason }
 *
 * The reason sentence is shown to Krish on the card, so it must name why in
 * plain words. Any index outside the fetched list is treated as no_match,
 * which keeps a hallucinated pick from ever reaching the screen.
 */

const PUBLISH_RE = /\b(publish|post)\w*/i
const OUTREACH_RE = /\b(send|email|reply|dm|follow)\w*/i

interface Judgment {
  index: number | null
  reason: string | null
}

async function judge(system: string, user: string): Promise<Judgment | null> {
  let raw: string
  try {
    raw = await callClaude({
      system,
      user,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 300,
      temperature: 0.2,
    })
  } catch {
    return null
  }
  const parsed = robustJson(raw)
  if (!parsed) return { index: null, reason: null }
  return {
    index: Number.isInteger(parsed.match_index) ? parsed.match_index : null,
    reason: typeof parsed.reason === 'string' && parsed.reason.trim()
      ? parsed.reason.trim().slice(0, 300)
      : null,
  }
}

const JUDGE_RULES = [
  'You never invent candidates. You only pick from the numbered list or declare none.',
  'Return ONLY a JSON object: { "match_index": <1-based number or null>, "reason": "<one plain sentence, shown to the operator, naming why this matches or why nothing does>" }',
  'The reason must be concrete: name the piece or person or the gap, never a generic apology. No em dashes.',
].join('\n')

async function resolvePublish(ask: string, res: VercelResponse) {
  const candidates = await fetchServerCandidates(8)
  if (!candidates.length) {
    return res.json({
      ok: true,
      intent: 'publish',
      verdict: 'no_match',
      reason: 'The queue holds nothing publishable right now.',
    })
  }

  const today = new Date().toISOString().slice(0, 10)
  const list = candidates.map((c, i) => {
    const age = c.updatedAt
      ? Math.round((Date.now() - new Date(c.updatedAt).getTime()) / 86400000)
      : null
    return [
      `${i + 1}. "${c.idea}"`,
      c.thesis ? `   thesis: ${c.thesis}` : null,
      `   lane: ${c.lane || 'unassigned'} | state: ${c.state} | quality: ${c.quality || 'unscored'} | last touched: ${age === null ? 'unknown' : `${age}d ago`}`,
    ].filter(Boolean).join('\n')
  }).join('\n')

  const system = [
    'You judge whether a content queue holds a genuine match for an operator\'s publish intent.',
    'You are strict. A genuine match serves the intent as written: if the ask wants something timely, a stale piece is not a match; if the ask names a topic, an unrelated piece is not a match.',
    `A piece last touched within ${FRESH_DAYS} days counts as fresh.`,
    JUDGE_RULES,
  ].join('\n')
  const user = `Today is ${today}.\n\nThe operator's intent, verbatim:\n"${ask}"\n\nThe queue's best candidates:\n${list}\n\nDoes anything genuinely match?`

  const j = await judge(system, user)
  if (!j) return res.status(502).json({ ok: false, error: 'judge unavailable' })

  const matched: ServerCandidate | null =
    j.index !== null && j.index >= 1 && j.index <= candidates.length ? candidates[j.index - 1] : null

  if (matched) {
    return res.json({
      ok: true,
      intent: 'publish',
      verdict: 'match',
      candidate: matched,
      reason: j.reason || `"${matched.idea}" is the closest fit in the queue.`,
    })
  }
  return res.json({
    ok: true,
    intent: 'publish',
    verdict: 'no_match',
    reason: j.reason || 'Nothing in the queue genuinely serves that ask.',
  })
}

async function resolveOutreach(ask: string, res: VercelResponse) {
  const inventory = await fetchOutreachCandidates(10)
  if (!inventory.length) {
    return res.json({
      ok: true,
      intent: 'outreach',
      verdict: 'no_match',
      reason: 'No drafts are waiting and nobody enriched is ready to write to.',
    })
  }

  const label = (c: OutreachCandidate, i: number) => {
    const head = c.kind === 'email_draft'
      ? `READY DRAFT: "${c.detail || 'no subject'}" to ${c.name}`
      : c.kind === 'lead'
        ? `LEAD (no draft yet): ${c.name}`
        : `GUEST (pitch drafted): ${c.name}`
    const tail = [
      c.kind !== 'email_draft' && c.detail ? c.detail : null,
      c.ageDays !== null ? `${c.ageDays}d old` : null,
    ].filter(Boolean).join(' | ')
    return `${i + 1}. ${head}${tail ? `\n   ${tail}` : ''}`
  }
  const list = inventory.map(label).join('\n')

  const system = [
    'You judge whether an outreach inventory holds a genuine match for an operator\'s send/reply intent.',
    'You are strict. If the ask names a person, company, or topic, only a candidate that plausibly IS that person or serves that topic matches. A generic ask ("send something to a hot lead") matches the strongest ready item.',
    'A READY DRAFT already sits in Gmail, so it beats a same-fit lead that still needs drafting.',
    JUDGE_RULES,
  ].join('\n')
  const user = `The operator's intent, verbatim:\n"${ask}"\n\nThe outreach inventory:\n${list}\n\nDoes anything genuinely match?`

  const j = await judge(system, user)
  if (!j) return res.status(502).json({ ok: false, error: 'judge unavailable' })

  const matched: OutreachCandidate | null =
    j.index !== null && j.index >= 1 && j.index <= inventory.length ? inventory[j.index - 1] : null

  if (matched) {
    return res.json({
      ok: true,
      intent: 'outreach',
      verdict: 'match',
      outreach: matched,
      reason: j.reason || `${matched.name} is the closest fit in the inventory.`,
    })
  }
  return res.json({
    ok: true,
    intent: 'outreach',
    verdict: 'no_match',
    reason: j.reason || 'Nothing outstanding genuinely serves that ask.',
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return

  const ask = String(req.body?.ask || '').trim().slice(0, 500)
  if (!ask) return res.status(400).json({ ok: false, error: 'ask is required' })

  // Publish wins ties ("post the reply piece" is content, not email); the
  // client only calls this route for asks carrying one of the two verb sets.
  if (PUBLISH_RE.test(ask)) return resolvePublish(ask, res)
  if (OUTREACH_RE.test(ask)) return resolveOutreach(ask, res)
  return resolvePublish(ask, res)
}

export const config = { maxDuration: 60 }
