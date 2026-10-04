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
