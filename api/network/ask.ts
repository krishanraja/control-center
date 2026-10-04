import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guard } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { callClaude, robustJson, hasAnthropicKey } from '../_content.js'
import { SYNTHESIS_MODEL } from '../_models.js'
import { planQuery } from '../_networkQuery.js'
import { runNetworkSearch } from '../_networkSearch.js'
import { relationshipEvidence, inWords } from '../_relationshipEvidence.js'
import { RETIRED_VENTURES } from '../_venturePositioning.js'
import { sharedHistoryLine } from '../../src/lib/sharedHistory.js'
import { knownFromWords } from '../../src/lib/knownFrom.js'

// POST /api/network/ask
//   { need: string, limit?: number }
//   -> { ok, need, candidates: [{ contact_id, name, ..., why_them, why_now,
//                                 ask, channel, give_back, evidence }] }
//
// "I need X. Who do I ask, and what do I say?"
//
// Krish's stated weakness is asking his network for help, and his stated
// failure mode is the blank page: he knows what he does not want long before he
// can write what he does. A daily ask box with nothing in it asks him to do the
// hard half himself. This answers with three named people, the reason each one
// is the right person, the reason today is the right day, and wording he can
// edit rather than originate.
//
// It ranks with the same scorer as /search (ADR-027: the question decides) and
// adds the one thing search has never seen: what the record can prove about the
// relationship. A person Krish has met fifteen times and a stranger with the
// same job title are not the same ask, and until api/_relationshipEvidence.ts
// existed no prompt here could tell them apart.
//
// It proposes only. Nothing is sent. The chosen wording goes into the daily ask
// through the same seed path the strategist uses (ADR-026), so there is still
// one ask a day and one place it lives.

export const config = { maxDuration: 120 }

const MODEL = SYNTHESIS_MODEL
const CANDIDATE_POOL = 14
const PROPOSE = 3

/** The model is asked for plain words; this catches the slug it reaches for
 *  anyway. "Send on linkedin_dm." is the sort of line that tells Krish the
 *  thing was built for a database rather than for him. */
function channelInWords(raw: string, fallback: string | null): string {
  const t = raw.trim().toLowerCase().replace(/[_-]+/g, ' ')
  if (!t) return fallback === 'linkedin' ? 'LinkedIn' : fallback || ''
  if (/linkedin/.test(t)) return 'LinkedIn'
  if (/mail/.test(t)) return 'email'
  if (/twitter|^x$/.test(t)) return 'X'
  if (/whatsapp/.test(t)) return 'WhatsApp'
  return raw.trim()
}

const SYSTEM = `You help Krish Raja ask his own network for help, which is the thing he avoids.

You get a NEED in his words and a numbered list of PEOPLE. Each person carries FACTS (title, company, past roles, skills, what they post about) and RELATIONSHIP (what the record proves: messages each way, meetings, how long since, who wrote last, which channel the relationship lives on).

Return STRICT JSON ONLY, no prose and no code fences:
{ "asks": [{ "i": number, "why_them": string, "why_now": string, "ask": string, "channel": string, "give_back": string, "confidence": "high" | "medium" | "low" }] }

The rules that matter:
- "why_them" is one sentence on why THIS person can move THIS need, from the FACTS. Name the concrete thing: the role they held, the company they are at now, the thing they posted. Never "they have relevant experience".
- "why_now" is one sentence from the RELATIONSHIP only, and it must be true of the numbers in front of you. "You have met four times and have not spoken in eight months" is a reason. "They would love to hear from you" is not. Where they wrote last and Krish never replied, say so: that is the strongest reason there is.
- "ask" is the message, 40 to 90 words, in Krish's voice: plain, direct, warm, specific, no throat-clearing, no flattery, no em dashes. It makes ONE bounded request that can be answered in a single reply, and it names the thing he wants: an introduction to a named kind of person, a half hour, an opinion on a specific decision. An ask nobody can refuse cheaply is not a good ask. Open on the real thread between them where the RELATIONSHIP gives you one.
- "channel" is where to send it, in plain words a person would say: "LinkedIn", "email", "a reply to their last message". Never a slug like linkedin_dm, and never a channel the record does not show they have.
- "give_back" is one short clause naming something Krish can genuinely offer this person: an introduction of his own, a look at something they are building, a slot on the podcast, what he is learning in the open. It must fit THIS person. Where nothing honest fits, return "".
- "confidence" is low where the relationship is thin or the match is loose, and you say so in "why_them" rather than dressing it up. Three honest mediums beat one invented high.
- Never invent a meeting, a reply, a shared project or a warmth the RELATIONSHIP does not show. The record is the only thing you know about these people.
- Never mention a business Krish no longer runs (${[...RETIRED_VENTURES].join(', ')}).

Each person also carries PLAYS, what they can do for Krish, and SHARED, the employers they and Krish have both worked at. The play decides the SHAPE of the ask. Pick the play that fits the NEED; where several fit, the first that fits in this order wins:
- alumni: a reconnection first and a request second. Open on the shared employer by name, as a thing you both know. SHARED says both were there, never that it was at the same time: never write "when we worked together" unless the RELATIONSHIP shows they have actually been in touch.
- multiplier: a partnership, not a sale. They can put Mindmake in front of ten to thirty leaders at once (a portfolio, a peer group, a client roster). Ask for a conversation about what their people are stuck on with AI, and name the one thing Krish would bring to that room.
- buyer: a point of view, sized to one reply. Where NEW_IN_SEAT is under 120 days, they are in their first months and want a model fast: offer a short read on the first decision they face, not a pitch.
- amplifier: a room or a page. Offer a talk, a panel or a story, and back it with what is true: more than 30 keynotes, including the Sydney Opera House. Say what the audience would leave with.
- subject: an interview for makeyourmindup, Krish's series on people building with AI. Name what is interesting about what they are building.

Each person also carries TIE, which of Krish's networks they are in, and KNOWN_FROM, the networks in words.
- "personal" means Facebook or Instagram and not a LinkedIn connection: someone from his life outside work, often from years ago. Write to them as a friend first: first name, warm and short, and honest about the gap where the RELATIONSHIP shows no recent contact ("it has been years"). Keep the request small and human (their view on something, a twenty minute catch-up, one introduction) and never pitch in the first message. Never claim to remember where you met.
- "both" means he knows them personally and professionally, the warmest there is. Lead with the personal thread, then the work one.
- Where PERSONAL_BY_NAME_ONLY is true, the Facebook or Instagram link was matched on a name alone. Do not lean on it: write as if it were not there.
- SHARED can name a school as well as an employer. Where it says "in the same years as you", they really were there together and that is a natural opener. Where it says only "also went to", say no more than that.

What Krish sells, for when the NEED is commercial: Mindmake Brain, for founders and commercial leaders who are still the top salesperson and hate the copywriting and admin around it; and Mindmake GTM, for revenue and monetisation leaders whose pricing or packaging AI is changing. Never invent a product, a price or a client.`

interface Candidate {
  contact_id: string
  name: string
  title?: string | null
  company?: string | null
  email?: string | null
  linkedin_url?: string | null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guard(req, res)) return

  const body = (req.body || {}) as Record<string, unknown>
  const need = typeof body.need === 'string' ? body.need.trim().slice(0, 600) : ''
  if (!need) return res.status(400).json({ ok: false, error: 'need is required' })
  if (!hasAnthropicKey()) {
    return res.status(503).json({ ok: false, error: 'wording needs ANTHROPIC_API_KEY; the ranking alone is at /api/network/search' })
  }

  try {
    // The need is the question. Same planner, same scorer, same order as a
    // search: this route does not get its own idea of who is relevant.
    const { plan } = await planQuery(need)
    const found = await runNetworkSearch({
      plan,
      limit: CANDIDATE_POOL,
      filterMode: 'soft',
      rerank: false,
    })
    const results = found.results || []
    if (!results.length) {
      return res.status(200).json({ ok: true, need, candidates: [], note: 'nobody in the network matches that need yet' })
    }

    const ids = results.map(r => String(r.contact_id))
    const evidence = await relationshipEvidence(ids)

    // Someone who has never answered is a worse ask than someone who has, at
    // the same relevance. The scorer ranks on fit; this nudges on proof, and
    // only within the pool the scorer already approved.
    const ranked = [...results].sort((a, b) => {
      const ea = evidence.get(String(a.contact_id))
      const eb = evidence.get(String(b.contact_id))
      const score = (e: typeof ea) => {
        if (!e) return 0
        let s = 0
        if (e.two_way) s += 3
        if (e.meetings > 0) s += 2
        if (e.last_word === 'them') s += 2
        if (e.warmth_measured) s += 1
        // A relationship that has gone quiet is a better ask than one in
        // mid-conversation: the quiet one is the reason to write at all.
        if (e.days_since_contact !== null && e.days_since_contact > 60) s += 1
        // Someone who sat at the same company is a warmer first message than a
        // stranger with the same title, even with no mail between them.
        if (e.plays.includes('alumni')) s += 2
        // A new CRO in their first months is the buyer at the right moment.
        if (e.days_in_seat !== null && e.days_in_seat < 120) s += 2
        // Known in his life and in his work is the warmest tie the record has.
        if (e.tie === 'both' && !e.personal_by_name_only) s += 1
        return s
      }
      return score(eb) - score(ea)
    })

    const { data: intel, error } = await supabase
      .from('contact_intelligence')
      .select(`contact_id, who, why_them, hook, roles, network_tier, best_channel, reachable_via,
               intent_stance, intent_evidence, last_post_at,
               current_title, current_company, headline, summary, industry, seniority,
               contacts(full_name, title, company, location, email, linkedin_url,
                        career:dossier->_direct->facts->career,
                        skills:dossier->_direct->facts->skills)`)
      .in('contact_id', ranked.slice(0, PROPOSE + 3).map(r => String(r.contact_id)))
    if (error) throw new Error(error.message)

    const byId = new Map((intel || []).map((r: Record<string, unknown>) => [String(r.contact_id), r]))
    const chosen = ranked.slice(0, PROPOSE + 3)
      .map(r => byId.get(String(r.contact_id)))
      .filter(Boolean)
      .slice(0, PROPOSE) as Array<Record<string, unknown>>

    const people = chosen.map((r, i) => {
      const c = (r.contacts || {}) as Record<string, unknown>
      const e = evidence.get(String(r.contact_id))
      const lastPost = r.last_post_at ? Date.parse(String(r.last_post_at)) : NaN
      const intentLive = Number.isFinite(lastPost) && Date.now() - lastPost < 90 * 86_400_000
      const career = Array.isArray(c.career) ? (c.career as Array<Record<string, unknown>>) : []
      const skills = Array.isArray(c.skills) ? (c.skills as unknown[]) : []
      return {
        i,
        name: c.full_name,
        facts: {
          title: r.current_title || c.title,
          company: r.current_company || c.company,
          industry: r.industry,
          seniority: r.seniority,
          place: c.location,
          headline: r.headline,
          summary: typeof r.summary === 'string' ? r.summary.slice(0, 300) : null,
          past_roles: career.slice(0, 5).map(x => [x.title, x.company].filter(Boolean).join(' at ')).filter(Boolean),
          skills: skills.slice(0, 10).map(String),
          posting_about: intentLive ? r.intent_stance : null,
          posted: intentLive ? r.intent_evidence : null,
          stored_hook: r.hook,
        },
        plays: e?.plays ?? [],
        shared: e ? sharedHistoryLine(e.shared_history) : null,
        tie: e?.tie ?? null,
        known_from: e ? knownFromWords(e.known_from) : null,
        personal_by_name_only: e?.personal_by_name_only ?? false,
        new_in_seat_days: e?.days_in_seat ?? null,
        relationship: e ? {
          summary: e.summary,
          home_channel: e.home_channel,
          two_way: e.two_way,
          messages_from_them: e.messages_from_them,
          messages_from_krish: e.messages_from_krish,
          meetings: e.meetings,
          last_contact: inWords(e.days_since_contact),
          last_meeting: inWords(e.days_since_meeting),
          who_wrote_last: e.last_word,
          known_for_months: e.known_months,
          warmth_is_measured: e.warmth_measured,
        } : { summary: 'No contact on record.' },
        reachable: {
          has_email: Boolean(c.email),
          has_linkedin: Boolean(c.linkedin_url),
          best_channel: r.best_channel,
          reachable_via: r.reachable_via,
        },
      }
    })

    const out = await callClaude({
      model: MODEL,
      system: SYSTEM,
      user: JSON.stringify({ need, people }, null, 1),
      maxTokens: 2000,
      agent: 'network-ask',
    })
    const parsed = robustJson(out) || {}
    const asks: Array<Record<string, unknown>> = Array.isArray(parsed.asks) ? parsed.asks : []
    const askBy = new Map<number, Record<string, unknown>>(asks.map(a => [Number(a.i), a]))

    const candidates = chosen.map((r, i) => {
      const c = (r.contacts || {}) as Record<string, unknown>
      const a: Record<string, unknown> = askBy.get(i) || {}
      const e = evidence.get(String(r.contact_id))
      return {
        contact_id: r.contact_id,
        name: c.full_name,
        title: r.current_title || c.title,
        company: r.current_company || c.company,
        email: c.email || null,
        linkedin_url: c.linkedin_url || null,
        why_them: typeof a.why_them === 'string' ? a.why_them : '',
        why_now: typeof a.why_now === 'string' ? a.why_now : '',
        ask: typeof a.ask === 'string' ? a.ask : '',
        channel: channelInWords(typeof a.channel === 'string' ? a.channel : '', e?.home_channel ?? null),
        give_back: typeof a.give_back === 'string' ? a.give_back : '',
        confidence: a.confidence === 'high' || a.confidence === 'low' ? a.confidence : 'medium',
        // Returned so the card can show the proof rather than asking him to
        // trust the sentence.
        evidence: e ? { summary: e.summary, warmth: e.warmth, measured: e.warmth_measured } : null,
        plays: e?.plays ?? [],
        shared: e ? sharedHistoryLine(e.shared_history) : null,
        tie: e?.tie ?? null,
        known_from: e ? knownFromWords(e.known_from) : null,
      }
    }).filter(x => x.ask)

    return res.status(200).json({ ok: true, need, candidates })
  } catch (err) {
    return res.status(500).json({ ok: false, error: String((err as Error)?.message || err).slice(0, 300) })
  }
}
