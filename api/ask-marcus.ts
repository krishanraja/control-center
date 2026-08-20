import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'
import { goalsSpine } from './_goals.js'
import { openStream, send, fail, streamClaude } from './_stream.js'

/**
 * POST /api/ask-marcus
 * body: { question: string }
 *
 * Grounds the question in live business data (customers, leads, bets,
 * recent tasks) and asks Sonnet 4.6 for an opinionated answer with
 * the 3 data points that swayed the recommendation.
 *
 * Requires env: ANTHROPIC_API_KEY.
 */

const MODEL = 'claude-sonnet-4-6'

function fmtCustomers(rows: any[]): string {
  const paid    = rows.filter(r => r.kind === 'paid' && !r.churned_at)
  const churned = rows.filter(r => r.kind === 'churned')
  const mrr     = paid.reduce((s, r) => s + (Number(r.mrr_usd) || 0), 0)
  const byProduct = paid.reduce<Record<string, { count: number; mrr: number }>>((acc, r) => {
    const k = r.product || 'unknown'
    if (!acc[k]) acc[k] = { count: 0, mrr: 0 }
    acc[k].count += 1
    acc[k].mrr += Number(r.mrr_usd) || 0
    return acc
  }, {})
  return [
    `Live customers — ${paid.length} paid, $${Math.round(mrr)}/mo total MRR, ${churned.length} churned (all-time).`,
    Object.entries(byProduct).map(([p, v]) => `${p}: ${v.count} paid, $${Math.round(v.mrr)}/mo`).join(' · '),
  ].filter(Boolean).join('\n')
}

function fmtBets(rows: any[]): string {
  const live = rows.filter(r => r.status === 'live')
  const won  = rows.filter(r => r.status === 'won').length
  const lost = rows.filter(r => r.status === 'lost').length
  return `Bets: ${live.length} live, ${won}/${won + lost} 90d hit-rate. Live: ${live.slice(0,5).map(b => `"${b.hypothesis}" (${b.kind})`).join('; ')}`
}

function fmtLeads(rows: any[]): string {
  return `${rows.length} active leads. Top tiers: ${rows.slice(0, 5).map(r => `${r.full_name || r.email || '?'} (${r.tier || 'C'})`).join('; ')}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return }

  const question = String((req.body as any)?.question || '').trim()
  if (!question) { res.status(400).json({ error: 'question required' }); return }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' }); return }

  // Pull grounding context in parallel.
  const [customersRes, betsRes, leadsRes, intelRes] = await Promise.all([
    supabase.from('customers').select('product, kind, mrr_usd, churned_at, plan').limit(500),
    supabase.from('bets').select('hypothesis, kind, status, time_box_days, started_at, decided_at, actual_mrr_impact_usd').limit(200),
    supabase.from('leads').select('full_name, email, company, tier, status').in('status', ['ready','contacted','conversation']).limit(50),
    supabase.from('home_intelligence').select('summary, external_signals').eq('id', 'current').maybeSingle(),
  ])

  const grounding = [
    fmtCustomers(customersRes.data || []),
    fmtBets(betsRes.data || []),
    fmtLeads(leadsRes.data || []),
    intelRes.data?.summary ? `Marcus context: ${typeof intelRes.data.summary === 'string' ? intelRes.data.summary : JSON.stringify(intelRes.data.summary)}` : '',
  ].filter(Boolean).join('\n\n')

  const systemPrompt = `You are Marcus — Krish's COO/CFO sparring partner. You are opinionated, terse, and push back when his question hides a bad assumption. You answer in ≤180 words.

Rules:
- Lead with your recommendation in one sentence.
- Then 3 bullet points: the data that swayed you (cite numbers from the grounding).
- Then one contrarian counter-take in italics (one sentence) — what would change your mind?
- Never hedge with "it depends" — pick.
- If the question is unanswerable from the grounding alone, say so and propose the one thing Krish should measure first.
- Currency: USD. Dates: relative ("3 days ago", "last week").`

  // The ladder rides along with the live data. Marcus answering "should I do X"
  // without knowing what the system is currently for was the gap.
  const { prompt: goalsBlock } = await goalsSpine('answering this question')

  const userMessage = `Question: ${question}\n\n${goalsBlock}\n\nGrounding (live data):\n${grounding}`

  // Streamed. This is a question a human asked and is now sitting in front of,
  // and the answer took 20 to 40 seconds to arrive in one piece. The first
  // sentence exists about two seconds in; withholding it until the last
  // sentence is written was the entire wait.
  //
  // The client falls back to JSON on any route that does not stream, so this
  // conversion is local to this file.
  openStream(res)
  try {
    const reply = (await streamClaude({
      apiKey,
      model: MODEL,
      // The answer has a rigid shape (one sentence, three bullets, a counter-take)
      // and the prompt forbids hedging, so this sits at the low end of the Marcus
      // range rather than the provider default it inherited before.
      temperature: 0.4,
      maxTokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      onText: chunk => send(res, 'delta', { text: chunk }),
    })).trim()

    // Log to audit so we can see what Krish actually asks. After the stream, on
    // the accumulated text: the ledger still wants the whole answer.
    await supabase.from('audit_log').insert({
      event_type: 'ask_marcus',
      actor: 'krish',
      details: { question, reply: reply.slice(0, 1000) },
    }).then(() => {}, () => {})

    send(res, 'done', { reply, grounding_used: grounding })
    res.end()
  } catch (err: any) {
    // Headers are already out, so the status is 200 forever. Reported in-band
    // or it reads to the client as a successful empty answer.
    fail(res, 'anthropic_failed', String(err?.message || err))
  }
}

// Well inside the platform ceiling, and explicit: this route had no maxDuration
// at all, so it inherited whatever the account default happened to be.
export const config = { maxDuration: 120 }
