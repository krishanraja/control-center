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

type JsonRecord = Record<string, unknown>

interface PoolIdeaRow {
  id: string
  idea: string
  thesis: string | null
  source_url: string | null
  source_captured_at: string | null
  created_at: string
  updated_at: string
  meta: JsonRecord | null
}

const MAX_SIGNALS = 20
const LOOKBACK_HOURS = 96
const REUSE_HOURS = 20

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

function toSignal(row: PoolIdeaRow): EditorialSignalV2 {
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
  const raw = await callClaude({
    agent: `editorial-radar-${series}`,
    model: SYNTHESIS_MODEL,
    maxTokens: 8000,
    think: true,
    system: buildEditorialLensSystemPrompt(series, voice, corpusForChannel(corpus, series)),
    user: buildEditorialLensUserPrompt(signals),
  })
  return parseEditorialLensResponse(robustJson(raw), series, signals)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardBearerExport(req, res, 'CRON_SECRET', ['GET'])) return
  const now = new Date()
  const since = new Date(now.getTime() - LOOKBACK_HOURS * 3_600_000).toISOString()
  try {
    const { data, error } = await supabase
      .from('content_ideas')
      .select('id,idea,thesis,source_url,source_captured_at,created_at,updated_at,meta')
      .eq('source_type', 'pool_headline')
      .gte('source_captured_at', since)
      .order('source_captured_at', { ascending: false, nullsFirst: false })
      .limit(50)
    if (error) throw new Error(`content_opportunity_read_failed:${error.message}`)

    const rows = (data || []) as PoolIdeaRow[]
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

