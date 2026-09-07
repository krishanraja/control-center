import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'

// The roles Krish said Yes to, each with its package links and the one
// person hunter found to get him in. Read only; verdicts are given on the
// sheet and the person is found by the process run.

export const config = { maxDuration: 30 }

// Mirrors router.py GO_WORDS.
const GO_WORDS = new Set(['go', 'y', 'yes', 'build'])

interface Person { name: string; title: string | null; company: string | null; linkedin_url: string | null }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['GET'])) return
  try {
    const { data: roles, error } = await supabase
      .from('hunter_seen_roles')
      .select('job_id, company, title, url, job_url, score, location, comp, status, krish_verdict, package_status, package_built_at, package_cv_url, package_letter_url, rejection_reason, why_it_fits')
      .not('krish_verdict', 'is', null)
      .neq('status', 'duplicate')
      .order('score', { ascending: false, nullsFirst: false })
    if (error) throw new Error(error.message)
    const yes = (roles || []).filter(r => GO_WORDS.has(String(r.krish_verdict || '').trim().toLowerCase()))
    const jobIds = yes.map(r => r.job_id as string)
    if (!jobIds.length) return res.status(200).json({ ok: true, roles: [] })

    const { data: bridges, error: bErr } = await supabase
      .from('bridge_candidates')
      .select('bridge_id, job_id, contact_key, path_tier, path_evidence, bridge_score, draft_ask, state')
      .in('job_id', jobIds)
      .in('state', ['proposed', 'reached_out'])
      .order('bridge_score', { ascending: false })
    if (bErr) throw new Error(bErr.message)
    const best = new Map<string, NonNullable<typeof bridges>[number]>()
    for (const b of bridges || []) {
      if (String(b.contact_key || '').startsWith('peer:')) continue
      if (!best.has(b.job_id as string)) best.set(b.job_id as string, b)
    }

    const keys = [...new Set([...best.values()].map(b => b.contact_key as string).filter(k => k && !k.startsWith('headhunter:')))]
    const people = new Map<string, Person>()
    const plain = keys.filter(k => !k.startsWith('contact:'))
    if (plain.length) {
      const { data } = await supabase
        .from('network_contacts')
        .select('contact_key, full_name, current_title, current_company, linkedin_url')
        .in('contact_key', plain)
      for (const c of data || []) {
        people.set(c.contact_key as string, {
          name: c.full_name as string, title: c.current_title as string | null,
          company: c.current_company as string | null,
          linkedin_url: (c.linkedin_url as string | null) || `https://www.linkedin.com/in/${c.contact_key}`,
        })
      }
    }
    const ids = keys.filter(k => k.startsWith('contact:')).map(k => k.slice('contact:'.length))
    if (ids.length) {
      const { data } = await supabase.from('contacts').select('id, full_name, title, company, linkedin_url').in('id', ids)
      for (const c of data || []) {
        people.set(`contact:${c.id}`, { name: c.full_name as string, title: c.title as string | null, company: c.company as string | null, linkedin_url: c.linkedin_url as string | null })
      }
    }

    const out = yes.map(r => {
      const b = best.get(r.job_id as string) || null
      let person: Person | null = null
      if (b) {
        const key = b.contact_key as string
        if (key.startsWith('headhunter:')) {
          const m = /HEADHUNTER PATH: (.+?) at (.+?) \(/.exec(String(b.path_evidence || ''))
          person = { name: m ? m[1] : key.slice('headhunter:'.length).replace(/-/g, ' '), title: 'headhunter', company: m ? m[2] : null, linkedin_url: null }
        } else {
          person = people.get(key) || { name: key, title: null, company: null, linkedin_url: null }
        }
      }
      return {
        job_id: r.job_id, company: r.company, title: r.title, url: r.url || r.job_url, score: r.score,
        location: r.location, comp: r.comp, status: r.status, package_status: r.package_status,
        package_built_at: r.package_built_at, cv_url: r.package_cv_url, letter_url: r.package_letter_url,
        rejection_reason: r.rejection_reason, why_it_fits: r.why_it_fits,
        bridge: b ? { bridge_id: b.bridge_id, tier: b.path_tier, evidence: b.path_evidence, ask: b.draft_ask, state: b.state } : null,
        person,
      }
    })
    return res.status(200).json({ ok: true, roles: out })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'roles_failed' })
  }
}
