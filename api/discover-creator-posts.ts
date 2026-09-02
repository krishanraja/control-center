import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from './_auth.js'
import { supabase } from './_supabase.js'
import { runActor } from './_apify.js'
import { isOnDirection } from './_judgmentLens.js'
import { loadScrapeableCreators, markScraped } from './_creators.js'
import { extractCreatorMoves, type CreatorPost, type CreatorMove } from './_creatorMoves.js'
import { checkDuplicate } from './_dedup.js'
import { canonicalUrl } from './_text.js'
import { onTeardownBeat } from './_beat.js'
import { loadConfig } from './_content.js'

// discover-creator-posts: the creator scout.
//
// Weekly (Tue 08:00 UTC, vercel.json) it pulls each scrapeable curated
// creator's recent LinkedIn posts via the shared Apify client, extracts the
// transferable MOVE per post (_creatorMoves.ts), and writes at most
// MAX_INSERTS gated rows into content_ideas as source_type 'creator_move'.
// This ships the enrichment the discover-lens-radar header planned (Apify
// profile posts behind the same gate + dedup posture), but as a PUSH into the
// backlog rather than rail candidates: Krish chose proactive suggestions
// (2026-09-02), so the anti-flood duty moves into hard caps here.
//
// Anti-flood, in order: the open-card governor (skip the run when >=
// OPEN_GOVERNOR live creator_move cards are still undecided), per-run insert
// cap, brand-fit + beat + novelty gates, the partial unique index on live
// source_url (re-runs cannot duplicate), and the triage deck downstream.
//
// Honest-by-construction like the radar: every gate is counted in the
// response, an all-degraded Apify pass is surfaced (these actors exit 0 with
// an empty dataset when the input shape is wrong, so a quiet zero is never
// trusted), and every run writes one audit_log row.
//
//   GET  (CRON_SECRET)      scheduled run
//   POST (secret or app)    manual run
//   ?dry=1                  full pipeline, no writes (no inserts, no
//                           markScraped, no audit row)
//   ?creators=N&posts=N     clamped overrides for a cheap first live run

const MAX_CREATORS = 5
const MAX_POSTS_PER_CREATOR = 5
const MAX_EXTRACT = 12
const MAX_INSERTS = 3
const OPEN_GOVERNOR = 6
const FRESH_DAYS = 30
const FIT_THRESHOLD = 0.2 // permissive: creators are pre-curated, the gate only drops clearly off-direction posts
const CHARGE_CAP_USD = 0.25 // per creator run; ~25x the expected pay-per-result cost of 5 posts
const SCRAPE_DEADLINE_MS = 150_000 // leave the rest of maxDuration for extraction + inserts

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function postUrl(item: Record<string, unknown>): string {
  return str(item.postUrl) || str(item.url) || str(item.linkedinUrl) || str(item.link) || str(item.postLink) || str(item.shareUrl)
}

function postText(item: Record<string, unknown>): string {
  return str(item.text) || str(item.content) || str(item.postText) || str(item.commentary) || str(item.description)
}

function postDate(item: Record<string, unknown>): string | null {
  const nested = item.postedAt as Record<string, unknown> | undefined
  const raw = str(item.postedAt) || str(nested && typeof nested === 'object' ? nested.date : '')
    || str(item.publishedAt) || str(item.date) || str(item.postedDate) || str(item.postedAtISO)
  if (!raw || Number.isNaN(Date.parse(raw))) return null
  return new Date(raw).toISOString()
}

const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] || 0) + 1 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return
  const started = Date.now()
  const dry = req.query.dry === '1'
  const clamp = (v: unknown, lo: number, hi: number, dflt: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt
  }
  const maxCreators = clamp(req.query.creators, 1, MAX_CREATORS, MAX_CREATORS)
  const maxPosts = clamp(req.query.posts, 1, MAX_POSTS_PER_CREATOR, MAX_POSTS_PER_CREATOR)

  try {
    // Open-card governor first: no scrape spend and no model spend while Krish
    // already has a deck of undecided creator moves.
    const { count: open } = await supabase
      .from('content_ideas')
      .select('id', { count: 'exact', head: true })
      .eq('source_type', 'creator_move')
      .in('state', ['seeded', 'researching'])
      .is('buried_at', null)
      .is('parent_idea_id', null)
    if (!dry && (open ?? 0) >= OPEN_GOVERNOR) {
      return res.json({ ok: true, skipped: 'backlog_governor', open })
    }

    const creators = await loadScrapeableCreators(maxCreators)
    if (!creators.length) {
      return res.json({ ok: true, skipped: 'no scrapeable creators (active with a verified linkedin_slug)', open })
    }

    // ── Scrape ──────────────────────────────────────────────────────────────
    const gated: Record<string, number> = {}
    const tried: { creator: string; note: string }[] = []
    const candidates: CreatorPost[] = []
    let creatorsScraped = 0
    let postsFetched = 0
    let anyOk = false

    for (const creator of creators) {
      if (Date.now() - started > SCRAPE_DEADLINE_MS) {
        tried.push({ creator: creator.slug, note: 'skipped: scrape deadline reached' })
        continue
      }
      const profileUrl = creator.linkedin_url || `https://www.linkedin.com/in/${creator.linkedin_slug}`
      const run = await runActor({
        taskCategory: 'linkedin_profile_posts',
        fallbackSlugs: ['harvestapi/linkedin-profile-posts'],
        // The registry's required_input_shape wins when present (each actor has
        // its own schema and a wrong key exits 0 with an empty dataset). The
        // fallback matches harvestapi/linkedin-profile-posts, verified against
        // its published input schema on 2026-09-02.
        buildInput: (_slug, shape) => {
          if (shape && typeof shape === 'object') {
            const key = Object.keys(shape).find(k => /target|profile|url|link/i.test(k))
            if (key) return { [key]: [profileUrl] }
          }
          return {
            targetUrls: [profileUrl],
            maxPosts,
            postedLimit: 'month',
            includeReposts: false,
            includeQuotePosts: false,
            scrapeReactions: false,
            scrapeComments: false,
          }
        },
        timeoutSec: 45,
        maxItems: maxPosts,
        maxTotalChargeUsd: CHARGE_CAP_USD,
        maxAttempts: 2,
        source: 'creator-scout',
      })
      creatorsScraped++
      tried.push({ creator: creator.slug, note: run.tried.map(t => `${t.slug} ${t.note}`).join('; ') || run.outcome.status })
      if (run.outcome.status === 'skipped_no_key') {
        return res.json({ ok: true, skipped: 'no APIFY_TOKEN (skipped_no_key)', open, tried })
      }
      if (run.outcome.status === 'ok') anyOk = true

      let newestUrl: string | null = null
      let newestAt: string | null = null
      for (const raw of run.items.slice(0, maxPosts)) {
        const item = (raw || {}) as Record<string, unknown>
        const url = postUrl(item)
        const text = postText(item)
        const at = postDate(item)
        postsFetched++
        if (!url) { bump(gated, 'no_url'); continue } // CLO-005/006: no source_url, no idea
        if (!newestAt || (at && at > newestAt)) { newestAt = at; newestUrl = url }
        if (at && Date.parse(at) < Date.now() - FRESH_DAYS * 86_400_000) { bump(gated, 'stale'); continue }
        if (!text || text.length < 80) { bump(gated, 'no_text'); continue }
        if (url === creator.last_post_url) { bump(gated, 'already_seen'); continue }
        if (!isOnDirection(text, FIT_THRESHOLD)) { bump(gated, 'off_direction'); continue }
        candidates.push({ url, text, postedAt: at, creator })
      }
      if (!dry) {
        await markScraped(creator.slug, { lastPostUrl: newestUrl, lastPostAt: newestAt, postsFetched: run.items.length })
      }
    }

    // Batch pre-dedup against rows any lane already ingested for these URLs,
    // before spending model tokens on them.
    let fresh = candidates
    if (candidates.length) {
      const urls = [...new Set(candidates.flatMap(c => [c.url, canonicalUrl(c.url) || ''].filter(Boolean)))]
      const { data: existing } = await supabase
        .from('content_ideas')
        .select('source_url')
        .in('source_url', urls)
        .limit(500)
      const seen = new Set((existing || []).map(r => r.source_url).filter(Boolean))
      fresh = candidates.filter(c => {
        const dup = seen.has(c.url) || seen.has(canonicalUrl(c.url) || '')
        if (dup) bump(gated, 'duplicate_url')
        return !dup
      })
    }

    const degradedNote = !anyOk && creatorsScraped > 0
      ? 'every actor attempt degraded; a wrong input shape and a quiet profile are indistinguishable, check tried[]'
      : null

    if (!fresh.length) {
      if (!dry) await audit({ open, creatorsScraped, postsFetched, gated, extracted: 0, written: 0, degradedNote })
      return res.json({ ok: true, open, creators_scraped: creatorsScraped, posts_fetched: postsFetched, gated, extracted: 0, written: 0, tried, ...(degradedNote ? { degraded: degradedNote } : {}) })
    }

    // ── Extract moves ───────────────────────────────────────────────────────
    const [{ data: pillarRows }, { data: angleRows }, config] = await Promise.all([
      supabase.from('content_pillars').select('id, name, description').eq('active', true),
      supabase.from('content_ideas').select('idea')
        .gte('created_at', new Date(Date.now() - 60 * 86_400_000).toISOString())
        .order('created_at', { ascending: false })
        .limit(120),
      loadConfig(['creator_move_min_brand_fit', 'cleo_inspiration_min_brand_fit']),
    ])
    const minBrandFit = Number(config['creator_move_min_brand_fit'])
      || Number(config['cleo_inspiration_min_brand_fit']) || 6

    const moves = await extractCreatorMoves(fresh.slice(0, MAX_EXTRACT), {
      pillars: (pillarRows || []) as { id: string; name: string; description: string }[],
      recentAngles: ((angleRows || []) as { idea: string | null }[]).map(r => r.idea || '').filter(Boolean),
      minBrandFit,
    })

    // ── Gate the model output in code (prompt rules are not enforcement) ────
    const dropped: Record<string, number> = {}
    const keep: { m: CreatorMove; post: CreatorPost; keys: Awaited<ReturnType<typeof checkDuplicate>>['keys'] }[] = []
    for (const m of moves) {
      const post = fresh.find(p => p.url === m.post_url)
      if (!post) { bump(dropped, 'unanchored'); continue }
      if (!m.is_move) { bump(dropped, m.rejection_reason || 'not_move'); continue }
      if (!m.idea || !m.thesis || !m.krish_angle) { bump(dropped, 'incomplete'); continue }
      if ((m.brand_fit_score ?? 0) < minBrandFit) { bump(dropped, 'low_fit'); continue }
      if (m.confidence != null && m.confidence < 0.5) { bump(dropped, 'low_confidence'); continue } // the capture contract: confidence >= 0.5 to insert
      if (!m.lane_slot) { bump(dropped, 'off_channel'); continue }
      if (m.lane_slot === 'money_of_ai' && !onTeardownBeat(m.idea, m.thesis)) { bump(dropped, 'off_beat'); continue }
      const dup = await checkDuplicate('content_ideas', { url: m.post_url, title: m.idea, text: `${m.thesis} ${m.krish_angle}` })
      if (dup.is_duplicate) { bump(dropped, 'duplicate_angle'); continue }
      keep.push({ m, post, keys: dup.keys })
    }
    keep.sort((a, b) => (b.m.brand_fit_score ?? 0) - (a.m.brand_fit_score ?? 0))
    const winners = keep.slice(0, MAX_INSERTS)

    if (dry) {
      return res.json({
        ok: true, dryRun: true, open, creators_scraped: creatorsScraped, posts_fetched: postsFetched,
        gated, extracted: moves.length, dropped, would_write: winners.length,
        sample: winners.map(w => ({ idea: w.m.idea, creator: w.m.creator_slug, fit: w.m.brand_fit_score, lane_slot: w.m.lane_slot, url: w.m.post_url })),
        tried, ...(degradedNote ? { degraded: degradedNote } : {}),
      })
    }

    // ── Insert (per row, so one unique-index conflict cannot void the batch) ─
    let written = 0
    for (const { m, post, keys } of winners) {
      const fit = m.brand_fit_score ?? minBrandFit
      const temporal = m.temporal_class || 'developing'
      const state = fit >= 9 ? 'researching' : 'seeded'
      const days = temporal === 'durable' ? null
        : Math.min(90, Math.max(3, m.expires_in_days ?? (temporal === 'ephemeral' ? 10 : 30)))
      const { error } = await supabase.from('content_ideas').insert({
        idea: m.idea,
        thesis: m.thesis,
        distribution: m.distribution,
        confidence: m.confidence ?? 0.8,
        quality_score: 'amber',
        brand_fit_score: fit,
        source_type: 'creator_move',
        source_ref: `creator:${m.creator_slug}`,
        source_url: m.post_url,
        source_snippet: post.text.slice(0, 400),
        source_captured_at: new Date().toISOString(),
        state,
        assigned_to: 'cleo',
        origin: 'agent',
        lane: 'publication',
        lane_slot: m.lane_slot,
        pillar_id: m.pillar_id,
        horizon: temporal === 'durable' ? 'evergreen' : 'news',
        expires_at: state === 'seeded' && days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
        canonical_url: keys.canonical_url,
        title_norm: keys.title_norm,
        content_hash: keys.content_hash,
        meta: {
          poster_name: post.creator.name,
          poster_handle: post.creator.linkedin_slug,
          creator_slug: m.creator_slug,
          move: m.move,
          why_it_works: m.why_it_works,
          krish_angle: m.krish_angle,
          temporal_class: temporal,
          source_label: post.creator.name,
          generated_by: 'creator_scout',
        },
      })
      if (!error) written++
      else if (error.code === '23505') bump(dropped, 'duplicate_race')
      else throw new Error(error.message)
    }

    await audit({ open, creatorsScraped, postsFetched, gated, extracted: moves.length, dropped, written, degradedNote })
    return res.json({
      ok: true, open, creators_scraped: creatorsScraped, posts_fetched: postsFetched,
      gated, extracted: moves.length, dropped, written, tried,
      ...(degradedNote ? { degraded: degradedNote } : {}),
    })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : 'creator scout failed' })
  }
}

async function audit(details: Record<string, unknown>): Promise<void> {
  try {
    await supabase.from('audit_log').insert({
      event_type: 'creator_scout_run',
      actor: 'system',
      details: JSON.stringify(details),
    })
  } catch { /* the run result must not depend on the audit write */ }
}

export const config = { maxDuration: 300 }
