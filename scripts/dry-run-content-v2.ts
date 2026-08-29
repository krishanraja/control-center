// One-shot dry run of the Content Engine v2 core against live data (PR-A gate).
// Usage: npx tsx scripts/dry-run-content-v2.ts [ingest|detect|assemble|all]
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CTRL_SUPABASE_URL,
//      CTRL_SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY (optional).

async function main() {
  const step = process.argv[2] || 'all'

  if (step === 'ingest' || step === 'all') {
    const { fetchPoolDays } = await import('../api/_pool.js')
    const { purgeBoundary } = await import('../api/_weeks.js')
    const { supabase } = await import('../api/_supabase.js')
    const since = new Date(Date.now() - 9 * 86_400_000).toISOString().slice(0, 10)
    const { days, stories } = await fetchPoolDays(since)
    console.log(`[ingest] pool days=${days} stories=${stories.length} boundary=${purgeBoundary().toISOString()}`)
    // Reuse the route's dedupe+insert by hitting its logic inline (same shape).
    const sinceISO = new Date(Date.now() - 14 * 86_400_000).toISOString()
    const { data: existing } = await supabase.from('content_ideas')
      .select('source_url, title_norm').eq('source_type', 'pool_headline').gte('created_at', sinceISO).limit(3000)
    const seenUrls = new Set((existing || []).map(r => r.source_url).filter(Boolean))
    const seenTitles = new Set((existing || []).map(r => r.title_norm).filter(Boolean))
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 160)
    const rows = []
    for (const s of stories) {
      const t = norm(s.headline)
      if ((s.url && seenUrls.has(s.url)) || seenTitles.has(t)) continue
      if (s.url) seenUrls.add(s.url); seenTitles.add(t)
      rows.push({
        idea: s.headline, thesis: s.say, source_type: 'pool_headline', source_ref: `pool:${s.day}`,
        source_url: s.url, source_snippet: s.say, source_captured_at: `${s.day}T12:00:00Z`,
        state: 'seeded', origin: 'agent', horizon: 'news',
        expires_at: (await import('../api/_weeks.js')).purgeBoundary().toISOString(),
        title_norm: t, meta: { pool: { day: s.day, category: s.category, source: s.source, source_count: s.sourceCount } },
      })
    }
    if (rows.length) {
      const { error, count } = await supabase.from('content_ideas').insert(rows, { count: 'exact' })
      if (error) throw new Error(error.message)
      console.log(`[ingest] inserted=${count}`)
    } else console.log('[ingest] nothing new')
  }

  if (step === 'detect' || step === 'all') {
    const { runDetect } = await import('../api/shifts/detect.js')
    console.log('[detect]', JSON.stringify(await runDetect()))
  }

  if (step === 'assemble' || step === 'all') {
    const { runAssemble } = await import('../api/briefs/assemble.js')
    console.log('[assemble]', JSON.stringify(await runAssemble()))
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('DRY RUN FAILED:', e?.message || e); process.exit(1) })

// `export {}` makes this a module. Without it TypeScript treats a file with
// no imports or exports as a global script, so its top-level consts collide
// with every other standalone script in the project (TS2451) and top-level
// await is rejected (TS1375). No runtime effect — tsx already runs it as ESM.
export {}
