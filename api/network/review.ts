import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { recordVerdict } from '../_suggestions.js'
import { PEOPLE_REVIEW_SURFACE } from '../../src/lib/servedSurfaces.js'
import { factsToAdd, slugOf, despace, normName, type MetaRow } from '../_metaImport.js'

// GET  /api/network/review?surface=contact_merge|contact_link&limit=20
// POST /api/network/review  { suggestion_id, verdict, choice?, reason_code? }
// POST /api/network/review  { action: 'unlink' | 'confirm_link', contact_id, ref }
//
// The two questions only Krish can answer about his network: "are these two
// records the same person?" and "is this LinkedIn profile them?". Both were
// raised by a merge pass or an import that could not prove the answer, and
// both stay questions until he answers. His answer is applied here and
// recorded in the learning bank, so a "no" is never asked again.
//
// A yes to "same person" runs merge_contacts(), which keeps everything (see
// supabase/migrations/20261004040000). A yes to "this is them" fills blanks
// from that profile and nothing else. A no writes nothing but the verdict,
// except where an unconfirmed memorial match had kept someone out of
// proposals: a no lets them back in.

export const config = { maxDuration: 60 }

const SURFACES = ['contact_merge', 'contact_link'] as const
type Surface = typeof SURFACES[number]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REASONS = new Set(PEOPLE_REVIEW_SURFACE.reasons.map(r => r.code))

type Row = Record<string, unknown>

/** What a card shows about one side: enough to recognise a person. */
export interface ReviewPerson {
  id: string
  name: string | null
  title: string | null
  company: string | null
  location: string | null
  email_domain: string | null
  linkedin_slug: string | null
  known_from: string[]
  evidence: string | null
  warmth: number | null
  warmth_measured: boolean
  plays: string[]
}

const SOURCE_WORDS: Record<string, string> = {
  linkedin_export: 'LinkedIn connection',
  instagram_export: 'Instagram',
  phone_address_book: 'phone contacts',
  gmail_krish_mindmaker: 'your mailbox',
  linkedin_messages: 'LinkedIn messages',
  linkedin_messages_profile: 'LinkedIn messages',
  circle_roster: 'a community roster',
  sheet: 'one of your sheets',
  control_center_contacts: 'one of your lists',
  podcast_guest: 'podcast guests',
  meta_export: 'Facebook or Instagram',
}

function knownFromSources(sources: unknown): string[] {
  if (!Array.isArray(sources)) return []
  const out: string[] = []
  for (const s of sources as Row[]) {
    if (!s || typeof s !== 'object') continue
    if (s.type === 'meta_export' && Array.isArray(s.networks)) {
      for (const n of s.networks as string[]) {
        const w = n === 'facebook' ? 'Facebook' : n === 'instagram' ? 'Instagram' : 'phone contacts'
        if (!out.includes(w)) out.push(w)
      }
      continue
    }
    const w = SOURCE_WORDS[String(s.source || s.type || '')]
    if (w && !out.includes(w)) out.push(w)
  }
  return out
}

async function people(ids: string[]): Promise<Map<string, ReviewPerson>> {
  const out = new Map<string, ReviewPerson>()
  const clean = [...new Set(ids.filter(id => UUID.test(id)))]
  if (!clean.length) return out
  const [{ data: cs }, { data: cis }] = await Promise.all([
    supabase.from('contacts').select('id, full_name, title, company, location, email_normalized, linkedin_url, sources').in('id', clean),
    supabase.from('contact_intelligence').select('contact_id, current_title, current_company, warmth, warmth_source, email_inbound, email_outbound, plays').in('contact_id', clean),
  ])
  const ci = new Map(((cis || []) as Row[]).map(r => [String(r.contact_id), r]))
  for (const c of (cs || []) as Row[]) {
    const i = ci.get(String(c.id)) || {}
    const inbound = Number(i.email_inbound || 0)
    const outbound = Number(i.email_outbound || 0)
    out.set(String(c.id), {
      id: String(c.id),
      name: (c.full_name as string) || null,
      title: (i.current_title as string) || (c.title as string) || null,
      company: (i.current_company as string) || (c.company as string) || null,
      location: (c.location as string) || null,
      email_domain: c.email_normalized ? String(c.email_normalized).split('@')[1] || null : null,
      linkedin_slug: slugOf(c.linkedin_url as string),
      known_from: knownFromSources(c.sources),
      evidence: inbound + outbound > 0
        ? `${inbound + outbound} messages${inbound > 0 && outbound > 0 ? ' both ways' : ''}`
        : null,
      warmth: i.warmth === null || i.warmth === undefined ? null : Number(i.warmth),
      warmth_measured: i.warmth_source === 'measured',
      plays: Array.isArray(i.plays) ? (i.plays as string[]) : [],
    })
  }
  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['GET', 'POST'])) return
  try {
    if (req.method === 'GET') return await list(req, res)
    const b = (req.body && typeof req.body === 'object' ? req.body : {}) as Row
    if (b.action === 'unlink') return await unlink(b, res)
    if (b.action === 'confirm_link') return await confirmLink(b, res)
    return await answer(b, res)
  } catch (err) {
    return res.status(err instanceof MergeNotOn ? 409 : 500).json({ ok: false, error: String((err as Error)?.message || err).slice(0, 300) })
  }
}

async function list(req: VercelRequest, res: VercelResponse) {
  const surface = (SURFACES as readonly string[]).includes(String(req.query.surface)) ? String(req.query.surface) as Surface : 'contact_merge'
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20))
  const [{ data: open, error }, { data: counts, error: cErr }] = await Promise.all([
    supabase.rpc('people_review_open', { p_surface: surface, p_limit: limit }),
    supabase.rpc('people_review_counts'),
  ])
  if (error) throw new Error(error.message)
  if (cErr) throw new Error(cErr.message)
  const rows = (open || []) as Row[]
  const ids = rows.flatMap(r => {
    const p = (r.proposed || {}) as Row
    return [String(r.subject_id), String(p.a || ''), String(p.b || '')]
  })
  const who = await people(ids)
  const items = rows.map(r => {
    const p = (r.proposed || {}) as Row
    const subject = who.get(String(r.subject_id)) || null
    if (surface === 'contact_merge') {
      return {
        id: String(r.id), surface, reason: String(r.reason || ''), deferred: Boolean(r.deferred),
        a: who.get(String(p.a)) || null, b: who.get(String(p.b)) || null, rule: (p.rule as string) || null,
      }
    }
    return {
      id: String(r.id), surface, reason: String(r.reason || ''), deferred: Boolean(r.deferred),
      person: subject, memorial: p.memorial === true,
      networks: Array.isArray(p.networks) ? p.networks : [],
      candidates: Array.isArray(p.candidates) ? p.candidates : [],
    }
  }).filter(i => ('a' in i ? i.a && i.b : i.person))
  const byS = Object.fromEntries(((counts || []) as Row[]).map(c => [String(c.surface), Number(c.open)]))
  return res.status(200).json({
    ok: true, surface, items,
    counts: { contact_merge: byS.contact_merge || 0, contact_link: byS.contact_link || 0 },
  })
}

async function answer(b: Row, res: VercelResponse) {
  const id = typeof b.suggestion_id === 'string' ? b.suggestion_id : ''
  const verdict = String(b.verdict || '')
  if (!UUID.test(id)) return res.status(400).json({ ok: false, error: 'suggestion_id is required' })
  if (!['accepted', 'rejected', 'deferred'].includes(verdict)) return res.status(400).json({ ok: false, error: 'verdict must be accepted, rejected or deferred' })
  const reason = typeof b.reason_code === 'string' && b.reason_code ? b.reason_code : null
  if (reason && !REASONS.has(reason)) return res.status(400).json({ ok: false, error: 'unknown_reason_code' })

  const { data: s, error } = await supabase.from('suggestions')
    .select('id, surface, subject_id, proposed').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!s) return res.status(404).json({ ok: false, error: 'not_found' })
  const surface = String((s as Row).surface)
  if (!(SURFACES as readonly string[]).includes(surface)) return res.status(403).json({ ok: false, error: 'not a people question' })
  const p = ((s as Row).proposed || {}) as Row
  const subject = String((s as Row).subject_id)

  let applied: Row = {}
  if (verdict === 'accepted' && surface === 'contact_merge') {
    applied = await mergePair(String(p.a), String(p.b), { suggestion_id: id, rule: p.rule ?? null })
  } else if (verdict === 'accepted' && surface === 'contact_link') {
    const candidates = Array.isArray(p.candidates) ? (p.candidates as Row[]) : []
    const choice = Number.isInteger(b.choice) ? Number(b.choice) : 0
    const c = candidates[choice]
    if (!c) return res.status(400).json({ ok: false, error: 'choice is not one of the candidates' })
    // The memorial page is one candidate, never all of them. Questions
    // written before candidates carried the flag meant the first one.
    const memorial = c.memorial === true || (c.memorial === undefined && p.memorial === true && choice === 0)
    applied = await confirmProfile(subject, c, memorial, id)
    if (!memorial) applied = { ...applied, ...(await releaseHold(subject, p)) }
  } else if (verdict === 'rejected' && surface === 'contact_link') {
    applied = await releaseHold(subject, p)
  }

  const v = await recordVerdict({
    suggestion_id: id,
    verdict,
    reason_code: verdict === 'rejected' ? (reason || PEOPLE_REVIEW_SURFACE.defaultReason) : null,
    final: verdict === 'accepted' ? applied : null,
  }, SURFACES)
  if (v.ok === false) return res.status(v.status).json({ ok: false, error: v.reason, applied })
  return res.status(200).json({ ok: true, applied })
}

/** The import kept someone out of proposals while a memorial match was
 *  unanswered. When the answer says they are alive, put back the status the
 *  hold replaced. Only a hold the import placed (proposed.held) is released,
 *  and only while it is still that hold: a do-not-contact Krish set himself,
 *  or one that was there before the import, is never undone by an answer
 *  here. */
async function releaseHold(subject: string, p: Row): Promise<Row> {
  if (p.held !== true) return {}
  const { data: c } = await supabase.from('contacts').select('status, status_reason').eq('id', subject).maybeSingle()
  if (!c || (c as Row).status !== 'do_not_contact' || (c as Row).status_reason) return {}
  const prior = ['active', 'dormant', 'closed'].includes(String(p.prior_status)) ? String(p.prior_status) : 'active'
  const { error } = await supabase.from('contacts').update({ status: prior }).eq('id', subject)
  if (error) throw new Error(error.message)
  return { released: true, restored: prior }
}

async function mergePair(a: string, b: string, evidence: Row): Promise<Row> {
  if (!UUID.test(a) || !UUID.test(b) || a === b) return { merged: false, why: 'already one contact' }
  const { data: survivor, error: sErr } = await supabase.rpc('merge_survivor', { p_a: a, p_b: b })
  if (sErr) throw new Error(sErr.message)
  if (!survivor) return { merged: false, why: 'one of the two no longer exists' }
  const loser = survivor === a ? b : a
  const { data: mergeId, error } = await supabase.rpc('merge_contacts', {
    p_survivor: survivor, p_loser: loser, p_class: 'krish_confirmed', p_evidence: evidence, p_decided_by: 'krish',
  })
  if (error) {
    // merge_contacts ships separately (20261004060000) because it deletes the
    // merged-away row. Until it is applied, a "same person" is refused and the
    // question stays open, never recorded as answered with nothing done.
    if (error.code === 'PGRST202' || /merge_contacts/.test(error.message) && /does not exist|could not find/i.test(error.message)) {
      throw new MergeNotOn()
    }
    throw new Error(error.message)
  }
  return { merged: true, survivor, loser, merge_id: mergeId }
}

class MergeNotOn extends Error {
  constructor() { super('Merging is not switched on yet, so this pair stays open until it is.') }
}

async function confirmProfile(contactId: string, c: Row, memorial: boolean, suggestionId: string): Promise<Row> {
  const slug = slugOf(String(c.url || ''))
  if (!slug) return { linked: false, why: 'not a profile URL' }

  // The profile may already be someone in the network. Then this person IS
  // that contact, and the answer is a merge.
  const { data: owner } = await supabase.from('contact_identities')
    .select('contact_id').eq('kind', 'li_slug').eq('value', slug).is('retired_at', null).maybeSingle()
  const ownerId = owner ? String((owner as Row).contact_id) : null
  if (ownerId && ownerId !== contactId) {
    const merged = await mergePair(contactId, ownerId, { suggestion_id: suggestionId, rule: 'confirmed_profile', slug })
    return { ...merged, via: 'profile already in the network' }
  }

  const [{ data: contact }, { data: ci }] = await Promise.all([
    supabase.from('contacts').select('id, title, company, location, linkedin_url, email, dossier, status, status_reason').eq('id', contactId).maybeSingle(),
    supabase.from('contact_intelligence').select('headline, followers, current_title, current_company, enriched_at').eq('contact_id', contactId).maybeSingle(),
  ])
  if (!contact) return { linked: false, why: 'contact no longer exists' }
  const k = contact as Row
  const prof = (c.profile && typeof c.profile === 'object' ? c.profile : null) as Row | null
  const blank = (o: Row | null, f: string) => !o || o[f] === null || o[f] === undefined || o[f] === ''
  const patch: Row = {}
  if (blank(k, 'linkedin_url')) patch.linkedin_url = `https://www.linkedin.com/in/${slug}`
  if (prof) {
    if (prof.role && blank(k, 'title')) patch.title = prof.role
    if (prof.company && blank(k, 'company')) patch.company = prof.company
    if (prof.location && blank(k, 'location')) patch.location = prof.location
    const email = typeof prof.email === 'string' ? prof.email : null
    if (email && blank(k, 'email')) {
      const { data: taken } = await supabase.from('contact_identities').select('contact_id').eq('kind', 'email').eq('value', email).is('retired_at', null).maybeSingle()
      if (!taken) patch.email = email
    }
    const row = {
      career: Array.isArray(prof.career) ? prof.career : [], education: Array.isArray(prof.education) ? prof.education : [],
      skills: Array.isArray(prof.skills) ? prof.skills : [], headline: (prof.headline as string) || null,
    } as unknown as MetaRow
    const facts = ((k.dossier as Row | null)?._direct as Row | undefined)?.facts as Row | undefined
    const add = factsToAdd(facts, row)
    if (Object.keys(add).length) {
      const dossier = (k.dossier && typeof k.dossier === 'object' ? { ...(k.dossier as Row) } : {}) as Row
      const direct = (dossier._direct && typeof dossier._direct === 'object' ? { ...(dossier._direct as Row) } : {}) as Row
      direct.facts = { ...(facts || {}), ...add }
      dossier._direct = direct
      patch.dossier = dossier
    }
  }
  if (memorial) {
    patch.status = 'do_not_contact'
    patch.status_reason = 'deceased'
  }
  if (Object.keys(patch).length) {
    const { error } = await supabase.from('contacts').update(patch).eq('id', contactId)
    if (error) throw new Error(error.message)
  }
  if (prof && ci) {
    const ciPatch: Row = {}
    const i = ci as Row
    if (prof.headline && blank(i, 'headline')) ciPatch.headline = prof.headline
    if (prof.followers !== null && prof.followers !== undefined && blank(i, 'followers')) ciPatch.followers = prof.followers
    if (prof.role && blank(i, 'current_title')) ciPatch.current_title = prof.role
    if (prof.company && blank(i, 'current_company')) ciPatch.current_company = prof.company
    if (blank(i, 'enriched_at')) { ciPatch.enriched_at = new Date().toISOString(); ciPatch.enriched_source = 'apify (confirmed by Krish)' }
    if (Object.keys(ciPatch).length) await supabase.from('contact_intelligence').update(ciPatch).eq('contact_id', contactId)
  }
  return { linked: true, slug, filled: Object.keys(patch) }
}

/** "Not them": a Meta person was linked to a contact by name alone, and it is
 *  a different person. The link comes off and the Meta person becomes their
 *  own contact, so nobody is lost either way. */
async function unlink(b: Row, res: VercelResponse) {
  const contactId = typeof b.contact_id === 'string' ? b.contact_id : ''
  const ref = typeof b.ref === 'string' ? b.ref : ''
  if (!UUID.test(contactId) || !/^[A-Za-z0-9_-]{1,32}$/.test(ref)) return res.status(400).json({ ok: false, error: 'contact_id and ref are required' })

  const { data: c } = await supabase.from('contacts').select('id, full_name, sources').eq('id', contactId).maybeSingle()
  if (!c) return res.status(404).json({ ok: false, error: 'not_found' })
  const sources = Array.isArray((c as Row).sources) ? ((c as Row).sources as Row[]) : []
  const entry = sources.find(s => s && s.type === 'meta_export' && s.ref === ref)
  if (!entry) return res.status(404).json({ ok: false, error: 'no such link on this contact' })
  if (entry.basis !== 'meta_name') return res.status(409).json({ ok: false, error: 'only a link made on a name alone can be undone here' })

  const name = despace(String((c as Row).full_name || '')).trim()
  const networks = Array.isArray(entry.networks) ? (entry.networks as string[]) : []
  const { data: made, error: mErr } = await supabase.from('contacts').insert({
    full_name: name,
    sources: [{ ...entry, basis: 'meta_new', split_from: contactId, split_at: new Date().toISOString() }],
    origin_channel: 'meta_export',
    consent_tier: 'cold_engaged',
    triage_status: 'pending',
    enrichment_status: 'none',
  }).select('id').single()
  if (mErr || !made) throw new Error(mErr?.message || 'insert failed')
  const newId = String((made as Row).id)
  await supabase.from('contact_intelligence').insert({
    contact_id: newId, network_tier: '4_owned_network', intel_method: 'pending', confidence: 'low',
    is_person: true, name_quality: (normName(name) || '').includes(' ') ? 'full' : 'partial',
    source_count: 1, source_list: ['meta_export'], reachable_via: [],
  })
  // The handles move with the person they belong to.
  await supabase.from('contact_identities').update({ contact_id: newId, basis: 'meta_new' })
    .eq('contact_id', contactId).eq('source', 'meta_export').eq('basis', 'meta_name')
    .in('kind', networks.length ? networks : ['facebook', 'instagram', 'phone_book'])
  const { error: uErr } = await supabase.from('contacts')
    .update({ sources: sources.filter(s => s !== entry) }).eq('id', contactId)
  if (uErr) throw new Error(uErr.message)
  await supabase.rpc('refresh_ties')
  return res.status(200).json({ ok: true, split_into: newId })
}

/** "It's them": a Meta person linked to this contact on a name alone, and
 *  Krish says it is the same person. The link stops being a guess: the
 *  identities are marked verified, and the tie counts it from now on. */
async function confirmLink(b: Row, res: VercelResponse) {
  const contactId = typeof b.contact_id === 'string' ? b.contact_id : ''
  const ref = typeof b.ref === 'string' ? b.ref : ''
  if (!UUID.test(contactId) || !/^[A-Za-z0-9_-]{1,32}$/.test(ref)) return res.status(400).json({ ok: false, error: 'contact_id and ref are required' })

  const { data: c } = await supabase.from('contacts').select('id, sources').eq('id', contactId).maybeSingle()
  if (!c) return res.status(404).json({ ok: false, error: 'not_found' })
  const sources = Array.isArray((c as Row).sources) ? ((c as Row).sources as Row[]) : []
  const entry = sources.find(s => s && s.type === 'meta_export' && s.ref === ref)
  if (!entry) return res.status(404).json({ ok: false, error: 'no such link on this contact' })
  if (entry.basis !== 'meta_name') return res.status(200).json({ ok: true, already: true })

  const networks = Array.isArray(entry.networks) ? (entry.networks as string[]) : []
  await supabase.from('contact_identities').update({ verified: true, basis: 'meta_name_confirmed' })
    .eq('contact_id', contactId).eq('source', 'meta_export').eq('basis', 'meta_name')
    .in('kind', networks.length ? networks : ['facebook', 'instagram', 'phone_book'])
  const { error } = await supabase.from('contacts')
    .update({ sources: sources.map(s => (s === entry ? { ...s, basis: 'meta_name_confirmed', confirmed_at: new Date().toISOString() } : s)) })
    .eq('id', contactId)
  if (error) throw new Error(error.message)
  await supabase.rpc('refresh_ties')
  return res.status(200).json({ ok: true, confirmed: true })
}
