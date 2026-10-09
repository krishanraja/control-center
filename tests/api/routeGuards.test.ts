import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// A route that gates its writes with guard() and declares its methods with
// preamble() must hand guard() every write method it declares. guard() answers
// 405 to any method missing from its list, so `guard(req, res, ['POST'])` on a
// route that also declares PATCH refuses every PATCH before the handler runs.
// That is how /api/growth/touchpoints and /api/growth/creative rejected every
// coverage edit and every clip stage move until 2026-10-04.

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.ts$/.test(e)) out.push(p)
  }
  return out
}

const ROOT = new URL('../../', import.meta.url).pathname
const routes = walk(join(ROOT, 'api'))
  .map(file => ({ file: file.slice(ROOT.length), src: readFileSync(file, 'utf8') }))
  .filter(r => /preamble\(req, res, '/.test(r.src) && /guard\(req, res, \[/.test(r.src))

test('the scan finds the routes it is meant to check', () => {
  const names = routes.map(r => r.file).sort()
  for (const must of ['api/growth/council.ts', 'api/growth/creative.ts', 'api/growth/touchpoints.ts']) {
    assert.ok(names.includes(must), `${must} not scanned: ${names.join(', ')}`)
  }
})

test('every write method preamble declares is one guard lets through', () => {
  for (const { file, src } of routes) {
    const declared = (src.match(/preamble\(req, res, '([^']+)'\)/)?.[1] ?? '')
      .split(',').map(m => m.trim().toUpperCase()).filter(m => m && m !== 'GET' && m !== 'OPTIONS')
    const guarded = new Set<string>()
    for (const m of src.matchAll(/guard\(req, res, \[([^\]]*)\]\)/g)) {
      for (const g of m[1].split(',')) guarded.add(g.replace(/['"\s]/g, '').toUpperCase())
    }
    for (const method of declared) assert.ok(guarded.has(method), `${file}: preamble declares ${method} but guard() only allows ${[...guarded].join(', ')}`)
  }
})

// A prepared move (ADR-030) may commit only through COMMIT_ROUTES in
// src/lib/surfaceMoves.ts. Every pattern there must be a route that exists,
// so a typo cannot ship as "the system's press" and 404 on the day it is
// pressed. `:id` is a bracketed segment on disk.
test('every commit route a prepared move may use is a route that exists', async () => {
  const { COMMIT_ROUTES } = await import('../../src/lib/surfaceMoves.js')
  for (const route of COMMIT_ROUTES) {
    const rel = route.replace(/^\/api\//, 'api/').replace(/:id/g, '[id]')
    const file = join(ROOT, `${rel}.ts`)
    const dir = join(ROOT, rel, 'index.ts')
    assert.ok(statSafe(file) || statSafe(dir), `${route} has no handler at ${rel}.ts or ${rel}/index.ts`)
  }
})

function statSafe(p: string): boolean {
  try { return statSync(p).isFile() } catch { return false }
}
