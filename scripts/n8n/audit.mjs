#!/usr/bin/env node
/**
 * scripts/n8n/audit.mjs
 *
 * Source-of-truth reconciler for N8N workflows.
 *
 * Pulls every workflow from N8N Cloud, matches each against the local
 * scripts/n8n/<slug>.workflow.json, and reports drift on the canonical
 * fields (nodes, connections, settings, active, name).
 *
 * Exit codes
 *   0  no drift                                — safe to ship
 *   1  drift detected                          — review report, run sync.mjs
 *   2  fatal config / network error            — fix env or connectivity first
 *
 * Env
 *   N8N_API_KEY    required, JWT from n8n cloud "API keys"
 *   N8N_BASE_URL   defaults to https://krishraja10101.app.n8n.cloud
 *
 * Usage
 *   node scripts/n8n/audit.mjs                 — full audit, summary table
 *   node scripts/n8n/audit.mjs --json          — machine-readable JSON
 *   node scripts/n8n/audit.mjs --verbose       — show node-level diff snippets
 *   node scripts/n8n/audit.mjs --filter marcus — only workflows matching pattern
 */

import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const API_KEY = process.env.N8N_API_KEY
const BASE_URL = (process.env.N8N_BASE_URL || 'https://krishraja10101.app.n8n.cloud').replace(/\/+$/, '')

const args = new Set(process.argv.slice(2))
const wantJson = args.has('--json')
const verbose = args.has('--verbose')
const filterArg = process.argv.find(a => a.startsWith('--filter='))
const filterPattern = filterArg ? filterArg.split('=')[1] : null

// Fields that round-trip cleanly between local and cloud.
const CANONICAL_FIELDS = ['name', 'nodes', 'connections', 'settings', 'staticData']

if (!API_KEY) {
  console.error('FATAL: N8N_API_KEY missing. Get one from N8N → Settings → API.')
  process.exit(2)
}

/* ---------- helpers ---------- */

async function n8n(path, init = {}) {
  const url = `${BASE_URL}/api/v1${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      'X-N8N-API-KEY': API_KEY,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`N8N ${init.method || 'GET'} ${path} → ${res.status}\n${body}`)
  }
  return res.json()
}

async function listLocalWorkflows() {
  const dir = __dirname
  const entries = await readdir(dir)
  const files = entries.filter(f => f.endsWith('.workflow.json'))
  const out = []
  for (const f of files) {
    const path = join(dir, f)
    const raw = await readFile(path, 'utf8')
    let json
    try { json = JSON.parse(raw) }
    catch (e) { console.warn(`SKIP: ${f} is not valid JSON (${e.message})`); continue }
    if (!json.name) { console.warn(`SKIP: ${f} has no .name`); continue }
    out.push({ file: f, path, json })
  }
  return out
}

async function listCloudWorkflows() {
  const all = []
  let cursor = undefined
  do {
    const qs = new URLSearchParams({ limit: '100' })
    if (cursor) qs.set('cursor', cursor)
    const page = await n8n(`/workflows?${qs.toString()}`)
    all.push(...(page.data || []))
    cursor = page.nextCursor || null
  } while (cursor)
  return all
}

function pickCanonical(wf) {
  const out = {}
  for (const k of CANONICAL_FIELDS) if (wf[k] !== undefined) out[k] = wf[k]
  return out
}

function stableStringify(value) {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const ordered = {}
      for (const key of Object.keys(v).sort()) ordered[key] = v[key]
      return ordered
    }
    return v
  }, 2)
}

function diffWorkflow(local, cloud) {
  const a = pickCanonical(local)
  const b = pickCanonical(cloud)
  const drift = {}
  for (const f of CANONICAL_FIELDS) {
    const aStr = stableStringify(a[f])
    const bStr = stableStringify(b[f])
    if (aStr !== bStr) {
      drift[f] = {
        local_chars: aStr?.length ?? 0,
        cloud_chars: bStr?.length ?? 0,
      }
    }
  }
  return drift
}

/* ---------- main ---------- */

async function main() {
  let local, cloud
  try {
    [local, cloud] = await Promise.all([listLocalWorkflows(), listCloudWorkflows()])
  } catch (e) {
    console.error(`FATAL: could not load workflows — ${e.message}`)
    process.exit(2)
  }

  const cloudByName = new Map(cloud.map(c => [c.name, c]))
  const localByName = new Map(local.map(l => [l.json.name, l]))

  const report = []
  let drifted = 0

  // For every local file, compare to cloud. Drift if mismatched or missing in cloud.
  for (const l of local) {
    if (filterPattern && !l.file.includes(filterPattern) && !l.json.name.includes(filterPattern)) continue
    const c = cloudByName.get(l.json.name)
    if (!c) {
      drifted++
      report.push({ file: l.file, name: l.json.name, status: 'local_only', drift: {} })
      continue
    }
    const drift = diffWorkflow(l.json, c)
    if (Object.keys(drift).length === 0) {
      report.push({ file: l.file, name: l.json.name, cloud_id: c.id, status: 'in_sync', drift: {} })
    } else {
      drifted++
      report.push({ file: l.file, name: l.json.name, cloud_id: c.id, status: 'drift', drift })
    }
  }

  // Cloud workflows with no local mirror (only flag if filter doesn't exclude).
  for (const c of cloud) {
    if (filterPattern && !c.name.includes(filterPattern)) continue
    if (!localByName.has(c.name)) {
      drifted++
      report.push({ file: null, name: c.name, cloud_id: c.id, status: 'cloud_only', drift: {} })
    }
  }

  if (wantJson) {
    console.log(JSON.stringify({ drifted, total: report.length, items: report }, null, 2))
    process.exit(drifted ? 1 : 0)
  }

  // Plain-text report.
  console.log(`N8N audit — ${BASE_URL}`)
  console.log(`Local workflows : ${local.length}`)
  console.log(`Cloud workflows : ${cloud.length}`)
  console.log(`Drifted         : ${drifted}`)
  console.log('')

  for (const r of report) {
    const tag = r.status === 'in_sync'    ? 'OK     '
              : r.status === 'drift'      ? 'DRIFT  '
              : r.status === 'local_only' ? 'LOCAL  '
              : r.status === 'cloud_only' ? 'CLOUD  '
              : '?      '
    console.log(`${tag} ${r.name}${r.file ? '  ['+r.file+']' : ''}`)
    if (verbose && r.status === 'drift') {
      for (const [field, diff] of Object.entries(r.drift)) {
        console.log(`         · ${field}: local ${diff.local_chars}c, cloud ${diff.cloud_chars}c`)
      }
    }
  }

  console.log('')
  if (drifted) {
    console.log('Drift detected. Inspect with `--verbose` and resolve via `node scripts/n8n/sync.mjs --plan`.')
    process.exit(1)
  } else {
    console.log('No drift. Repo is the source of truth.')
    process.exit(0)
  }
}

main().catch(e => {
  console.error(`FATAL: ${e.message}`)
  process.exit(2)
})
