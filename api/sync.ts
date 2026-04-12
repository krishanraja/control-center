import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * POST /api/sync
 *
 * Accepts the canonical tasks.json payload pushed by the workspace sync pipeline
 * (N8N webhook, git post-commit hook, or manual trigger).
 *
 * Body schema:
 * {
 *   "tasks": [...],          // full task array from workspace tasks.json
 *   "updated_at": "ISO8601", // timestamp of the workspace snapshot
 *   "agent_states": {        // optional per-agent metadata
 *     "Arlo": { "status": "active", ... },
 *     "Vera": { ... },
 *     ...
 *   }
 * }
 *
 * Response:
 * { "ok": true, "received_tasks": <count>, "ts": "ISO8601" }
 */

const SYNC_CACHE_PATH = join(process.cwd(), 'public', 'data', 'sync-cache.json')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Secret',
  'Cache-Control': 'no-store',
}

// Optional lightweight secret — set SYNC_SECRET env var in Vercel to enable.
// If not set, endpoint is open (same as other api/ routes).
function isAuthorized(req: VercelRequest): boolean {
  const secret = process.env.SYNC_SECRET
  if (!secret) return true
  const provided = req.headers['x-sync-secret']
  return provided === secret
}

function readCache(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(SYNC_CACHE_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function writeCache(payload: Record<string, unknown>): void {
  try {
    writeFileSync(SYNC_CACHE_PATH, JSON.stringify(payload, null, 2))
  } catch {
    // Vercel serverless has a read-only FS at runtime — silently skip.
  }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Apply CORS headers on every response
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v))

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized — invalid X-Sync-Secret' })
  }

  const body = req.body || {}

  // --- Validate shape ---
  if (!Array.isArray(body.tasks)) {
    return res.status(400).json({
      error: 'Invalid payload: "tasks" must be an array.',
      received_keys: Object.keys(body),
    })
  }

  if (!body.updated_at || typeof body.updated_at !== 'string') {
    return res.status(400).json({
      error: 'Invalid payload: "updated_at" (ISO8601 string) is required.',
    })
  }

  // --- Build normalised snapshot ---
  const ts = new Date().toISOString()
  const snapshot = {
    tasks: body.tasks,
    updated_at: body.updated_at,
    agent_states: body.agent_states || {},
    synced_at: ts,
    task_count: (body.tasks as unknown[]).length,
    // Derived quick-access slices (for UI consumption without full parse)
    by_status: groupByStatus(body.tasks),
    by_agent: groupByAgent(body.tasks),
  }

  // Persist to public/data/sync-cache.json (available as static JSON to the SPA)
  writeCache(snapshot)

  console.log(`[sync] ✅ Received ${snapshot.task_count} tasks @ ${ts}`)

  return res.status(200).json({
    ok: true,
    received_tasks: snapshot.task_count,
    ts,
  })
}

// --- Helpers ---

type Task = {
  status?: string
  agent?: string
  [key: string]: unknown
}

function groupByStatus(tasks: Task[]): Record<string, number> {
  return tasks.reduce<Record<string, number>>((acc, t) => {
    const s = t.status || 'unknown'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})
}

function groupByAgent(tasks: Task[]): Record<string, number> {
  return tasks.reduce<Record<string, number>>((acc, t) => {
    const a = t.agent || 'unassigned'
    acc[a] = (acc[a] || 0) + 1
    return acc
  }, {})
}
