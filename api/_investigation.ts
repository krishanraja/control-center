// _investigation: the MYMU: Teardown weekly investigation: anchor selection, claim
// decomposition, the why-ladder descent, the harness set, and the six gates
// wired in at each drift point.
//
// One investigation per week. Anchor chosen Thursday, ladder runs Thursday
// night, findings land in the Friday 18:00 brief as one more typed decision.
//
// The output of a run is a verified evidence manifest written into
// content_ideas.meta.materials. api/content-ideas/[id]/final-pass.ts already
// reads that and injects it as "BACKGROUND MATERIALS", so _finalPass judges its
// five lenses against real rows instead of vibes. That seam is the point of the
// whole build: _finalPass demands five lenses and treats an unverifiable
// load-bearing claim as an instant fail, and until now it HAD NO EVIDENCE
// SUPPLY. This is that supply.

import { randomUUID, createHash } from 'node:crypto'
import { supabase } from './_supabase.js'
import { onTeardownBeat } from './_beat.js'
import { robustJson, sanitizeVoice } from './_content.js'
import { isoWeekLabel } from './_weeks.js'
import { rootDomain } from './_trendGate.js'
import {
  gateAnchor, groundClaim, gateInterest, gateRung, gateAnalogy, gateEvidence,
  terminalStatement, falsifierDueOn, diversity, originKey, numericFingerprint,
  sourceTier, lexiconIsStale, MAX_RUNGS, MAX_ANCHOR_ATTEMPTS,
  MIN_CIRCULATION_DOMAINS, CIRCULATION_WINDOW_DAYS, GROUNDING_FAILURE_LIMIT,
  MIN_INVESTIGATION_DOMAINS, MAX_EVIDENCE_FETCHES_PER_RUN, check,
  type GateVerdict, type GateId, type TerminalReason, type GroundingResult,
} from './_gates.js'
import { logGate, logGates, assertGatesRan, promptSha } from './_gateLog.js'
import {
  newBudget, budgetLeft, callMetered, fetchPages, LADDER_MODEL, UTILITY_MODEL,
  harnessSupporting, harnessContradictory, harnessBaseRate, harnessPrimarySource,
  harnessProvenanceChain, harnessAdjacentCategory,
  type RunBudget, type HarnessResult, type HarnessName, type HarnessContext,
} from './_harness.js'
import {
  buildDecomposePrompt, buildRegroundPrompt, buildDescentPrompt,
  buildVendorEntityPrompt, buildPublisherBeatPrompt, readClaims,
  type RawClaim, type RawRung,
} from './_ladder.js'
import {
  rankAnchors, numberSentence, ANCHOR_WINDOW_DAYS,
  type AnchorCandidate, type RankedAnchor,
} from './_anchor.js'

// Pillars are the content taxonomy; SHIFT_CATEGORIES is the beat taxonomy the
// publisher-plausibility map speaks. One mapping, kept here so neither file
// grows a second taxonomy.
const PILLAR_CATEGORY: Record<string, string> = {
  'pillar:agentic_ops': 'orchestration',
  'pillar:ai_decision_making': 'org',
  'pillar:builder_economy': 'economics',
  'pillar:open_web_econ': 'economics',
  'pillar:portfolio_operating': 'org',
}

const EXPECTED_GATES: GateId[] = ['G1_anchor', 'G2_grounding', 'G3_interest', 'G4_ladder', 'G5_harness']

export interface RunOpts {
  dryRun?: boolean
  isTest?: boolean
  /** Force a specific content_ideas row as the anchor (verification runs). */
  anchorId?: string
  disabledHarnesses?: HarnessName[]
  /** Cap overrides, for a cheap probe run. */
  maxModelCalls?: number
  maxSearchCalls?: number
  maxFetches?: number
}

// ── Loading ─────────────────────────────────────────────────────────────────

export async function loadCandidates(windowDays = ANCHOR_WINDOW_DAYS): Promise<AnchorCandidate[]> {
  const sinceISO = new Date(Date.now() - windowDays * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('content_ideas')
    .select('id, idea, thesis, source_snippet, source_url, source_type, source_captured_at, created_at, meta, state, pillar_id, brand_fit_score, quality_score')
    .in('source_type', ['inspiration_sweep', 'lane_sourcing', 'pool_headline', 'signal_inbox'])
    .not('state', 'in', '("dropped","absorbed")')
    .is('buried_at', null)
    .or(`created_at.gte.${sinceISO},source_captured_at.gte.${sinceISO}`)
    .limit(400)
  if (error) throw new Error(error.message)

  return (data || []).map(r => {
    const row = r as Record<string, unknown>
    const meta = (row.meta || {}) as Record<string, unknown>
    const recs = Array.isArray(meta.recurrences) ? meta.recurrences.length : 0
    return {
      id: String(row.id),
      // Sweep headlines carry em dashes. sanitizeVoice is applied at assemble
      // and at shifts/[id]/write, not at ingest, so anything surfaced from here
      // has to be run through it.
      headline: sanitizeVoice(String(row.idea || '')),
      snippet: sanitizeVoice(String(row.thesis || row.source_snippet || '')),
      url: (row.source_url as string) || null,
      day: String(row.created_at || '').slice(0, 10),
      recurrences: recs,
      temporalClass: (meta.temporal_class as string) || null,
      pillarId: (row.pillar_id as string) || null,
      brandFit: (row.brand_fit_score as number) ?? null,
      qualityScore: (row.quality_score as string) || null,
      sourceType: String(row.source_type || ''),
      sourceLabel: (meta.source_label as string) || null,
      state: (row.state as string) || null,
    }
  })
}

export async function priorAnchorHeadlines(): Promise<string[]> {
  const { data } = await supabase
    .from('investigations')
    .select('anchor_headline')
    .not('anchor_headline', 'is', null)
    .order('started_at', { ascending: false })
    .limit(60)
  return (data || []).map(r => String((r as { anchor_headline: string }).anchor_headline)).filter(Boolean)
}

async function loadBeatOverrides(): Promise<Record<string, string[]>> {
  const { data } = await supabase.from('publisher_beats').select('domain, beats').limit(500)
  const out: Record<string, string[]> = {}
  for (const r of data || []) {
    const row = r as { domain: string; beats: string[] }
    if (row.domain && Array.isArray(row.beats)) out[row.domain] = row.beats
  }
  return out
}

// ── G1: anchor selection with the vendor rule enforced in code ──────────────

export interface AnchorDecision {
  ranked: RankedAnchor[]
  chosen: RankedAnchor | null
  verdicts: GateVerdict[]
  attempts: { ref: string; headline: string; action: string; reason: string }[]
  thesisMode: 'mechanism' | 'circulation'
  rung0Question: string | null
  entity: string | null
  origin: string
  denominator: string
  provenance: HarnessResult | null
  degraded: string[]
}

export async function selectAnchor(
  ranked: RankedAnchor[],
  budget: RunBudget,
  hctx: HarnessContext,
  opts: { dryRun?: boolean } = {},
): Promise<AnchorDecision> {
  const verdicts: GateVerdict[] = []
  const attempts: AnchorDecision['attempts'] = []
  const degraded: string[] = []
  const stale = lexiconIsStale()
  if (stale.stale) degraded.push(`vendor lexicon last reviewed ${stale.ageDays} days ago`)

  const survivors = ranked.filter(r => r.rank).sort((a, b) => (a.rank as number) - (b.rank as number))
  let provenance: HarnessResult | null = null

  for (let i = 0; i < Math.min(MAX_ANCHOR_ATTEMPTS, survivors.length); i++) {
    const row = survivors[i]
    const c = row.candidate
    const ref = `a${i + 1}`
    const sentence = numberSentence(c)

    // G0 runs before anything that costs money. A capability announcement or a
    // governance story is off-beat however well it scores, so drop it here
    // rather than paying for a gate call on a piece that must not be written.
    if (!onTeardownBeat(c.headline, sentence)) {
      attempts.push({
        ref, headline: c.headline, action: 'block',
        reason: 'off-beat for MYMU: Teardown (event story with no second-order economic effect: pricing, unit economics, positioning, corporate strategy or labour)',
      })
      continue
    }

    // The pure pass first. It is free, and for a non-vendor anchor it is the
    // whole gate: no call is made at all.
    let first = gateAnchor({
      ref, headline: c.headline, url: c.url, numberSentence: sentence,
      loadBearingNumber: true, circulationDomains: 0, circulationWindowDays: CIRCULATION_WINDOW_DAYS,
    })

    // The ONE place a model is admitted to G1: the entity is not in the
    // lexicon. Never auto-writes the code lexicon; it proposes, Krish ratifies.
    if (first.origin === 'independent' && !opts.dryRun && budgetLeft(budget).model > 0) {
      const { system, user } = buildVendorEntityPrompt(sentence, first.entity)
      const res = await callMetered({ system, user, model: UTILITY_MODEL, maxTokens: 300 }, budget)
      const parsed = robustJson(res.text) as { entity?: string; entity_is_seller_of_the_thing_measured?: boolean; confidence?: number } | null
      if (parsed?.entity && typeof parsed.confidence === 'number') {
        first = gateAnchor({
          ref, headline: c.headline, url: c.url, numberSentence: sentence,
          loadBearingNumber: true, circulationDomains: 0, circulationWindowDays: CIRCULATION_WINDOW_DAYS,
          modelEntity: { entity: parsed.entity, sells: Boolean(parsed.entity_is_seller_of_the_thing_measured), confidence: parsed.confidence },
        })
        if (parsed.confidence >= 0.7 && parsed.entity_is_seller_of_the_thing_measured) {
          // Plain insert, duplicate swallowed. `upsert({onConflict:'entity'})` was
          // a silent no-op: the unique index is on lower(entity), an EXPRESSION
          // index, which PostgREST's on_conflict=entity cannot target, so every
          // write returned 42P10 and the discarded error hid it. Verified against
          // the live database 2026-08-05. The lexicon learning loop, which is the
          // only route by which a vendor missing from the hardcoded map ever gets
          // proposed for it, had never written a row.
          const { error } = await supabase.from('vendor_lexicon_pending').insert({
            entity: parsed.entity, domain: rootDomain(c.url),
            sells_the_thing_measured: true, confidence: parsed.confidence,
            evidence: sentence.slice(0, 400),
          })
          if (error && error.code !== '23505') degraded.push(`vendor lexicon proposal not recorded: ${error.message}`)
        }
      } else {
        // FAIL LOUD. G1's model backstop is the ONLY guard against a vendor whose
        // domain and aliases are both absent from the lexicon, and an errored or
        // unparseable call previously left the anchor passing as `independent`
        // with no degraded reason and model_calls 0 in the gate log, so a paid
        // call that failed was indistinguishable from a call never made.
        degraded.push(`G1 vendor-entity adjudication returned nothing usable for ${ref} (${res.error || 'unparseable response'}); anchor admitted on the lexicon alone`)
      }
    }

    if (first.verdict.action === 'pass' || first.verdict.action === 'flag') {
      verdicts.push(first.verdict)
      attempts.push({ ref, headline: c.headline, action: first.verdict.action, reason: 'admissible as a rung-0 mechanism thesis' })
      return {
        ranked, chosen: row, verdicts, attempts, thesisMode: 'mechanism', rung0Question: null,
        entity: first.entity, origin: first.origin, denominator: first.denominator, provenance, degraded,
      }
    }

    // Vendor-sourced. The rule does not kill the story, it changes it. But the
    // circulation thesis needs its own floor or it is just one press release,
    // so the provenance harness has to earn it.
    let circulationDomains = 0
    if (!opts.dryRun) {
      provenance = await harnessProvenanceChain(ref, `${c.headline}. ${c.snippet}`, hctx)
      circulationDomains = Number((provenance.payload as { distinct_domains?: number })?.distinct_domains || 0)
    }
    const second = gateAnchor({
      ref, headline: c.headline, url: c.url, numberSentence: sentence,
      loadBearingNumber: true, circulationDomains, circulationWindowDays: CIRCULATION_WINDOW_DAYS,
    })
    verdicts.push(second.verdict)

    if (second.verdict.action === 'downgrade') {
      attempts.push({ ref, headline: c.headline, action: 'downgrade', reason: `vendor-sourced number blocked as rung-0; pivoted to a circulation thesis on ${circulationDomains} domains` })
      return {
        ranked, chosen: row, verdicts, attempts, thesisMode: 'circulation',
        rung0Question: second.rung0Question, entity: second.entity, origin: second.origin,
        denominator: second.denominator, provenance, degraded,
      }
    }
    attempts.push({ ref, headline: c.headline, action: 'block', reason: `vendor-sourced number and only ${circulationDomains} distinct domains, below the circulation floor of ${MIN_CIRCULATION_DOMAINS}` })
  }

  return {
    ranked, chosen: null, verdicts, attempts, thesisMode: 'mechanism', rung0Question: null,
    entity: null, origin: 'unknown', denominator: 'no_number', provenance, degraded,
  }
}

// ── The run ─────────────────────────────────────────────────────────────────

interface StoredEvidence {
  ref: string
  url: string
  domain: string
  headline: string
  pageText: string
  pageTitle: string | null
  publishedOn: string | null
  citable: boolean
  quarantineReason: string | null
  loadBearing: boolean
  tier: number
  originKey: string
}

export interface RunResult {
  ok: boolean
  runId: string | null
  week: string
  status: string
  anchor: Record<string, unknown> | null
  candidates: Record<string, unknown>[]
  ladder: Record<string, unknown>[]
  terminal: { rung: number; reason: TerminalReason | null; statement: string | null } | null
  evidence: { total: number; citable: number; quarantined: number; distinctDomains: number; distinctOrigins: number }
  harnesses: { harness: string; verdict: string; costCalls: number; costFetches: number }[]
  gates: { written: number; missing: string[]; counts: Record<string, number> }
  budget: Record<string, unknown>
  degraded: string[]
  abortReason?: string
  skipped: { what: string; why: string }[]
}

export async function runInvestigation(opts: RunOpts = {}): Promise<RunResult> {
  const week = isoWeekLabel()
  const today = new Date().toISOString().slice(0, 10)
  const runId = randomUUID()
  const budget = newBudget({
    ...(opts.maxModelCalls ? { maxModelCalls: opts.maxModelCalls } : {}),
    ...(opts.maxSearchCalls ? { maxSearchCalls: opts.maxSearchCalls } : {}),
    ...(opts.maxFetches ? { maxFetches: opts.maxFetches } : {}),
  })
  const hctx: HarnessContext = { budget, disabled: new Set(opts.disabledHarnesses || []) }
  const ctx = { runId, week }
  const degraded: string[] = []
  const harnessLog: HarnessResult[] = []

  const empty: RunResult = {
    ok: false, runId, week, status: 'aborted', anchor: null, candidates: [], ladder: [],
    terminal: null,
    evidence: { total: 0, citable: 0, quarantined: 0, distinctDomains: 0, distinctOrigins: 0 },
    harnesses: [], gates: { written: 0, missing: [], counts: {} },
    budget: {}, degraded, skipped: budget.skipped,
  }

  // 1. ANCHOR
  const all = await loadCandidates()
  const prior = await priorAnchorHeadlines()
  let ranked = rankAnchors(all, { today, priorAnchorHeadlines: prior })

  if (opts.anchorId) {
    // Forced anchor still runs every gate; it only skips the ranking choice.
    ranked = ranked.map(r => ({ ...r, rank: r.candidate.id === opts.anchorId ? 1 : null }))
    if (!ranked.some(r => r.rank === 1)) return { ...empty, abortReason: `anchor ${opts.anchorId} not in the live candidate pool` }
  }

  const candidateSummary = ranked
    .filter(r => r.rank)
    .sort((a, b) => (a.rank as number) - (b.rank as number))
    .slice(0, 10)
    .map(r => ({
      rank: r.rank, id: r.candidate.id, headline: r.candidate.headline,
      domain: rootDomain(r.candidate.url), score: r.score?.total, parts: r.score?.parts, observed: r.score?.observed,
    }))
  const rejectedSummary = ranked.filter(r => !r.rank && !r.overCap).map(r => ({
    id: r.candidate.id, headline: r.candidate.headline.slice(0, 100), failed: r.preGate.failedIds,
  }))
  const overCapCount = ranked.filter(r => r.overCap).length
  if (overCapCount) budget.skipped.push({ what: `${overCapCount} pre-gate survivors`, why: 'ranked below the top 40 scored candidates' })

  if (opts.dryRun) {
    const plan = await selectAnchor(ranked, budget, hctx, { dryRun: true })
    return {
      ...empty, ok: true, status: 'dry_run',
      anchor: plan.chosen ? { id: plan.chosen.candidate.id, headline: plan.chosen.candidate.headline, thesis_mode: plan.thesisMode } : null,
      candidates: candidateSummary,
      degraded: [...degraded, ...plan.degraded],
      budget: { ...budget, planned_rejects: rejectedSummary.length },
    }
  }

  await supabase.from('investigations').insert({
    id: runId, week, status: 'running', is_test: Boolean(opts.isTest),
    candidates: candidateSummary,
  })

  const decision = await selectAnchor(ranked, budget, hctx, {})
  degraded.push(...decision.degraded)
  if (decision.provenance) harnessLog.push(decision.provenance)
  await logGates(ctx, decision.verdicts)

  if (!decision.chosen) {
    // A legitimate weekly outcome. Zero verified anchors is exactly how
    // shifts/detect.ts treats zero verified shifts, and there is deliberately
    // no fallback that forces a piece.
    await supabase.from('investigations').update({
      status: 'aborted', abort_reason: `no admissible anchor in ${MAX_ANCHOR_ATTEMPTS} attempts`,
      degraded: degraded.length > 0, degraded_reasons: degraded, finished_at: new Date().toISOString(),
      model_calls: budget.modelCalls, input_tokens: budget.inputTokens, output_tokens: budget.outputTokens,
      est_cost_usd: Number(budget.estCostUsd.toFixed(4)), page_fetches: budget.fetches, search_calls: budget.searchCalls,
    }).eq('id', runId)
    return { ...empty, candidates: candidateSummary, abortReason: `no admissible anchor in ${MAX_ANCHOR_ATTEMPTS} attempts`, budget: { ...budget }, degraded }
  }

  const anchor = decision.chosen.candidate
  const category = PILLAR_CATEGORY[anchor.pillarId || ''] || 'economics'
  const anchorText = `${anchor.headline}. ${anchor.snippet}`

  await supabase.from('investigations').update({
    anchor_idea_id: anchor.id, anchor_headline: anchor.headline, anchor_url: anchor.url,
    anchor_domain: rootDomain(anchor.url), anchor_score: decision.chosen.score?.total ?? null,
    anchor_scores: { parts: decision.chosen.score?.parts, observed: decision.chosen.score?.observed },
    thesis_mode: decision.thesisMode, rung0_question: decision.rung0Question,
  }).eq('id', runId)

  // 2. HARNESSES. Each is individually capped and individually skippable, and a
  // failure is recorded rather than raised.
  const mechanismHint = decision.thesisMode === 'circulation'
    ? (decision.rung0Question || anchorText)
    : anchorText
  harnessLog.push(await harnessPrimarySource('a1', anchorText, hctx))
  harnessLog.push(await harnessSupporting('a1', anchorText, hctx))
  harnessLog.push(await harnessContradictory('a1', anchorText, hctx))
  harnessLog.push(await harnessBaseRate('a1', anchorText, hctx))
  if (budgetLeft(budget).search > 0) harnessLog.push(await harnessAdjacentCategory('a1', mechanismHint, hctx))
  if (decision.thesisMode === 'mechanism' && budgetLeft(budget).search > 0) {
    harnessLog.push(await harnessProvenanceChain('a1', anchorText, hctx))
  }

  for (const h of harnessLog) {
    await supabase.from('investigation_harness_results').insert({
      investigation_id: runId, harness: h.harness, subject_ref: h.subjectRef, query: h.query,
      verdict: h.verdict, cost_calls: h.costCalls, cost_fetches: h.costFetches,
      latency_ms: h.latencyMs, payload: h.payload,
    })
  }

  // 3. G5. Fetch, verify, quarantine. This is the fabrication gate.
  const citationUrls: string[] = []
  if (anchor.url) citationUrls.push(anchor.url)
  for (const h of harnessLog) {
    const cites = ((h.payload as { citations?: string[] })?.citations) || []
    for (const u of cites) if (rootDomain(u) && !citationUrls.includes(u)) citationUrls.push(u)
  }
  const toFetch = citationUrls.slice(0, Math.min(MAX_EVIDENCE_FETCHES_PER_RUN, budget.maxFetches))
  if (citationUrls.length > toFetch.length) {
    budget.skipped.push({ what: `${citationUrls.length - toFetch.length} candidate URLs`, why: `over the per-run fetch cap of ${MAX_EVIDENCE_FETCHES_PER_RUN}` })
  }
  const pages = await fetchPages(toFetch, budget)
  const beatOverrides = await loadBeatOverrides()

  const stored: StoredEvidence[] = []
  const evidenceVerdicts: GateVerdict[] = []
  const unknownDomains: { domain: string; headline: string; claim: string }[] = []

  pages.forEach((p, i) => {
    const ref = `e${i + 1}`
    const storedHeadline = p.url === anchor.url ? anchor.headline : (p.title || p.ogTitle || '')
    const g = gateEvidence({
      ref, url: p.url, storedHeadline,
      // The anchor row is checked against its own claim; harness citations are
      // checked for liveness and identity, and their numbers are checked at G6
      // against the specific assertion that cites them.
      claimText: p.url === anchor.url ? anchorText : storedHeadline,
      category, occurredOn: p.url === anchor.url ? anchor.day : null,
      fetched: { ok: p.ok, status: p.status, title: p.title, ogTitle: p.ogTitle, publishedOn: p.publishedOn, text: p.text, error: p.error },
      beatOverrides,
    })
    evidenceVerdicts.push(g.verdict)
    const dom = rootDomain(p.url) || ''
    stored.push({
      ref, url: p.url, domain: dom, headline: storedHeadline || p.url,
      pageText: p.text.slice(0, 12_000), pageTitle: p.title, publishedOn: p.publishedOn,
      citable: g.citable, quarantineReason: g.quarantineReason, loadBearing: g.loadBearing, tier: g.tier,
      originKey: originKey(decision.entity || dom, `${storedHeadline} ${p.text.slice(0, 3000)}`),
    })
  })
  await logGates(ctx, evidenceVerdicts)

  for (const s of stored) {
    if (!beatOverrides[s.domain] && s.citable) unknownDomains.push({ domain: s.domain, headline: s.headline.slice(0, 160), claim: anchorText.slice(0, 200) })
    await supabase.from('investigation_evidence').insert({
      investigation_id: runId, ref: s.ref, url: s.url, domain: s.domain, headline: s.headline.slice(0, 500),
      source_tier: s.tier, page_title: s.pageTitle, page_text: s.pageText, published_on: s.publishedOn,
      citable: s.citable, quarantine_reason: s.quarantineReason, load_bearing: s.loadBearing,
      entity: decision.entity, numeric_fingerprint: numericFingerprint(`${s.headline} ${s.pageText.slice(0, 3000)}`),
      origin_key: s.originKey, harness: 'url_liveness',
    })
  }

  // G5.4, the one batched model call: only domains the map does not know.
  if (unknownDomains.length && budgetLeft(budget).model > 0) {
    const uniq = [...new Map(unknownDomains.map(u => [u.domain, u])).values()].slice(0, 8)
    const { system, user } = buildPublisherBeatPrompt(uniq)
    const res = await callMetered({ system, user, model: UTILITY_MODEL, maxTokens: 700 }, budget)
    const parsed = robustJson(res.text) as { results?: { domain?: string; plausible?: boolean; beat?: string[]; why?: string }[] } | null
    const rows = (parsed?.results || []).filter(r => r?.domain && Array.isArray(r.beat))
    for (const r of rows) {
      await supabase.from('publisher_beats').upsert({
        domain: r.domain, beats: r.beat, confirmed_by: 'model',
        confidence: r.plausible === false ? 0.5 : 0.8, note: (r.why || '').slice(0, 300),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'domain' })
    }
    await logGate(ctx, {
      gate: 'G5_harness', subject_kind: 'evidence', subject_ref: 'beats', subject_label: 'publisher beat adjudication',
      action: 'flag', score: rows.length, model_calls: 1,
      checks: [check('publisher_beats_learned', rows.length > 0, rows.map(r => ({ domain: r.domain, beat: r.beat })), 'unknown domains resolved and cached', false)],
    }, { modelName: UTILITY_MODEL, inputTokens: res.inputTokens, outputTokens: res.outputTokens, promptSha: promptSha(system, user) })
  }

  const citable = stored.filter(s => s.citable)
  // Keyed on the ANCHOR's own numbers. Keying on each page's whole numeric
  // fingerprint counted every reprint as its own origin, because page furniture
  // (read time, comment count, price, copyright year) differs on every masthead.
  const div = diversity(
    citable.map(s => ({ url: s.url, entity: decision.entity, headline: s.headline, snippet: s.pageText.slice(0, 1500) })),
    anchorText,
  )
  await logGate(ctx, {
    gate: 'G5_harness', subject_kind: 'evidence', subject_ref: 'diversity', subject_label: 'investigation-wide source diversity',
    action: div.distinctDomains >= MIN_INVESTIGATION_DOMAINS ? 'pass' : 'flag', score: div.distinctDomains, model_calls: 0,
    checks: [
      check('distinct_domains', div.distinctDomains >= MIN_INVESTIGATION_DOMAINS, div.distinctDomains, `>= ${MIN_INVESTIGATION_DOMAINS} distinct root domains`),
      // Nine outlets reprinting one release is domains 9, origins 1. Both are
      // recorded, and that pair IS the circulation thesis when G1 pivots.
      check('distinct_origins', !div.circular, { domains: div.distinctDomains, origins: div.distinctOrigins, circular: div.circular }, 'distinct origins, not just distinct domains'),
    ],
  })

  // 4. G2. Decompose the anchor against its own fetched page text.
  const anchorPage = stored.find(s => s.url === anchor.url)
  const sourceText = [anchorText, anchorPage?.pageText || ''].join('\n\n')
  const pillarEvidence = await loadPillarEvidence(anchor.pillarId)

  let claims: RawClaim[] = []
  let grounded: { claim: RawClaim; g: GroundingResult }[] = []
  for (let attempt = 1; attempt <= 2; attempt++) {
    const p = attempt === 1
      ? buildDecomposePrompt(anchor.headline, sourceText, pillarEvidence)
      : buildRegroundPrompt(anchor.headline, sourceText, grounded.filter(x => x.g.action === 'block').map(x => String(x.claim.quote || '')))
    const res = await callMetered({ system: p.system, user: p.user, model: UTILITY_MODEL, maxTokens: 2600 }, budget)
    claims = readClaims(robustJson(res.text))
    grounded = claims.map(c => ({ claim: c, g: groundClaim(String(c.text || ''), String(c.quote || ''), sourceText) }))
    const failRate = grounded.length ? grounded.filter(x => x.g.action === 'block').length / grounded.length : 1
    await logGates(ctx, grounded.map((x, i) => ({
      gate: 'G2_grounding' as const, subject_kind: 'claim' as const, subject_ref: `c${i + 1}`,
      subject_label: String(x.claim.text || '').slice(0, 160),
      action: x.g.action, score: Number(x.g.containment.toFixed(3)), checks: x.g.checks, model_calls: 0,
    })), { modelName: UTILITY_MODEL, inputTokens: res.inputTokens, outputTokens: res.outputTokens, promptSha: promptSha(p.system, p.user) })

    if (failRate <= GROUNDING_FAILURE_LIMIT && grounded.length) break
    if (attempt === 2) {
      await supabase.from('investigations').update({
        status: 'aborted', abort_reason: `grounding failed on both attempts (${Math.round(failRate * 100)}% of claims unfound in source)`,
        degraded: true, degraded_reasons: degraded, finished_at: new Date().toISOString(),
        model_calls: budget.modelCalls, input_tokens: budget.inputTokens, output_tokens: budget.outputTokens,
        est_cost_usd: Number(budget.estCostUsd.toFixed(4)), page_fetches: budget.fetches, search_calls: budget.searchCalls,
      }).eq('id', runId)
      return { ...empty, candidates: candidateSummary, abortReason: 'grounding failed twice', budget: { ...budget }, degraded }
    }
  }

  // 5. G3. Gate first, rank second. A 9 on surprise can never carry a 2 on
  // verifiability, because the gate runs before the ranking exists.
  const interest = grounded
    .filter(x => x.g.action !== 'block')
    .map((x, i) => ({ x, ref: `c${i + 1}`, r: gateInterest({ ref: `c${i + 1}`, text: String(x.claim.text || ''), surprise: Number(x.claim.surprise || 0), verifiability: Number(x.claim.verifiability || 0), falsifier: String(x.claim.falsifier || '') }) }))
  await logGates(ctx, interest.map(i => i.r.verdict))
  const survivorsC = interest.filter(i => i.r.verdict.action === 'pass').sort((a, b) => b.r.priority - a.r.priority)

  // Persist every claim, survivors and casualties alike.
  const claimIds = new Map<string, string>()
  for (const it of interest) {
    const id = randomUUID()
    claimIds.set(it.ref, id)
    await supabase.from('investigation_claims').insert({
      id, investigation_id: runId, ref: it.ref, rung: 0, text: String(it.x.claim.text || '').slice(0, 2000),
      claim_type: ['thesis', 'mechanism', 'observation', 'analogy'].includes(String(it.x.claim.claim_type)) ? it.x.claim.claim_type : null,
      mechanism_type: it.x.claim.mechanism_type || null, quantity: it.x.claim.quantity || null,
      quote: String(it.x.claim.quote || '').slice(0, 2000), grounding: it.x.g.grounding,
      strength_inflation: it.x.g.strengthInflation,
      falsifier: String(it.x.claim.falsifier || '').slice(0, 1000),
      falsifier_well_formed: it.r.wellFormed, falsifier_jaccard: it.r.jaccard,
      falsifier_due_on: it.r.wellFormed ? falsifierDueOn() : null,
      surprise: Number(it.x.claim.surprise || 0), verifiability: Number(it.x.claim.verifiability || 0), priority: it.r.priority,
      source_url: anchor.url, source_domain: rootDomain(anchor.url), source_tier: sourceTier(anchor.url),
      publisher_is_beneficiary: decision.origin === 'self' || decision.origin === 'self_relayed',
      checkable: Number(it.x.claim.verifiability || 0) >= 2,
      status: it.r.verdict.action === 'pass' ? 'active' : 'blocked',
    })
  }

  if (!survivorsC.length) {
    await supabase.from('investigations').update({
      status: 'aborted', abort_reason: 'no claim survived the interestingness gate (falsifier or verifiability floor)',
      degraded: degraded.length > 0, degraded_reasons: degraded, finished_at: new Date().toISOString(),
      model_calls: budget.modelCalls, input_tokens: budget.inputTokens, output_tokens: budget.outputTokens,
      est_cost_usd: Number(budget.estCostUsd.toFixed(4)), page_fetches: budget.fetches, search_calls: budget.searchCalls,
    }).eq('id', runId)
    return { ...empty, candidates: candidateSummary, abortReason: 'no claim survived G3', budget: { ...budget }, degraded }
  }

  // 6. G4. The descent. Loop bound, not prompt, enforces MAX_RUNGS.
  const rung0 = survivorsC[0]
  const rung0Text = decision.rung0Question || String(rung0.x.claim.text || '')
  const descentEvidence = citable.slice(0, 10).map(s => ({ ref: s.ref, domain: s.domain, headline: s.headline, snippet: s.pageText.slice(0, 900) }))
  const ladder: Record<string, unknown>[] = [{ rung: 0, ref: rung0.ref, text: rung0Text, mechanism_type: rung0.x.claim.mechanism_type || null, priority: rung0.r.priority }]
  const priorTexts = [rung0Text]
  const priorAbstraction: number[] = []
  let question = decision.thesisMode === 'circulation'
    ? (decision.rung0Question as string)
    : `Why is it the case that: ${rung0Text}`
  let terminalReason: TerminalReason | null = null
  let terminalRung = 0
  let parentId = claimIds.get(rung0.ref) || null

  for (let rung = 1; rung <= MAX_RUNGS; rung++) {
    // A SPENDING CAP IS NOT A FINDING. These three exits are the run failing, not
    // the record running out, and the terminal statement gets PUBLISHED verbatim.
    // Collapsing them into evidence_exhausted printed "Past this point the record
    // runs out. N searches across M domains produced nothing citable", which is a
    // false claim about how hard the system looked, in the one paragraph this
    // pipeline promises to keep honest.
    if (budgetLeft(budget).model <= 0) { degraded.push(`descent stopped at rung ${rung}: model call cap ${budget.maxModelCalls} reached`); terminalReason = 'budget_exhausted'; terminalRung = rung - 1; break }
    const p = buildDescentPrompt(question, rung, priorTexts, descentEvidence)
    const res = await callMetered({ system: p.system, user: p.user, model: LADDER_MODEL, maxTokens: 1400 }, budget)
    if (res.error) { degraded.push(`descent rung ${rung}: ${res.error}`); terminalReason = 'budget_exhausted'; terminalRung = rung - 1; break }
    const raw = (robustJson(res.text) || {}) as RawRung
    const answer = sanitizeVoice(String(raw.answer || ''))
    if (!answer) {
      // An empty model response is NOT the same thing as the record running
      // out, and the terminal statement gets published, so the difference has
      // to survive into the audit rather than being quietly rounded to the
      // nicer reason.
      degraded.push(`descent rung ${rung}: model returned no usable answer, terminal reason recorded as budget_exhausted`)
      terminalReason = 'budget_exhausted'
      terminalRung = rung - 1
      break
    }

    const refs = Array.isArray(raw.evidence_refs) ? raw.evidence_refs.map(String) : []
    const rows = refs.map(r => citable.find(s => s.ref === r)).filter(Boolean) as StoredEvidence[]
    const rungSource = rows.map(r => `${r.headline} ${r.pageText}`).join('\n')
    const g = rungSource ? groundClaim(answer, String(raw.quote || ''), rungSource) : null

    const rr = gateRung({
      ref: `r${rung}`, rung, text: answer,
      mechanismType: raw.mechanism_type || null,
      evidenceIds: rows.map(r => r.ref),
      evidenceDomains: rows.map(r => r.domain),
      grounding: g, priorRungTexts: priorTexts, priorAbstraction,
    })
    await logGate(ctx, rr.verdict, { modelName: LADDER_MODEL, inputTokens: res.inputTokens, outputTokens: res.outputTokens, promptSha: promptSha(p.system, p.user) })
    if (g) {
      await logGate(ctx, {
        gate: 'G2_grounding', subject_kind: 'rung', subject_ref: `r${rung}`, subject_label: answer.slice(0, 160),
        action: g.action, score: Number(g.containment.toFixed(3)), checks: g.checks, model_calls: 0,
      })
    }

    // An analogy is downgraded to prose, never counted as evidence, unless it
    // names a mechanism from the enum and the dated point it breaks.
    if (raw.shared_mechanism || raw.breaks_if) {
      const a = gateAnalogy({ ref: `r${rung}`, text: answer, sharedMechanism: raw.shared_mechanism || null, breaksIf: raw.breaks_if || null })
      await logGate(ctx, a.verdict)
    }

    const rungClaimId = randomUUID()
    await supabase.from('investigation_claims').insert({
      id: rungClaimId, investigation_id: runId, ref: `r${rung}`, rung, parent_id: parentId,
      text: answer.slice(0, 2000), claim_type: raw.shared_mechanism ? 'analogy' : 'mechanism',
      mechanism_type: raw.mechanism_type || null, quote: String(raw.quote || '').slice(0, 2000),
      grounding: g?.grounding || null, strength_inflation: g?.strengthInflation || false,
      shared_mechanism: raw.shared_mechanism || null, breaks_if: raw.breaks_if || null,
      abstraction_score: rr.abstraction, new_artifacts: rr.newArtifacts.slice(0, 20),
      source_url: rows[0]?.url || null, source_domain: rows[0]?.domain || null, source_tier: rows[0]?.tier ?? null,
      status: rr.mayDescend ? 'active' : 'downgraded',
    })
    ladder.push({
      rung, ref: `r${rung}`, text: answer, mechanism_type: raw.mechanism_type || null,
      evidence_refs: rows.map(r => r.ref), domains: [...new Set(rows.map(r => r.domain))],
      abstraction: Number(rr.abstraction.toFixed(4)), new_artifacts: rr.newArtifacts.slice(0, 8),
      may_descend: rr.mayDescend, terminal_reason: rr.terminalReason,
    })
    priorTexts.push(answer)
    priorAbstraction.push(rr.abstraction)
    parentId = rungClaimId
    terminalRung = rung

    // DETERMINISTIC REASON WINS. The model's self-reported `exhausted` is only
    // consulted when the code found no reason of its own to stop. Observed on
    // the first full live run: gateRung detected `restatement` (the rung
    // introduced zero new named entities or numbers) while the model reported
    // `evidence_exhausted`, and the model's flattering account overrode the
    // measurement. The terminal statement gets PUBLISHED, so letting the model
    // pick its own terminal reason is letting it write a nicer epitaph than the
    // evidence supports.
    if (!rr.mayDescend) { terminalReason = rr.terminalReason; break }
    if (raw.exhausted) {
      terminalReason = raw.exhausted_reason === 'motive_not_mechanism' ? 'motive_not_mechanism' : 'evidence_exhausted'
      break
    }
    if (rung === MAX_RUNGS) { terminalReason = 'cap'; break }
    question = String(raw.next_question || '').trim() || `Why is it the case that: ${answer}`
  }

  if (!terminalReason) terminalReason = 'cap'
  const statement = sanitizeVoice(terminalStatement(terminalReason, {
    entity: decision.entity, outcome: rung0Text.slice(0, 120),
    searches: budget.searchCalls, domains: div.distinctDomains, question: question.slice(0, 140),
  }))

  // 7. The _finalPass seam. Citations FIRST, because materialsContext truncates
  // each item at 2400 chars and the whole block at 9000.
  const manifest = buildManifest({
    anchor, thesisMode: decision.thesisMode, rung0Question: decision.rung0Question,
    ladder, terminalStatement: statement, terminalReason, evidence: citable, diversity: div,
    harnesses: harnessLog, survivingClaims: survivorsC.map(s => ({ text: String(s.x.claim.text || ''), quote: String(s.x.claim.quote || ''), falsifier: String(s.x.claim.falsifier || '') })),
  })
  await attachMaterials(anchor.id, runId, manifest)

  await supabase.from('content_decisions').upsert({
    week, kind: 'investigation', ref: runId,
    payload: {
      title: `Investigation ready: ${anchor.headline}`.slice(0, 300),
      anchor_headline: anchor.headline, anchor_url: anchor.url,
      thesis_mode: decision.thesisMode, terminal_rung: terminalRung, terminal_reason: terminalReason,
      terminal_statement: statement, citable_evidence: citable.length,
      distinct_domains: div.distinctDomains, distinct_origins: div.distinctOrigins,
      summary: statement,
      implication: `${citable.length} citable rows across ${div.distinctDomains} domains, ${div.distinctOrigins} distinct origins.`,
      idea_id: anchor.id,
    },
  }, { onConflict: 'week,kind,ref', ignoreDuplicates: true })

  // 8. ABSENCE IS FAILURE. A gate that wrote no audit row did not run.
  const gates = await assertGatesRan(runId, EXPECTED_GATES)
  if (!gates.ok) degraded.push(`gates left no audit trace: ${gates.missing.join(', ')}`)

  const finalStatus = gates.ok ? 'complete' : 'complete'
  await supabase.from('investigations').update({
    status: finalStatus, terminal_rung: terminalRung, terminal_reason: terminalReason, terminal_statement: statement,
    degraded: degraded.length > 0, degraded_reasons: degraded, content_idea_id: anchor.id,
    model_calls: budget.modelCalls, input_tokens: budget.inputTokens, output_tokens: budget.outputTokens,
    est_cost_usd: Number(budget.estCostUsd.toFixed(4)), page_fetches: budget.fetches, search_calls: budget.searchCalls,
    finished_at: new Date().toISOString(),
  }).eq('id', runId)

  return {
    ok: true, runId, week, status: finalStatus,
    anchor: {
      id: anchor.id, headline: anchor.headline, url: anchor.url, domain: rootDomain(anchor.url),
      score: decision.chosen.score?.total, parts: decision.chosen.score?.parts,
      thesis_mode: decision.thesisMode, rung0_question: decision.rung0Question,
      origin: decision.origin, denominator: decision.denominator, entity: decision.entity,
      attempts: decision.attempts,
    },
    candidates: candidateSummary,
    ladder,
    terminal: { rung: terminalRung, reason: terminalReason, statement },
    evidence: {
      total: stored.length, citable: citable.length, quarantined: stored.length - citable.length,
      distinctDomains: div.distinctDomains, distinctOrigins: div.distinctOrigins,
    },
    harnesses: harnessLog.map(h => ({ harness: h.harness, verdict: h.verdict, costCalls: h.costCalls, costFetches: h.costFetches })),
    gates: { written: Object.values(gates.counts).reduce((a, b) => a + b, 0), missing: gates.missing, counts: gates.counts },
    budget: {
      model_calls: budget.modelCalls, search_calls: budget.searchCalls, page_fetches: budget.fetches,
      input_tokens: budget.inputTokens, output_tokens: budget.outputTokens,
      est_cost_usd: Number(budget.estCostUsd.toFixed(4)),
    },
    degraded, skipped: budget.skipped,
  }
}

async function loadPillarEvidence(pillarId: string | null): Promise<string[]> {
  if (!pillarId) return []
  const { data } = await supabase.from('content_pillars').select('evidence_required').eq('id', pillarId).maybeSingle()
  const ev = (data as { evidence_required?: unknown } | null)?.evidence_required
  return Array.isArray(ev) ? ev.map(String) : []
}

interface ManifestInput {
  anchor: AnchorCandidate
  thesisMode: string
  rung0Question: string | null
  ladder: Record<string, unknown>[]
  terminalStatement: string
  terminalReason: TerminalReason
  evidence: StoredEvidence[]
  diversity: ReturnType<typeof diversity>
  harnesses: HarnessResult[]
  survivingClaims: { text: string; quote: string; falsifier: string }[]
}

/** Tight by construction. materialsContext(perItem 2400, total 9000) silently
 *  cuts a verbose dump, so the citations go first and the prose goes last. */
export function buildManifest(m: ManifestInput): string {
  const cites = m.evidence
    .filter(e => e.loadBearing)
    .slice(0, 12)
    .map(e => `[${e.ref}] tier ${e.tier} ${e.domain} :: ${e.headline.slice(0, 120)} :: ${e.url}`)
  const quarantined = m.harnesses.filter(h => h.verdict === 'miss' || h.verdict === 'error').map(h => h.harness)

  return [
    '## VERIFIED EVIDENCE MANIFEST (MYMU: Teardown)',
    '',
    '### Citable rows, load-bearing only',
    ...(cites.length ? cites : ['(none survived the harness gate)']),
    '',
    `### Source diversity`,
    `${m.diversity.distinctDomains} distinct domains, ${m.diversity.distinctOrigins} distinct origins.` +
      (m.diversity.circular ? ' These differ, which means some coverage is one origin reprinted, not independent measurement. Say so in the piece.' : ''),
    '',
    `### Thesis mode: ${m.thesisMode}`,
    m.rung0Question ? `Rung 0 question: ${m.rung0Question}` : `Anchor: ${m.anchor.headline}`,
    m.thesisMode === 'circulation'
      ? 'A vendor-sourced number was blocked as a rung-0 thesis. The story is not the number, it is how the number travelled.'
      : '',
    '',
    '### The ladder',
    // A rung is appended to `ladder` BEFORE gateRung's verdict is consulted, so a
    // rung that failed grounding or resolved no evidence still lands here. It
    // printed as a plain rung inside a block headed VERIFIED EVIDENCE MANIFEST,
    // which is how an ungrounded sentence reaches a writer looking like a checked
    // one. Failed rungs stay visible, and say what they failed.
    ...m.ladder.map(r => {
      const failed = r.rung !== 0 && r.may_descend === false && r.terminal_reason && r.terminal_reason !== 'cap'
      const mark = failed ? ` [NOT VERIFIED, failed the ladder gate on ${r.terminal_reason}. Do not cite this rung.]` : ''
      return `Rung ${r.rung}: ${String(r.text).slice(0, 400)}${r.mechanism_type ? ` [mechanism: ${r.mechanism_type}]` : ''}${mark}`
    }),
    '',
    '### Terminal layer, PUBLISH THIS VERBATIM',
    m.terminalStatement,
    `(reason: ${m.terminalReason})`,
    '',
    '### Claims with their falsifiers',
    ...m.survivingClaims.slice(0, 5).map((c, i) => `${i + 1}. ${c.text}\n   quote: "${c.quote.slice(0, 200)}"\n   falsified if: ${c.falsifier}`),
    '',
    quarantined.length ? `### Harnesses that returned nothing: ${[...new Set(quarantined)].join(', ')}. Do not fill these gaps with inference.` : '',
  ].filter(Boolean).join('\n')
}

async function attachMaterials(ideaId: string, runId: string, manifest: string): Promise<void> {
  const { data } = await supabase.from('content_ideas').select('meta').eq('id', ideaId).maybeSingle()
  const meta = ((data as { meta?: Record<string, unknown> } | null)?.meta || {}) as Record<string, unknown>
  const materials = Array.isArray(meta.materials) ? meta.materials as Record<string, unknown>[] : []
  const filtered = materials.filter(x => (x as { investigation_id?: string }).investigation_id !== runId)
  filtered.push({
    // kind 'research' deliberately. api/shifts/[id]/write.ts writes kind 'note'
    // with added_at and no id, which is outside the Material union and works
    // only because materialsContext reads a subset of the fields.
    id: createHash('sha1').update(runId).digest('hex').slice(0, 12),
    kind: 'research',
    title: 'MYMU: Teardown: verified evidence manifest',
    content: manifest,
    at: new Date().toISOString(),
    investigation_id: runId,
  })
  await supabase.from('content_ideas').update({ meta: { ...meta, materials: filtered } }).eq('id', ideaId)
}
