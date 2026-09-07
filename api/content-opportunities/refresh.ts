import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardBearerExport } from '../_auth.js'
import { callClaude, corpusForChannel, loadCorpus, loadVoiceBlock, robustJson } from '../_content.js'
import {
  EDITORIAL_RADAR_GENERATOR_REVISION,
  buildEditorialLensSystemPrompt,
  buildEditorialLensUserPrompt,
  editorialSignalHash,
  parseEditorialLensResponse,
  type EditorialSeries,
  type EditorialSignalV2,
} from '../_editorialRadar.js'
import { SYNTHESIS_MODEL } from '../_models.js'
import { supabase } from '../_supabase.js'
import { buildSignalSummary, forbiddenTermsFor, buildProductFor, type BuildMeta } from '../_buildSignals.js'
import { withContentRun } from '../_runs.js'

type JsonRecord = Record<string, unknown>

interface PoolIdeaRow {
  id: string
  idea: string
  thesis: string | null
  source_type: string
  source_url: string | null
  source_captured_at: string | null
  created_at: string
  updated_at: string
  meta: JsonRecord | null
}

const MAX_SIGNALS = 20
const LOOKBACK_HOURS = 96
const REUSE_HOURS = 20
/** The neutral source types the radar judges. A pool headline is the news
 *  corpus; a build signal is one of Krish's own build weeks
 *  (api/discover-build-signals.ts). Both get the same two independent
 *  readings; only the build carries extra rules, see api/_editorialRadar.ts. */
const RADAR_SOURCE_TYPES = ['pool_headline', 'build_signal'] as const
/** Build rows are few and live 21 days (SIGNAL_TTL_DAYS in
 *  api/_buildSignals.ts), so they stay judgeable for longer than a rolling
 *  headline: the Saturday ingest must still be in view for every refresh
 *  until it expires. */
const BUILD_LOOKBACK_HOURS = 24 * 21

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function sourceUrls(row: PoolIdeaRow): string[] {
  const pool = asRecord(asRecord(row.meta).pool)
  const candidates = [row.source_url, ...(Array.isArray(pool.source_urls) ? pool.source_urls : [])]
  return [...new Set(candidates.filter((value): value is string => {
    if (typeof value !== 'string') return false
    try {
      const url = new URL(value)
      return url.protocol === 'https:' || url.protocol === 'http:'
    } catch { return false }
  }))]
}

function buildMetaOf(row: PoolIdeaRow): BuildMeta | null {
  if (row.source_type !== 'build_signal') return null
  const meta = asRecord(row.meta)
  const build = asRecord(meta.build)
  return typeof build.repo === 'string' && typeof build.public_name === 'string' ? build as unknown as BuildMeta : null
}

function toSignal(row: PoolIdeaRow): EditorialSignalV2 {
  const build = buildMetaOf(row)
  if (build) {
    const product = buildProductFor(build.repo)
    const urls = [row.source_url, ...build.prs.map(p => p.url)].filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u))
    return {
      id: row.id,
      title: row.idea,
      summary: buildSignalSummary(build),
      occurred_at: row.source_captured_at || row.created_at,
      source_urls: [...new Set(urls)],
      corroboration: Math.max(1, build.commit_count || 0),
      category: 'mindmake_build',
      build: {
        public_name: product.public_name,
        role: product.role,
        mode: product.mode,
        never_reveal: product.never_reveal,
        forbidden_terms: forbiddenTermsFor(product),
      },
    }
  }
  const pool = asRecord(asRecord(row.meta).pool)
  return {
    id: row.id,
    title: row.idea,
    summary: row.thesis || row.idea,
    occurred_at: row.source_captured_at || row.created_at,
    source_urls: sourceUrls(row),
    corroboration: Number.isFinite(pool.source_count) ? Math.max(0, Math.round(Number(pool.source_count))) : sourceUrls(row).length,
    category: typeof pool.category === 'string' ? pool.category : 'ai_native',
  }
}

function needsRefresh(row: PoolIdeaRow, signal: EditorialSignalV2, now: Date): boolean {
  const radar = asRecord(asRecord(row.meta).editorial_radar)
  if (radar.generator_revision !== EDITORIAL_RADAR_GENERATOR_REVISION) return true
  if (radar.source_hash !== editorialSignalHash(signal)) return true
  const generated = typeof radar.generated_at === 'string' ? Date.parse(radar.generated_at) : Number.NaN
  return !Number.isFinite(generated) || now.getTime() - generated >= REUSE_HOURS * 3_600_000
}

async function runLens(series: EditorialSeries, signals: EditorialSignalV2[], voice: string, corpus: string) {
  const hasBuild = signals.some((signal) => Boolean(signal.build))
  const raw = await callClaude({
    agent: `editorial-radar-${series}`,
    model: SYNTHESIS_MODEL,
    maxTokens: 8000,
    think: true,
    system: buildEditorialLensSystemPrompt(series, voice, corpusForChannel(corpus, series), hasBuild),
    user: buildEditorialLensUserPrompt(signals),
  })
  return parseEditorialLensResponse(robustJson(raw), series, signals)
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardBearerExport(req, res, 'CRON_SECRET', ['GET'])) return
  const now = new Date()
  const since = new Date(now.getTime() - LOOKBACK_HOURS * 3_600_000).toISOString()
  const buildSince = new Date(now.getTime() - BUILD_LOOKBACK_HOURS * 3_600_000).toISOString()
  try {
    // Two reads, not one: a single ordered read capped at N would let a busy
    // news week push last Saturday's build rows past the cap.
    const [headlines, builds] = await Promise.all([
      supabase
        .from('content_ideas')
        .select('id,idea,thesis,source_type,source_url,source_captured_at,created_at,updated_at,meta')
        .eq('source_type', RADAR_SOURCE_TYPES[0])
        .gte('source_captured_at', since)
        .order('source_captured_at', { ascending: false, nullsFirst: false })
        .limit(50),
      supabase
        .from('content_ideas')
        .select('id,idea,thesis,source_type,source_url,source_captured_at,created_at,updated_at,meta')
        .eq('source_type', RADAR_SOURCE_TYPES[1])
        .is('parent_idea_id', null)
        .is('buried_at', null)
        .gte('source_captured_at', buildSince)
        .order('source_captured_at', { ascending: false, nullsFirst: false })
        .limit(16),
    ])
    if (headlines.error) throw new Error(`content_opportunity_read_failed:${headlines.error.message}`)
    if (builds.error) throw new Error(`content_opportunity_read_failed:${builds.error.message}`)

    // Builds first: they are few, owned, and the reason the solo variant exists.
    const rows = [...((builds.data || []) as PoolIdeaRow[]), ...((headlines.data || []) as PoolIdeaRow[])]
    const selected = rows
      .map((row) => ({ row, signal: toSignal(row) }))
      .filter(({ row, signal }) => needsRefresh(row, signal, now))
      .slice(0, MAX_SIGNALS)
    if (!selected.length) return res.status(200).json({ ok: true, refreshed: 0, skipped: rows.length, reason: 'all_current' })

    const signals = selected.map(({ signal }) => signal)
    const [voice, corpus] = await Promise.all([loadVoiceBlock(), loadCorpus()])
    const [money, built] = await Promise.all([
      runLens('money_of_ai', signals, voice, corpus),
      runLens('built_with_ai', signals, voice, corpus),
    ])
    const moneyById = new Map(money.map((item) => [item.signal_id, item]))
    const builtById = new Map(built.map((item) => [item.signal_id, item]))

    let refreshed = 0
    let conflicted = 0
    for (const { row, signal } of selected) {
      const currentMeta = asRecord(row.meta)
      const nextMeta = {
        ...currentMeta,
        editorial_radar: {
          schema_version: 2,
          generator_revision: EDITORIAL_RADAR_GENERATOR_REVISION,
          generated_at: now.toISOString(),
          source_hash: editorialSignalHash(signal),
          lenses: {
            money_of_ai: moneyById.get(signal.id),
            built_with_ai: builtById.get(signal.id),
          },
        },
      }
      const update = await supabase.from('content_ideas').update({ meta: nextMeta }).eq('id', row.id).eq('updated_at', row.updated_at).select('id')
      if (update.error) throw new Error(`content_opportunity_write_failed:${update.error.message}`)
      if ((update.data || []).length === 1) refreshed += 1
      else conflicted += 1
    }

    return res.status(200).json({
      ok: true,
      schema_version: 2,
      generated_at: now.toISOString(),
      considered: rows.length,
      refreshed,
      conflicted,
      eligible: {
        money_of_ai: money.filter((item) => item.status === 'eligible').length,
        built_with_ai: built.filter((item) => item.status === 'eligible').length,
      },
      near_miss: {
        money_of_ai: money.filter((item) => item.status === 'near_miss').length,
        built_with_ai: built.filter((item) => item.status === 'near_miss').length,
      },
    })
  } catch (error) {
    console.error('content opportunity refresh failed', error)
    return res.status(500).json({ ok: false, error: 'content_opportunity_refresh_failed' })
  }
}

// Every run lands in content_engine_runs so the Content tab can say when this
// job last succeeded. See api/_runs.ts.
export default withContentRun('editorial_radar', handler)
