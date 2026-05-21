import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'

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

  const userMessage = `Question: ${question}\n\nGrounding (live data):\n${grounding}`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })
    if (!r.ok) {
      const text = await r.text()
      res.status(502).json({ error: `anthropic_${r.status}`, detail: text.slice(0, 500) })
      return
    }
    const json = await r.json() as any
    const reply = (json.content?.[0]?.text || '').trim()

    // Log to audit so we can see what Krish actually asks.
    await supabase.from('audit_log').insert({
      event_type: 'ask_marcus',
      actor: 'krish',
      details: { question, reply: reply.slice(0, 1000) },
    }).then(() => {}, () => {})

    res.status(200).json({ reply, grounding_used: grounding })
  } catch (err: any) {
    res.status(500).json({ error: 'anthropic_failed', detail: String(err?.message || err) })
  }
}
