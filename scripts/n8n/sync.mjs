#!/usr/bin/env node
/**
 * scripts/n8n/sync.mjs
 *
 * One-way sync: scripts/n8n/*.workflow.json → N8N Cloud.
 *
 * Repo is the source of truth. Drift exists because hot-fixes happen in the
 * cloud editor; this script makes the cloud match git after a PR lands.
 *
 * Modes
 *   --plan          dry-run, prints what *would* change (default)
 *   --apply         actually push canonical fields to cloud
 *   --filter=foo    limit to files/workflow names matching substring
 *   --create-missing  create workflows in cloud for local-only files
 *
 * Env
 *   N8N_API_KEY    required
 *   N8N_BASE_URL   defaults to https://krishraja10101.app.n8n.cloud
 *
 * Reverse direction (cloud → repo) is intentionally not automated.
 * If the cloud has the right version, export it manually, open a PR.
 */

import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const API_KEY = process.env.N8N_API_KEY
const BASE_URL = (process.env.N8N_BASE_URL || 'https://krishraja10101.app.n8n.cloud').replace(/\/+$/, '')

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const createMissing = args.has('--create-missing')
const filterArg = process.argv.find(a => a.startsWith('--filter='))
const filterPattern = filterArg ? filterArg.split('=')[1] : null

const CANONICAL_FIELDS = ['name', 'nodes', 'connections', 'settings', 'staticData']

if (!API_KEY) {
  console.error('FATAL: N8N_API_KEY missing.')
  process.exit(2)
}

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
    try { json = JSON.parse(raw) } catch { continue }
    if (!json.name) continue
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

// N8N's cloud editor adds internal-only settings keys that the public API's
// PUT/POST schema rejects with `additionalProperties` validation errors.
// Strip them defensively so canonical files can be exported from the editor
// without manually pruning every time.
const SETTINGS_DENYLIST = new Set(['availableInMCP', 'binaryMode', 'timeSavedMode'])

function buildPayload(local) {
  // N8N PUT/POST accepts only canonical fields. `active` cannot be toggled
  // through the workflow body — there is a separate /activate endpoint.
  const payload = {}
  for (const f of CANONICAL_FIELDS) if (local[f] !== undefined) payload[f] = local[f]
  if (payload.settings && typeof payload.settings === 'object') {
    const cleaned = {}
    for (const [k, v] of Object.entries(payload.settings)) {
      if (!SETTINGS_DENYLIST.has(k)) cleaned[k] = v
    }
    payload.settings = cleaned
  }
  return payload
}

function summary(target, action) {
  const tag =
    action === 'create' ? 'CREATE ' :
    action === 'update' ? 'UPDATE ' :
    action === 'skip'   ? 'SKIP   ' : '?      '
  return `${tag} ${target}`
}

async function main() {
  const [local, cloud] = await Promise.all([listLocalWorkflows(), listCloudWorkflows()])
  const cloudByName = new Map(cloud.map(c => [c.name, c]))

  const plan = []
  for (const l of local) {
    if (filterPattern && !l.file.includes(filterPattern) && !l.json.name.includes(filterPattern)) continue
    const existing = cloudByName.get(l.json.name)
    if (!existing) {
      plan.push({ action: createMissing ? 'create' : 'skip', file: l.file, name: l.json.name, reason: createMissing ? 'local-only, will create' : 'local-only, pass --create-missing to push' })
    } else {
      plan.push({ action: 'update', file: l.file, name: l.json.name, cloud_id: existing.id })
    }
  }

  console.log(`N8N sync ${apply ? '— APPLYING' : '— PLAN ONLY'}`)
  console.log(`Target          : ${BASE_URL}`)
  console.log(`Local workflows : ${local.length}`)
  console.log(`Cloud workflows : ${cloud.length}`)
  console.log('')

  for (const p of plan) {
    console.log(summary(p.name + (p.file ? '  ['+p.file+']' : ''), p.action) + (p.reason ? `  — ${p.reason}` : ''))
  }
  console.log('')

  if (!apply) {
    console.log('Plan only. Re-run with `--apply` to push to cloud.')
    return
  }

  let pushed = 0, created = 0, failed = 0
  for (const p of plan) {
    if (p.action === 'skip') continue
    const localFile = local.find(l => l.json.name === p.name)
    if (!localFile) continue
    const payload = buildPayload(localFile.json)
    try {
      if (p.action === 'create') {
        await n8n('/workflows', { method: 'POST', body: JSON.stringify(payload) })
        created++
        console.log(`  + created ${p.name}`)
      } else if (p.action === 'update') {
        await n8n(`/workflows/${p.cloud_id}`, { method: 'PUT', body: JSON.stringify(payload) })
        pushed++
        console.log(`  ↻ updated ${p.name}`)
      }
    } catch (e) {
      failed++
      const lines = e.message.split('\n')
      console.error(`  ! failed ${p.name}: ${lines[0]}`)
      if (lines.length > 1) console.error(`    ${lines.slice(1).join('\n    ').slice(0, 800)}`)
    }
  }

  console.log('')
  console.log(`Updated: ${pushed}, Created: ${created}, Failed: ${failed}`)
  if (failed) process.exit(1)
}

main().catch(e => {
  console.error(`FATAL: ${e.message}`)
  process.exit(2)
})
