import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runInvestigation, type RunOpts } from '../_investigation.js'
import type { HarnessName } from '../_harness.js'

// The Mindmaker LIVE weekly investigation.
//
//   GET  (CRON_SECRET), Thu 21:00 UTC, after Thursday's anchor is fresh
//   POST (CRON_SECRET), manual, same guard
//
// AUTH ON BOTH VERBS, deliberately. api/feed/ingest, api/shifts/detect,
// api/briefs/assemble and api/purge/run all gate GET only, and their POST
// branch is completely open; middleware.ts matcher `['/((?!api/).*)']` does not
// cover /api/*. This route spends Anthropic and Perplexity credits, so it
// follows api/growth/geo-probe.ts and proves the credential on both paths.
//
// x-vercel-cron is NOT stripped by Vercel on inbound external requests
// (verified 2026-08-05: a spoofed header returned 200 and ran the job), so it
// authenticates nothing and is not consulted here.

function authorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET || ''
  const auth = req.headers.authorization || ''
  return Boolean(secret) && auth === `Bearer ${secret}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    if (req.method === 'GET') {
      if (!authorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' })
      const result = await runInvestigation({ dryRun: req.query.dry_run === '1' })
      return res.json(result)
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'GET (cron) or POST only' })
    if (!authorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' })

    const body = (req.body || {}) as {
      action?: string
      dry_run?: boolean
      is_test?: boolean
      anchor_id?: string
      disabled_harnesses?: string[]
      max_model_calls?: number
      max_search_calls?: number
      max_fetches?: number
    }
    if (body.action !== 'run') return res.status(400).json({ ok: false, error: "action must be 'run'" })

    const opts: RunOpts = {
      dryRun: Boolean(body.dry_run),
      isTest: Boolean(body.is_test),
      anchorId: body.anchor_id,
      disabledHarnesses: (body.disabled_harnesses || []) as HarnessName[],
      maxModelCalls: body.max_model_calls,
      maxSearchCalls: body.max_search_calls,
      maxFetches: body.max_fetches,
    }
    const result = await runInvestigation(opts)
    return res.json(result)
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e as Error)?.message || e) })
  }
}

export const config = { maxDuration: 300 }
