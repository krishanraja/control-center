// One-shot reconstruction of the Jul 2025 - Jun 2026 shifts baseline (spec §6, R6).
//
// Month by month, IN ORDER (so momentum histories accrue like lived weeks):
//   1. Perplexity sonar-pro reconstructs that month's AI-for-business record as
//      dated story stubs (the mindmaker relevance lens: business decisions, not
//      hype or geopolitics).
//   2. The SAME deterministic gate as live detection verifies each proposed
//      shift (>=3 distinct days, >=3 distinct sources, >=3 real citations).
//   3. Verified shifts upsert into the register with provenance='reconstructed'
//      (an existing lived shift that matches flips to 'mixed'); evidence rows
//      carry provenance='reconstructed' and a 'YYYY-MM' week_label.
// Reconstructed shifts land ACTIVE (no decision cards): the backfill is the
// approved bootstrap, not new asks. The provenance bar keeps it honest forever.
//
// Usage: npx tsx scripts/backfill-shifts.ts [startMonth] [endMonth]
//   e.g.  npx tsx scripts/backfill-shifts.ts 2025-07 2026-06
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY,
//      PERPLEXITY_API_KEY, OPENAI_API_KEY (embeddings; optional).

import {
  buildDetectionPrompt, verifyShift, slugifyShift, titleJaccard, MATCH_COSINE, MATCH_TITLE_JACCARD,
  type CorpusItem, type ProposedShift, type VerifiedShift,
} from '../api/_trendGate.js'
import { SYNTHESIS_MODEL } from '../api/_models.js'

const START = process.argv[2] || '2025-07'
const END = process.argv[3] || '2026-06'

function monthsBetween(start: string, end: string): string[] {
  const out: string[] = []
  let [y, m] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++; if (m > 12) { m = 1; y++ }
  }
  return out
}

const RESEARCH_PROMPT = (month: string) => `You are reconstructing the historical record of AI news that mattered to BUSINESS LEADERS for the calendar month ${month}.

List the 18-25 most significant events of ${month} ONLY (nothing from other months). Apply this lens:
INCLUDE: model releases and capability changes that affect what companies can build; vendor pricing changes that affect build-vs-buy math; real enterprise deployment stories with numbers; tool/platform launches that change how leaders use AI day-to-day; competitive moves creating decision pressure; agents and automation replacing manual workflows; org/role changes (hiring patterns, new AI roles); governance changes that create a real decision trigger.
EXCLUDE: generic policy debate, workforce-survey stats, geopolitics (unless it directly changed vendor choices), AGI speculation, celebrity AI, funding rounds without competitive significance.

For each event return: "day" (the real date, YYYY-MM-DD, within ${month}), "headline" (specific, 8-18 words, real companies and numbers), "summary" (max 30 words), "source" (the real publication that covered it, e.g. techcrunch.com, theinformation.com, reuters.com), "url" (the real article URL if you know it, else null).
Accuracy rules: only real, verifiable events. Real dates. Real sources, varied (do not attribute everything to one outlet). If unsure of the exact day, use the best-documented date.
Reply ONLY with JSON: {"stories":[{"day":"...","headline":"...","summary":"...","source":"...","url":null}]}`

async function perplexity(prompt: string): Promise<string> {
  const key = process.env.PERPLEXITY_API_KEY
  if (!key) throw new Error('PERPLEXITY_API_KEY unset')
  const r = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'sonar-pro',
      temperature: 0.1,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!r.ok) throw new Error(`perplexity_${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = await r.json()
  return j?.choices?.[0]?.message?.content || ''
}

function parseVec(v: unknown): number[] | null {
  if (Array.isArray(v)) return v as number[]
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return null } }
  return null
}

async function main() {
  const { supabase } = await import('../api/_supabase.js')
  const { callClaude, robustJson } = await import('../api/_content.js')
  const { embedBatch, cosine, vectorLiteral } = await import('../api/_embeddings.js')

  const months = monthsBetween(START, END)
  console.log(`Backfilling ${months.length} months: ${months[0]} .. ${months[months.length - 1]}`)

  for (const month of months) {
    console.log(`\n=== ${month} ===`)

    // 1. Reconstruct the month's record.
    let stories: Array<{ day: string; headline: string; summary: string; source: string; url: string | null }> = []
    try {
      const raw = await perplexity(RESEARCH_PROMPT(month))
      const parsed = robustJson(raw)
      stories = Array.isArray(parsed?.stories) ? parsed.stories : []
    } catch (e) {
      console.error(`  research failed: ${(e as Error).message}; skipping month`)
      continue
    }
    stories = stories.filter(s => s?.day?.startsWith(month) && s.headline && s.source)
    console.log(`  reconstructed ${stories.length} dated stories`)
    if (stories.length < 9) { console.log('  too thin; honest skip'); continue }

    const corpus: CorpusItem[] = stories.map((s, i) => ({
      id: `s${i + 1}`,
      day: s.day,
      category: null,
      headline: s.headline,
      snippet: s.summary || null,
      source: s.source.toLowerCase().replace(/^www\./, ''),
      url: s.url,
    }))

    // 2. Same detection + gate as live.
    const { system, user } = buildDetectionPrompt(corpus, 31)
    const raw = await callClaude({ model: SYNTHESIS_MODEL, maxTokens: 2000, temperature: 0.2, system, user })
    const proposals: ProposedShift[] = Array.isArray(robustJson(raw)?.shifts) ? robustJson(raw).shifts : []
    const byId = new Map(corpus.map(c => [c.id, c]))
    const verified = proposals.map(p => verifyShift(p, byId)).filter((x): x is VerifiedShift => Boolean(x))
    console.log(`  proposed ${proposals.length}, verified ${verified.length}`)

    if (!verified.length) continue

    // 3. Register upsert with reconstructed provenance.
    const { data: registryData } = await supabase
      .from('shifts')
      .select('id, slug, title, provenance, embedding, first_seen_on, momentum_history')
      .neq('status', 'retired')
    const registry = registryData || []
    const vecs = await embedBatch(verified.map(v => ({ title: v.title, body: v.summary })))

    for (let i = 0; i < verified.length; i++) {
      const v = verified[i]
      const vec = vecs[i]
      let match: any = null
      let best = 0
      for (const s of registry) {
        const sv = parseVec(s.embedding)
        const cos = vec && sv ? cosine(vec, sv) : 0
        const jac = titleJaccard(v.title, s.title)
        const score = Math.max(cos, jac)
        if ((cos >= MATCH_COSINE || jac >= MATCH_TITLE_JACCARD) && score > best) { match = s; best = score }
      }

      const oldest = v.items.map(x => x.day).sort()[0]
      const newest = v.items.map(x => x.day).sort().at(-1)!
      const entry = { week: month, momentum: v.momentum, day_span: v.daySpan, source_count: v.sourceCount, recent_count: v.recentCount }

      let shiftId: string
      if (match) {
        const history = Array.isArray(match.momentum_history) ? match.momentum_history : []
        await supabase.from('shifts').update({
          momentum_history: [...history.filter((h: any) => h?.week !== month), entry].sort((a: any, b: any) => String(a.week).localeCompare(String(b.week))),
          first_seen_on: oldest < match.first_seen_on ? oldest : match.first_seen_on,
          provenance: match.provenance === 'lived' ? 'mixed' : match.provenance,
        }).eq('id', match.id)
        shiftId = match.id
        console.log(`  ~ accrued: ${match.title} (match ${(best * 100).toFixed(0)}%)`)
      } else {
        const { data, error } = await supabase.from('shifts').insert({
          slug: slugifyShift(v.title),
          title: v.title,
          summary: v.summary,
          implication: v.implication,
          category: v.category,
          status: 'active',
          first_seen_on: oldest,
          last_evidence_on: newest,
          momentum: v.momentum,
          momentum_history: [entry],
          provenance: 'reconstructed',
          decision: { action: 'backfilled', at: new Date().toISOString(), note: `reconstructed baseline ${month}` },
          ...(vec ? { embedding: vectorLiteral(vec) } : {}),
        }).select('id').single()
        if (error) { console.error(`  ! insert failed for "${v.title}": ${error.message}`); continue }
        shiftId = data.id
        registry.push({ id: shiftId, slug: slugifyShift(v.title), title: v.title, provenance: 'reconstructed', embedding: vec ? JSON.stringify(vec) : null, first_seen_on: oldest, momentum_history: [entry] })
        console.log(`  + new: ${v.title}`)
      }

      await supabase.from('shift_evidence').upsert(
        v.items.map(it => ({
          shift_id: shiftId,
          occurred_on: it.day,
          headline: it.headline,
          source: it.source,
          url: it.url,
          provenance: 'reconstructed',
          week_label: month,
        })),
        { onConflict: 'shift_id,occurred_on,headline', ignoreDuplicates: true },
      )
    }
  }

  // Refresh aggregate totals + last_evidence_on across the whole register.
  const { data: all } = await supabase.from('shifts').select('id')
  for (const s of all || []) {
    const { data: ev } = await supabase.from('shift_evidence').select('occurred_on, source').eq('shift_id', s.id).limit(5000)
    const rows = ev || []
    if (!rows.length) continue
    await supabase.from('shifts').update({
      story_count: rows.length,
      day_span_total: new Set(rows.map(r => r.occurred_on)).size,
      source_count_total: new Set(rows.map(r => (r.source || 'unknown').toLowerCase())).size,
      last_evidence_on: rows.map(r => r.occurred_on).sort().at(-1),
    }).eq('id', s.id)
  }
  console.log('\nBackfill complete; totals refreshed.')
}

main().then(() => process.exit(0)).catch(e => { console.error('BACKFILL FAILED:', e?.message || e); process.exit(1) })
