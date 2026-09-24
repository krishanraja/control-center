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
import { redactKnown, unresolvedPlaceholders, residualSecrets } from './secrets.mjs'

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
    // Archived workflows cannot execute and are not source-of-truth. Including
    // them made every retired workflow report as cloud_only drift forever.
    all.push(...(page.data || []).filter(w => !w.isArchived))
    cursor = page.nextCursor || null
  } while (cursor)
  return all
}

/**
 * Fields n8n owns, that a comparison must not treat as disagreement.
 *
 * Measured 2026-09-24: the audit reported 53 of 106 mirrors as drifted. After
 * redaction and after ignoring these, 14 genuinely differed. The other 39 were
 * noise, and the noise is what hid the four that mattered — among them a
 * two-hourly cron running claude-opus-5 that the mirror had retired twelve days
 * earlier.
 *
 * `id` is regenerated per environment. `position` changes when anyone drags a
 * node on the canvas. `typeVersion` steps when n8n auto-upgrades a node.
 * `webhookId` is assigned by the runtime. `credentials` binds to cloud-side
 * credential records, and scripts/n8n/README.md already documents that the
 * mirror's copy is not authoritative.
 *
 * NOTE `typeVersion` and `credentials` ARE pushed by sync.mjs even though they
 * are ignored here. That asymmetry is deliberate but sharp: ignoring in the
 * comparison what you overwrite in the push means a push can change them
 * silently. It is recorded rather than hidden, and it is why --no-static-data
 * exists on the push side and why a pre-push diff is still required.
 */
const VOLATILE_NODE_FIELDS = new Set(['id', 'position', 'typeVersion', 'webhookId', 'credentials'])

/**
 * Settings sync.mjs strips before it pushes.
 *
 * Comparing them here was unresolvable by construction: 87 of 106 mirrors carry
 * at least one, so a successful push still left permanent `settings` drift and
 * "prove the audit reports zero drift for this file" could never be satisfied.
 * That gate is the precedent's whole reconciliation rule, so a guard that makes
 * it unreachable is worse than one that does not check settings at all.
 */
const SETTINGS_DENYLIST = new Set(['availableInMCP', 'binaryMode', 'timeSavedMode'])

function normaliseNodes(nodes) {
  if (!Array.isArray(nodes)) return nodes
  // Sorted by name, because stableStringify orders object KEYS and leaves array
  // order alone: a cloud-side reorder of the nodes array otherwise reads as
  // total drift on a workflow where nothing changed.
  return [...nodes]
    .map(n => {
      const out = {}
      for (const k of Object.keys(n)) if (!VOLATILE_NODE_FIELDS.has(k)) out[k] = n[k]
      return out
    })
    .sort((x, y) => String(x.name).localeCompare(String(y.name)))
}

function pickCanonical(wf) {
  const out = {}
  for (const k of CANONICAL_FIELDS) if (wf[k] !== undefined) out[k] = wf[k]
  if (out.nodes) out.nodes = normaliseNodes(out.nodes)
  if (out.settings) {
    const s = {}
    for (const k of Object.keys(out.settings)) if (!SETTINGS_DENYLIST.has(k)) s[k] = out.settings[k]
    out.settings = s
  }
  // staticData is runtime state, not definition: n8n writes schedule-trigger
  // cursors into it on every run, so including it made `in_sync` time-varying
  // for the 55 mirrors that carry it. Reported separately instead (below).
  delete out.staticData
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

/** The first `n` differing lines between two stringified fields, as a real diff. */
function lineDiff(aStr, bStr, limit = 12) {
  const a = (aStr || '').split('\n')
  const b = (bStr || '').split('\n')
  const out = []
  for (let i = 0; i < Math.max(a.length, b.length) && out.length < limit; i++) {
    if (a[i] === b[i]) continue
    if (a[i] !== undefined) out.push(`- ${a[i].trim().slice(0, 200)}`)
    if (b[i] !== undefined) out.push(`+ ${b[i].trim().slice(0, 200)}`)
  }
  return out
}

function diffWorkflow(local, cloud) {
  const a = pickCanonical(local)
  // The cloud copy carries real credentials where the mirror carries
  // placeholders. Redacting the cloud side before the compare is what keeps a
  // scrubbed file from reporting permanent, unresolvable drift on every run.
  const b = pickCanonical(redactKnown(cloud))
  const drift = {}
  for (const f of CANONICAL_FIELDS) {
    if (f === 'staticData') continue
    const aStr = stableStringify(a[f])
    const bStr = stableStringify(b[f])
    if (aStr !== bStr) {
      drift[f] = {
        local_chars: aStr?.length ?? 0,
        cloud_chars: bStr?.length ?? 0,
        // Character counts say a thing changed and never what. That is why 53
        // reported items went unexamined for twelve days while four of them
        // were a live model regression.
        lines: lineDiff(aStr, bStr),
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
  let unresolved = 0

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
      continue
    }
    // A mirror whose placeholders could not be resolved has not been COMPARED,
    // so it must not be reported as different. redactKnown drops an unset pair
    // silently; without this the missing variable shows up as a wall of drift
    // and the real findings hide inside it.
    // Two independent reasons a comparison cannot be trusted: a variable we were
    // never given, and a variable we were given that does not match what cloud
    // actually holds. The second one is invisible to the first check and was
    // the larger cause in practice.
    const missing = unresolvedPlaceholders(l.json)
    const residual = residualSecrets(redactKnown(c))
    if (missing.length || residual.length) {
      unresolved++
      report.push({
        file: l.file, name: l.json.name, cloud_id: c.id, status: 'unresolved',
        missing_env: missing, residual_secrets: residual, drift,
      })
      continue
    }
    drifted++
    report.push({ file: l.file, name: l.json.name, cloud_id: c.id, status: 'drift', drift })
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
    console.log(JSON.stringify({ drifted, unresolved, total: report.length, items: report }, null, 2))
    process.exit(drifted ? 1 : 0)
  }

  // Plain-text report.
  console.log(`N8N audit — ${BASE_URL}`)
  console.log(`Local workflows : ${local.length}`)
  console.log(`Cloud workflows : ${cloud.length}`)
  console.log(`Drifted         : ${drifted}`)
  if (unresolved) console.log(`Unresolved      : ${unresolved} (a secret is missing, so these were never compared)`)
  console.log('')

  for (const r of report) {
    const tag = r.status === 'in_sync'    ? 'OK     '
              : r.status === 'drift'      ? 'DRIFT  '
              : r.status === 'unresolved' ? 'UNKNOWN'
              : r.status === 'local_only' ? 'LOCAL  '
              : r.status === 'cloud_only' ? 'CLOUD  '
              : '?      '
    console.log(`${tag} ${r.name}${r.file ? '  ['+r.file+']' : ''}`)
    if (r.status === 'unresolved') {
      if (r.missing_env.length) {
        console.log(`         · needs ${r.missing_env.join(', ')} to redact the cloud copy before comparing`)
      }
      if (r.residual_secrets.length) {
        console.log(`         · cloud still holds ${r.residual_secrets.length} credential-shaped literal(s) after redaction`)
        console.log('           (the supplied value does not match what cloud holds - a second or rotated key)')
      }
    }
    if (verbose && (r.status === 'drift' || r.status === 'unresolved')) {
      for (const [field, diff] of Object.entries(r.drift)) {
        console.log(`         · ${field}: local ${diff.local_chars}c, cloud ${diff.cloud_chars}c`)
        for (const line of diff.lines || []) console.log(`             ${line}`)
      }
    }
  }

  console.log('')
  if (unresolved) {
    console.log(`${unresolved} workflow(s) could not be compared at all. Set the variables named above`)
    console.log('before reading anything into the drift count: an unresolvable comparison is not')
    console.log('a difference, and treating it as one is how four real regressions stayed hidden')
    console.log('inside 53 reported items for twelve days.')
  }
  if (drifted) {
    console.log('Drift detected. Inspect with `--verbose`, which now prints the actual changed')
    console.log('lines. Decide the DIRECTION per workflow before pushing: sync.mjs only moves')
    console.log('repo -> cloud, and the cloud copy is ahead at least as often as the mirror is.')
    process.exit(1)
  } else {
    console.log('No drift.')
    process.exit(0)
  }
}

main().catch(e => {
  console.error(`FATAL: ${e.message}`)
  process.exit(2)
})
