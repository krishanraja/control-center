import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'
import { goalsSpine } from './_goals.js'
import { openStream, send, fail, streamClaude } from './_stream.js'
import { groundTab, isTabId, TAB_LABELS } from './_tabGrounding.js'
import { SYNTHESIS_MODEL } from './_models.js'

/**
 * POST /api/tab-chat
 * body: { tab, lane?, messages: [{ role, content }] }
 *
 * Talk to one tab, grounded in that tab's live rows.
 *
 * The difference from /api/ask-marcus is the scope and the contract. Ask
 * Marcus answers one fixed question from four fixed tables and returns a
 * recommendation. This answers about whichever surface Krish is looking at,
 * and has to end somewhere he can act: a recommendation with no first step is
 * a summary wearing a verb.
 *
 * Multi-turn, because the second question is always the real one. Ask Marcus
 * posts only `{ question }` and keeps its history client-side for display
 * only, so "why?" arrives with no idea what it refers to.
 *
 * Requires env: ANTHROPIC_API_KEY.
 */

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

/** Same window as api/_content.ts callClaudeMessages: enough to hold a thread,
 *  bounded so a long session cannot grow the request without limit. */
const MAX_TURNS = 16

function systemPrompt(tabLabel: string): string {
  return `You are Marcus — Krish's COO/CFO sparring partner — answering questions about the ${tabLabel} tab of his operating system. You are opinionated and terse.

You are given that tab's live rows. Everything you say comes from them or from the goal ladder.

How to answer:
- Lead with the answer in one sentence. Never open by restating the question.
- Say what it MEANS before what it is. The rows are already on his screen; he is asking you because he wants the implication. "Three workflows are failing" is a readout. "Two of the three failures are the same dead Gmail credential, so one re-auth fixes both" is an answer.
- Tie it to the goal it serves when the ladder makes that possible.
- End with "Next:" and 1 to 3 concrete actions. Each is a verb and an object, doable this week, and each names the specific row it came from. Not "review the pipeline" — "re-auth the Gmail credential on HARO Ingestion, which has failed 94 of 184 runs".
- If the rows genuinely support no action, say that in one line rather than inventing one. A fabricated next step is worse than none.

Rules:
- ≤180 words unless he asks you to go deeper.
- Cite the actual numbers and names. No "several" or "a number of".
- Where a block says "no rows", that means the table is empty, not that things are fine. Say which is which.
- Never hedge with "it depends" — pick, and say what would change your mind.
- No em dashes. Currency USD. Dates relative ("3 days ago").`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return }

  const body = (req.body || {}) as { tab?: unknown; lane?: unknown; messages?: unknown }

  if (!isTabId(body.tab)) { res.status(400).json({ error: 'unknown_tab', detail: String(body.tab) }); return }
  const tab = body.tab
  const lane = typeof body.lane === 'string' && body.lane ? body.lane : null

  // Same hygiene as callClaudeMessages: drop malformed turns, bound the
  // window, and require the first turn to be a user turn — Anthropic rejects a
  // conversation that opens on the assistant, and after a slice it can.
  const turns: ChatTurn[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m: any): m is ChatTurn =>
      m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim().length > 0)
    .map((m: ChatTurn) => ({ role: m.role, content: m.content.trim() }))
    .slice(-MAX_TURNS)
  while (turns.length && turns[0].role !== 'user') turns.shift()

  if (!turns.length) { res.status(400).json({ error: 'messages required' }); return }
  const question = turns[turns.length - 1].content

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' }); return }

  const [grounding, goals] = await Promise.all([
    groundTab(tab, lane),
    goalsSpine(`answering a question about the ${TAB_LABELS[tab]} tab`),
  ])

  // The grounding rides on the LAST user turn rather than the system prompt so
  // that a long thread re-reads current rows on every turn. Pinning it to the
  // system prompt would answer turn six from turn one's data, which on a tab
  // whose whole subject is live state is the one thing it must not do.
  const messages: ChatTurn[] = turns.map((t, i) =>
    i === turns.length - 1
      ? { role: t.role, content: `${t.content}\n\n${goals.prompt}\n\nLive rows for this tab:\n${grounding}` }
      : t)

  openStream(res)
  try {
    const reply = (await streamClaude({
      agent: 'marcus',
      apiKey,
      model: SYNTHESIS_MODEL,
      temperature: 0.4,
      maxTokens: 700,
      system: systemPrompt(TAB_LABELS[tab]),
      messages,
      onText: chunk => send(res, 'delta', { text: chunk }),
    })).trim()

    await supabase.from('audit_log').insert({
      event_type: 'tab_chat',
      actor: 'krish',
      details: { tab, lane, turns: turns.length, question, reply: reply.slice(0, 1000) },
    }).then(() => {}, () => {})

    send(res, 'done', { reply })
    res.end()
  } catch (err: any) {
    // Headers are out, so the status is 200 forever. In-band or it reads as a
    // successful empty answer.
    fail(res, 'anthropic_failed', String(err?.message || err))
  }
}

export const config = { maxDuration: 120 }
