import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { linkedInProfile } from '../_apify.js'
import { isBlocking } from '../_quota.js'

// POST /api/network/import-linkedin-strangers?dryRun=1&limit=130&budget=1
//
// The people Krish has messaged on LinkedIn who are not in his network.
//
// The message export names the person who wrote TO him and nobody else, so a
// thread he opened and nobody answered arrives as a profile URL and no name.
// 121 of those exist, and none is in Connections.csv either: he messaged them
// without ever connecting. They are the only correspondents left with no
// identity at all, which makes them invisible to search and to the ask flow.
//
// This reads each profile once and creates the contact. It costs real money,
// about $0.004 a profile, so it carries a hard ceiling in dollars as well as a
// row limit, and it refuses to start without an explicit budget. It writes a
// contact only where a name actually came back: a row whose name is a URL slug
// is worse than no row, because it looks like a person in every list.

export const config = { maxDuration: 300 }

const DEFAULT_LIMIT = 130
const CEILING_USD = 2
// Apify reports no per-call charge on the outcome, so spend is counted at a
// deliberate OVER-estimate of what the profile actor has been observed to cost
// ($0.0039 to $0.0056 across this session). Counting high means the ceiling
// stops the run early rather than late, which is the only safe direction for a
// number that is guessed.
const PER_PROFILE_USD = 0.006

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res, ['POST'])) return

  const dryRun = req.query.dryRun === '1'
  const limit = Math.max(1, Math.min(300, Number(req.query.limit) || DEFAULT_LIMIT))
  const budget = Math.min(CEILING_USD, Number(req.query.budget) || 0)
  if (!dryRun && budget <= 0) {
    return res.status(400).json({ ok: false, error: `budget is required in USD, at most ${CEILING_USD}` })
  }

  try {
    // Every LinkedIn correspondent with no name and no contact behind them.
    const { data: rows, error } = await supabase
      .from('correspondent_stats')
      .select('person_key, linkedin_url, inbound_count, outbound_count, first_at, last_at')
      .eq('channel', 'linkedin_message')
      .is('display_name', null)
      .limit(400)
    if (error) throw new Error(error.message)

    const slugOf = (u: unknown) => {
      const m = /linkedin\.com\/(?:in|pub)\/([^/?#,\s]+)/i.exec(String(u || ''))
      return m ? m[1].trim().toLowerCase() : null
    }

    // PostgREST returns 1,000 rows unless told otherwise, and 5,884 contacts
    // carry a LinkedIn URL. Reading it in one go left five sixths of the
    // exclusion set missing, so people who are already contacts looked like
    // strangers. Paged, and the page size is asserted rather than assumed.
    const haveSlugs = new Set<string>()
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const { data: page, error: kErr } = await supabase
        .from('contacts').select('linkedin_url')
        .not('linkedin_url', 'is', null)
        // Without an order, pages can overlap and skip: a stable order is
        // what makes "every page" mean every row.
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (kErr) throw new Error(kErr.message)
      for (const c of (page || []) as Array<Record<string, unknown>>) {
        const sl = slugOf(c.linkedin_url)
        if (sl) haveSlugs.add(sl)
      }
      if (!page || page.length < PAGE) break
    }

    const strangers = (rows || [])
      .filter((r: Record<string, unknown>) => !haveSlugs.has(slugOf(r.linkedin_url)))
      .slice(0, limit) as Array<Record<string, unknown>>

    if (dryRun) {
      return res.status(200).json({
        ok: true, dryRun: true, strangers: strangers.length,
        estimate_usd: Number((strangers.length * PER_PROFILE_USD).toFixed(2)),
        sample: strangers.slice(0, 5).map(s => s.linkedin_url),
      })
    }
    if (!strangers.length) return res.status(200).json({ ok: true, strangers: 0, created: 0 })

    let spent = 0
    let created = 0
    let joined = 0
    let noName = 0
    const failures: string[] = []

    for (const s of strangers) {
      // The ceiling is checked before every call, not only at the end.
      if (spent >= budget) break
      const url = String(s.linkedin_url || '')
      const { profile, outcome } = await linkedInProfile(url, 'network-import-linkedin-strangers')
      spent += PER_PROFILE_USD
      // Out of credit or rate limited: every further call fails the same way
      // and bills for the attempt. Stop rather than grind through 120 of them.
      if (outcome && isBlocking(outcome)) {
        failures.push(`${url}: ${outcome.status}, stopped`)
        break
      }
      if (!profile) { failures.push(url); continue }

      const name = String(profile.fullName || '').trim()
      // A contact named after a URL slug looks like a person in every list and
      // is worse than no contact at all.
      if (!name) { noName++; continue }

      const twoWay = Number(s.inbound_count || 0) > 0 && Number(s.outbound_count || 0) > 0

      // Plenty of these people are already contacts with no LinkedIn URL on
      // them, reached by email or imported from a roster. Matching on URL alone
      // would have made a second copy of someone already here rather than finding them.
      // An exact name match attaches the URL to the person who is already here,
      // which is both the duplicate guard and the better outcome: it joins a
      // LinkedIn identity to a mail one.
      const { data: sameName } = await supabase
        .from('contacts').select('id, linkedin_url, title, company')
        .ilike('full_name', name).is('linkedin_url', null).limit(2)
      if (sameName && sameName.length === 1) {
        const existing = sameName[0] as Record<string, unknown>
        const patch: Record<string, unknown> = { linkedin_url: url }
        if (!String(existing.title || '').trim() && profile.title) patch.title = profile.title
        if (!String(existing.company || '').trim() && profile.company) patch.company = profile.company
        const { error: upErr } = await supabase.from('contacts').update(patch).eq('id', existing.id)
        if (upErr) { failures.push(`${url}: ${upErr.message}`); continue }
        joined++
        continue
      }
      // Two people with the same name is not a match, it is a coin toss. Those
      // get a new contact, and the duplicate is a person's call, not a guess.

      const { data: ins, error: iErr } = await supabase.from('contacts').insert({
        full_name: name,
        linkedin_url: url,
        title: profile.title || null,
        company: profile.company || null,
        sources: [{ type: 'network_intelligence', source: 'linkedin_messages_profile', imported_at: new Date().toISOString().slice(0, 10) }],
        consent_tier: 'warm',
        triage_status: 'pending',
        enrichment_status: 'none',
      }).select('id').single()
      if (iErr) { failures.push(`${url}: ${iErr.message}`); continue }

      const { error: ciErr } = await supabase.from('contact_intelligence').insert({
        contact_id: ins.id,
        network_tier: twoWay ? '1_reciprocated' : '3_known_network',
        tier_weight: twoWay ? 100 : 70,
        confidence: 'low',
        intel_method: 'linkedin_messages_v1',
        is_person: true,
        name_quality: 'full',
        source_count: 1,
        source_list: ['linkedin_messages'],
        reachable_via: ['linkedin'],
        headline: profile.headline || null,
        warmth_source: 'measured',
      })
      if (ciErr) { failures.push(`${url}: ${ciErr.message}`); continue }
      created++
    }

    const { data: rolled, error: rerr } = await supabase.rpc('refresh_relationship_rollup')
    return res.status(200).json({
      ok: true,
      considered: strangers.length,
      created,
      joined_to_existing: joined,
      no_name_returned: noName,
      spent_usd: Number(spent.toFixed(3)),
      budget_usd: budget,
      stopped_on_budget: spent >= budget,
      failures: failures.slice(0, 10),
      contacts_rescored: rerr ? null : rolled,
    })
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err as Error)?.message || err).slice(0, 300) })
  }
}
