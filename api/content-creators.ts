import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'
import { preamble, slug as slugify } from './_content.js'
import { text, bodyId } from './_growth.js'

// /api/content-creators: thin CRUD over the curated-creator registry
// (content_creators, seeded by 20260902090000_content_creators_registry.sql).
//
// v1 ships no UI on purpose (Krish, 2026-09-02): the list is managed here, so
// a later Voices panel or the Telegram inbox router can add a creator with one
// small call instead of a schema change.
//
//   GET    all creators, active first.
//   POST   add a creator: name + why required; linkedin_url or linkedin_slug
//          optional (the /in/ slug is extracted from a pasted profile URL).
//   PATCH  whitelisted edits. Retiring is active=false; nothing is deleted,
//          so per-creator history (scrape state, yield) survives.
//
// House RLS is anon SELECT / service_role ALL; every mutation lands here.

const EDITABLE = ['name', 'linkedin_slug', 'linkedin_url', 'why', 'active', 'notes'] as const

/** The /in/ slug from a LinkedIn profile URL, or the input when it already is
 *  a bare slug. Null when neither reads as a profile. */
function linkedinSlugFrom(url: string | null, bare: string | null): string | null {
  if (bare && /^[A-Za-z0-9-]{3,100}$/.test(bare)) return bare.toLowerCase()
  if (!url) return null
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i)
  return m ? decodeURIComponent(m[1]).toLowerCase() : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res, 'GET, POST, PATCH, OPTIONS')) return

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('content_creators')
      .select('*')
      .order('active', { ascending: false })
      .order('name', { ascending: true })
    if (error) return res.status(500).json({ ok: false, error: error.message })
    return res.json({ ok: true, count: (data || []).length, creators: data || [] })
  }

  if (req.method === 'POST') {
    const b = (req.body || {}) as Record<string, unknown>
    const name = text(b.name)
    const why = text(b.why)
    if (!name) return res.status(400).json({ ok: false, error: 'name is required' })
    if (!why) return res.status(400).json({ ok: false, error: 'why is required: what move does Krish rate this creator for' })
    const linkedinUrl = text(b.linkedin_url)
    const linkedinSlug = linkedinSlugFrom(linkedinUrl, text(b.linkedin_slug))
    const { data, error } = await supabase
      .from('content_creators')
      .insert({
        slug: slugify(name),
        name,
        why,
        linkedin_slug: linkedinSlug,
        linkedin_url: linkedinUrl || (linkedinSlug ? `https://www.linkedin.com/in/${linkedinSlug}` : null),
        notes: text(b.notes),
      })
      .select('*')
      .single()
    if (error) {
      if (error.code === '23505') return res.status(409).json({ ok: false, error: 'a creator with this name already exists' })
      return res.status(500).json({ ok: false, error: error.message })
    }
    return res.json({ ok: true, creator: data })
  }

  // PATCH
  const id = bodyId(req)
  if (!id) return res.status(400).json({ ok: false, error: 'id required' })
  const b = (req.body || {}) as Record<string, unknown>

  const patch: Record<string, unknown> = {}
  for (const k of EDITABLE) {
    if (!(k in b)) continue
    patch[k] = k === 'active' ? b.active === true : text(b[k])
  }
  if (patch.name === null) return res.status(400).json({ ok: false, error: 'name cannot be blank' })
  if (patch.why === null) return res.status(400).json({ ok: false, error: 'why cannot be blank' })
  if ('linkedin_slug' in patch || 'linkedin_url' in patch) {
    const slugValue = linkedinSlugFrom(
      typeof patch.linkedin_url === 'string' ? patch.linkedin_url : null,
      typeof patch.linkedin_slug === 'string' ? patch.linkedin_slug : null,
    )
    patch.linkedin_slug = slugValue
    if (!('linkedin_url' in patch) && slugValue) patch.linkedin_url = `https://www.linkedin.com/in/${slugValue}`
  }
  if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'nothing to update' })
  patch.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('content_creators').update(patch).eq('id', id).select('*').single()
  if (error) return res.status(500).json({ ok: false, error: error.message })
  if (!data) return res.status(404).json({ ok: false, error: 'creator not found' })
  return res.json({ ok: true, creator: data })
}
