import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { preamble, slug as slugify } from '../_content.js'
import { PRODUCT_SLUGS, SUBJECT_KINDS, text, bodyId } from '../_growth.js'

// /api/aeo/subjects: the registry of what the AEO research machine studies.
//
// A subject is one of three kinds. A venture is one of the five Growth
// products (product_slug set, the council and the probes key on it). A
// prospect is a company Krish wants to sell to, optionally tied to the Room
// target whose leader sits there, so the week's read can be used in the
// approach. An aspiration is a company he wants to be like: the machine
// reads which of their pages the engines cite and says what to copy.
//
//   GET    every subject, active first, ventures first.
//   POST   add one: kind + name required; domains, competitor_domains,
//          seed_topics, never_say as arrays of strings; icp_line; a prospect
//          may name room_target_id; a venture must name product_slug.
//   PATCH  whitelisted edits. Retiring is active=false; nothing is deleted,
//          because the digests and probes hang off the row.
//
// Same posture as api/growth/touchpoints.ts: the browser's operator writes
// come here unauthenticated (the blast radius is one registry row); the
// machine reads the registry through api/aeo/context.ts on a bearer.

const EDITABLE = ['name', 'domains', 'competitor_domains', 'icp_line', 'seed_topics', 'never_say', 'room_target_id', 'active', 'notes'] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A clean list of short strings, or null when the input is not a list. */
function list(v: unknown, max: number, itemMax: number): string[] | null {
  if (v == null) return []
  if (typeof v === 'string') v = v.split(/[\n,]/)
  if (!Array.isArray(v)) return null
  const out: string[] = []
  for (const item of v) {
    const s = String(item ?? '').trim()
    if (!s) continue
    if (s.length > itemMax) return null
    if (!out.includes(s)) out.push(s)
    if (out.length >= max) break
  }
  return out
}

/** Domains are stored bare and lower-case: no scheme, no path, no www. */
function domains(v: unknown): string[] | null {
  const raw = list(v, 12, 200)
  if (!raw) return null
  const out: string[] = []
  for (const d of raw) {
    let host = d.toLowerCase().trim()
    try { if (/^https?:\/\//.test(host)) host = new URL(host).hostname } catch { return null }
    host = host.replace(/^www\./, '').replace(/\/.*$/, '')
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null
    if (!out.includes(host)) out.push(host)
  }
  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'GET, POST, PATCH, OPTIONS')) return

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('growth_aeo_subjects')
      .select('*')
      .order('active', { ascending: false })
      .order('kind', { ascending: true })
      .order('name', { ascending: true })
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, count: (data || []).length, subjects: data || [] })
  }

  if (req.method === 'POST') {
    const b = (req.body || {}) as Record<string, unknown>
    const kind = text(b.kind)
    const name = text(b.name)
    if (!kind || !SUBJECT_KINDS.has(kind)) return res.status(400).json({ ok: false, error: 'kind must be venture, prospect or aspiration' })
    if (!name) return res.status(400).json({ ok: false, error: 'name is required' })
    const productSlug = text(b.product_slug)
    if (kind === 'venture' && (!productSlug || !PRODUCT_SLUGS.has(productSlug))) return res.status(400).json({ ok: false, error: 'a venture must name one of the Growth product slugs' })
    if (kind !== 'venture' && productSlug) return res.status(400).json({ ok: false, error: 'only a venture carries a product slug' })
    const roomTargetId = text(b.room_target_id)
    if (roomTargetId && (kind !== 'prospect' || !UUID.test(roomTargetId))) return res.status(400).json({ ok: false, error: 'room_target_id is a uuid and only a prospect may carry one' })
    const doms = domains(b.domains)
    const comps = domains(b.competitor_domains)
    const topics = list(b.seed_topics, 12, 120)
    const never = list(b.never_say, 20, 120)
    if (!doms || !comps) return res.status(400).json({ ok: false, error: 'domains must be bare hostnames like example.com' })
    if (!topics || !never) return res.status(400).json({ ok: false, error: 'seed_topics and never_say must be lists of short strings' })
    if (kind !== 'venture' && !doms.length) return res.status(400).json({ ok: false, error: 'a prospect or aspiration needs at least one domain' })

    const { data, error } = await supabase
      .from('growth_aeo_subjects')
      .insert({
        kind,
        slug: slugify(name),
        name,
        domains: doms,
        competitor_domains: comps,
        icp_line: text(b.icp_line),
        seed_topics: topics,
        never_say: never,
        product_slug: kind === 'venture' ? productSlug : null,
        room_target_id: roomTargetId || null,
        notes: text(b.notes),
      })
      .select('*')
      .single()
    if (error) {
      if (error.code === '23505') return res.status(409).json({ ok: false, error: 'a subject with this name already exists for that kind' })
      return res.status(500).json({ ok: false, error: error.message })
    }
    return res.json({ ok: true, subject: data })
  }

  // PATCH
  const id = bodyId(req)
  if (!id || !UUID.test(id)) return res.status(400).json({ ok: false, error: 'id required' })
  const b = (req.body || {}) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const k of EDITABLE) {
    if (!(k in b)) continue
    if (k === 'active') { patch.active = b.active === true; continue }
    if (k === 'domains' || k === 'competitor_domains') {
      const v = domains(b[k]); if (!v) return res.status(400).json({ ok: false, error: `${k} must be bare hostnames like example.com` }); patch[k] = v; continue
    }
    if (k === 'seed_topics' || k === 'never_say') {
      const v = list(b[k], 20, 120); if (!v) return res.status(400).json({ ok: false, error: `${k} must be a list of short strings` }); patch[k] = v; continue
    }
    if (k === 'room_target_id') {
      const v = text(b[k]); if (v && !UUID.test(v)) return res.status(400).json({ ok: false, error: 'room_target_id must be a uuid' }); patch[k] = v || null; continue
    }
    patch[k] = text(b[k])
  }
  if (patch.name === null) return res.status(400).json({ ok: false, error: 'name cannot be blank' })
  if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'nothing to update' })
  patch.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('growth_aeo_subjects').update(patch).eq('id', id).select('*').single()
  if (error) {
    if (error.code === '23514') return res.status(400).json({ ok: false, error: 'that change breaks a rule: a venture keeps its product slug, only a prospect links a Room target' })
    return res.status(500).json({ ok: false, error: error.message })
  }
  if (!data) return res.status(404).json({ ok: false, error: 'subject not found' })
  return res.json({ ok: true, subject: data })
}
