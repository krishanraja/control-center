import { useEffect, useState } from 'react'
import {
  Mail, Linkedin, Phone, Instagram, AtSign, Copy, Check, ExternalLink,
  AlertTriangle, MapPin, Search,
} from '@/lib/icons'
import { Badge } from '@/components/ui/badge'
import { BottomSheet } from '../mobile/BottomSheet'
import { useToast } from '../shared/Toast'
import { ContactEditChips } from '../shared/ContactEditChips'
import { useHaptics } from '../../hooks/useHaptics'
import { resolveReach, type ReachOption, type ChannelId } from '../../lib/networkReach'
import { contactProvenance } from '../../lib/contactProvenance'
import { geoLabel } from '../../hooks/useNetworkGeo'
import type { NetworkResult } from '../../hooks/useNetworkSearch'
import { Working } from '../shared/Working'

// What opens when you tap someone in the results.
//
// The job is one thing: get from "this is the right person" to "I have sent
// them something" without a detour. So the reach block is FIRST, above the
// judgment, and the top button is a real link the tap completes — mailto:, the
// LinkedIn profile, the X handle. The address is printed next to it rather than
// hidden behind the button, because half the time what is actually wanted is to
// copy it into something else.
//
// The channel shown is the best one that WORKS, not the best one on file. See
// lib/networkReach: 368 people are recorded as best-reached by phone and this
// database has no phone column, so a button driven off best_channel would be
// dead for thousands of people in the least visible way possible.

const ICON: Record<ChannelId, typeof Mail> = {
  email: Mail, linkedin_dm: Linkedin, phone: Phone, instagram_dm: Instagram, twitter: AtSign,
  linkedin_search: Search,
}

const TIER_LABEL: Record<string, string> = {
  '1_reciprocated': 'Replied to you',
  '2_core_network': 'Core network',
  '3_known_network': 'Known',
  '4_owned_network': 'Your list',
  '5_cold_lead': 'Cold',
}

interface PersonDetail {
  contact?: {
    twitter_handle?: string | null
    location?: string | null
    last_touch_at?: string | null
    first_met_context?: string | null
    primary_venture?: string | null
    status?: string | null
  } | null
  // api/network/person/[id].ts returns the whole contact_intelligence row beside
  // the contact, minus the embedding columns. It was read here and never
  // declared, so tsc rejected the file and every pull request against main went
  // red on a type error in code none of them touched.
  //
  // Left as the open row rather than a field list: the table gains columns
  // faster than this component reads them, and a partial list that looks
  // complete is worse than one that says it is not. The single read below
  // narrows what it needs.
  intelligence?: Record<string, unknown> | null
}

function profileFrom(
  intel: Record<string, unknown> | null | undefined,
  person: NetworkResult,
): { headline: string | null; summary: string | null; topics: string[]; provenance: string | null } | null {
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const headline = str(intel?.headline)
  const summary = str(intel?.summary)
  const topics = Array.isArray(person.intent_topics)
    ? person.intent_topics.filter((t): t is string => typeof t === 'string' && !!t.trim()).slice(0, 6)
    : []

  // Say the source and the date together or not at all: "enriched" with no
  // date is the kind of freshness claim this codebase has had to retract.
  const src = str(intel?.enriched_source)
  const at = str(intel?.enriched_at)
  const when = at ? new Date(at) : null
  const provenance = src && when && !Number.isNaN(when.getTime())
    ? `Profile read from ${src} on ${when.toLocaleDateString()}`
    : null

  if (!headline && !summary && !topics.length && !provenance) return null
  return { headline, summary, topics, provenance }
}

export function NetworkPersonSheet({ person, onClose }: {
  person: NetworkResult | null
  onClose: () => void
}) {
  const { toast } = useToast()
  const h = useHaptics()
  const [copied, setCopied] = useState<string | null>(null)
  // The row already carries everything the reach block needs, so the sheet
  // renders instantly and this only fills in the extras (an X handle, when the
  // last touch was). A detail fetch must never be the thing between a decision
  // and an email.
  const [detail, setDetail] = useState<PersonDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    setDetail(null)
    setCopied(null)
    if (!person) return
    let live = true
    setLoadingDetail(true)
    fetch(`/api/network/person/${person.contact_id}`)
      .then(r => r.json())
      .then(j => { if (live && j?.ok) setDetail(j as PersonDetail) })
      .catch(() => { /* the sheet is already useful without it */ })
      .finally(() => { if (live) setLoadingDetail(false) })
    return () => { live = false }
  }, [person?.contact_id])

  if (!person) return null

  // The row carries the X handle now, so the sheet no longer waits on the
  // detail fetch to render a complete reach block. `detail` is still preferred
  // when it lands, because it is the fresher read.
  // The bought profile, narrowed out of the open intelligence row. Read here
  // rather than typed onto PersonDetail for the reason that comment gives: the
  // table gains columns faster than this component reads them.
  const profile = profileFrom(detail?.intelligence, person)

  const reach = resolveReach({
    email: person.email,
    linkedin_url: person.linkedin_url,
    twitter_handle: detail?.contact?.twitter_handle ?? person.twitter_handle,
    best_channel: person.best_channel,
    reachable_via: person.reachable_via,
    full_name: person.full_name,
    company: person.company,
  })

  // Where he knows them from, read with the name rather than found at the
  // bottom of the sheet after a round-trip.
  const prov = contactProvenance({
    origin_channel: person.origin_channel,
    origin_campaign: person.origin_campaign,
    first_met_context: detail?.contact?.first_met_context ?? person.first_met_context,
  })

  // Enrichment wins over import. current_title and current_company were read off
  // the profile; person.title and person.company come from contacts, which is
  // whatever the sheet or lead file said whenever it was written. Showing the
  // stale pair while holding the fresh one is the exact failure ADR-022 was
  // about, one layer up.
  const intel = detail?.intelligence as { current_title?: string | null; current_company?: string | null } | undefined
  const sub = [intel?.current_title || person.title, intel?.current_company || person.company]
    .filter(Boolean).join(' · ')
  const place = person.geo_code ? geoLabel(person.geo_code, person.country || undefined) : null

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      h.tap(); setCopied(text); toast('Copied.', 'success')
      setTimeout(() => setCopied(c => (c === text ? null : c)), 1600)
    } catch {
      toast('Could not copy.', 'error')
    }
  }

  return (
    <BottomSheet open onClose={onClose} fullHeight={false} ariaLabel={person.full_name || 'Person'}>
      <div className="max-h-[82vh] overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
        {/* Identity */}
        <div className="pb-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="text-title font-semibold leading-tight text-ink">
              {person.full_name || person.company || 'Unnamed contact'}
            </h2>
            <Badge variant={person.network_tier === '1_reciprocated' ? 'accent' : 'default'}>
              {TIER_LABEL[person.network_tier] || person.network_tier}
            </Badge>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-micro font-medium ${prov.tone}`}
              title={prov.known ? `Source: ${prov.full}` : 'No recorded source for this contact'}
            >
              {prov.label}
            </span>
            {prov.detail && <span className="text-label text-ink-faint">{prov.detail}</span>}
          </p>
          {(sub || place) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-body text-ink-faint">
              {sub && <span>{sub}</span>}
              {place && (
                <span className="inline-flex items-center gap-0.5 text-ink-faint">
                  <MapPin size={11} aria-hidden /> {place}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Reach. First, because this is what the sheet is for. */}
        <div className="space-y-2 border-t border-white/[0.07] pt-3">
          {/* Nothing we can actually act on. This warning is NOT conditional on
              the options list being empty: once the LinkedIn search fallback
              exists, a person with no address at all still renders a button,
              and dropping the warning at that point would let a guess at who
              they might be pass for contact details. It is keyed off `best`,
              which is never speculative. */}
          {!reach.best && (
            <div className="flex items-start gap-2 rounded-card border border-amber-400/20 bg-amber-500/[0.06] px-3 py-2.5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-200" aria-hidden />
              <p className="text-label leading-relaxed text-amber-100/85">
                {reach.note || 'No contact details on file for this person.'}
              </p>
            </div>
          )}

          {reach.options.map(o => (
            <ReachButton key={o.channel} option={o} primary={o === reach.best}
                         onCopy={() => copy(o.address)} copied={copied === o.address} />
          ))}

          {/* The recorded best channel is not always one we hold an address for.
              Saying which, rather than quietly showing a different button. */}
          {reach.best && reach.note && (
            <p className="text-label leading-relaxed text-ink-faint">{reach.note}</p>
          )}
          {loadingDetail && !detail && (
            <p className="flex items-center gap-1.5 text-label text-ink-faint">
              <Working size={11} /> Checking for other channels.
            </p>
          )}
        </div>

        {/* Judgment. Why this person, and what to open with.
            Rendered only when there is something to say: every child here is
            conditional, so an unenriched person used to draw a bare divider
            with padding and nothing beneath it. */}
        {(person.why_match || person.why_them || person.who || person.move || person.hook
          || person.risk || person.thin_evidence
          || ((person.intent_score ?? 0) > 0 && person.intent_evidence)) && (
        <div className="mt-3 space-y-2 border-t border-white/[0.07] pt-3">
          {(person.why_match || person.why_them) && (
            <p className="text-body leading-relaxed text-ink-muted">{person.why_match || person.why_them}</p>
          )}
          {person.who && person.who !== person.why_them && (
            <p className="text-label leading-relaxed text-ink-faint">{person.who}</p>
          )}
          {/* Same precedence the row uses one line down: `move` is the explain
              pass answering "so how do I open THIS conversation", `hook` is the
              stored generic. Rendering only the hook meant opening a row
              DOWNGRADED the opening line from the query-specific move back to
              the generic one. */}
          {(person.move || person.hook) && (
            <p className="text-label leading-relaxed text-ink-faint">
              <span className="text-ink-faint">Open with</span> {person.move || person.hook}
            </p>
          )}
          {person.risk && (
            <p className="text-label leading-relaxed text-amber-200/85">
              <span className="text-ink-faint">Risk</span> {person.risk}
            </p>
          )}
          {person.thin_evidence && (
            <p className="flex items-start gap-1.5 text-label leading-relaxed text-amber-200/70">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" aria-hidden />
              Thin evidence: large gaps in this record. Usually no profile was ever read, so the
              title and company were pattern-matched and the rest is inference.
            </p>
          )}

          {/* The evidence behind the intent chip, in their own words.
              This is the payoff of classifying posts rather than summarising
              them: the row makes a claim, and here is the sentence it made it
              from. Krish can disagree with the classifier in one glance, which
              he cannot do with a score. */}
          {/* Gated on stance the same way the row is. Without it a person whose
              stance is `selling` — a vendor, never a buyer — got a green panel
              here that the row deliberately suppresses. */}
          {(person.intent_score ?? 0) > 0 && person.intent_stance
            && person.intent_stance !== 'selling' && person.intent_evidence && (
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.07] px-3 py-2">
              <p className="text-micro uppercase tracking-wide text-emerald-300/70">
                {person.intent_summary || 'Recent activity'}
                {/* The card asserts this is recent, so it says WHEN. Claiming
                    freshness without showing a date is asking to be trusted. */}
                {person.last_post_at && (
                  <span className="text-emerald-300/45"> · {new Date(person.last_post_at).toLocaleDateString()}</span>
                )}
              </p>
              <p className="mt-1 text-label italic leading-relaxed text-ink-muted">
                &ldquo;{person.intent_evidence}&rdquo;
              </p>
              {person.intent_evidence_url && (
                <a
                  href={person.intent_evidence_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1 inline-block text-micro text-emerald-300/80 underline underline-offset-2 hover:text-emerald-200"
                >
                  Read the post
                </a>
              )}
            </div>
          )}

          {/* The profile that was actually bought.
              `headline` and `summary` are capped out of intel_doc by migration
              20260915250000 on the stated grounds that "the sheet and the
              judgment model can read it there". Neither did: 1,700 Coresignal
              credits bought this text and nothing displayed a word of it.
              `intent_topics` had the same shape of problem, returned by the
              RPC and typed on both sides and never rendered. */}
          {profile && (
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
              {profile.headline && (
                <p className="text-label leading-snug text-ink-muted">{profile.headline}</p>
              )}
              {profile.summary && (
                <p className="mt-1 text-label leading-relaxed text-ink-faint">{profile.summary}</p>
              )}
              {!!profile.topics.length && (
                <p className="mt-1.5 flex flex-wrap gap-1">
                  {profile.topics.map(t => (
                    <span key={t} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-micro text-ink-faint">{t}</span>
                  ))}
                </p>
              )}
              {/* Where it came from and when. Without this a fresh profile and
                  a rules-only guess look identical, which is the confusion
                  thin_evidence alone could not resolve. */}
              {profile.provenance && (
                <p className="mt-1.5 text-micro text-ink-faint">{profile.provenance}</p>
              )}
            </div>
          )}
        </div>
        )}

        {/* What you can change. The edits wait for the detail fetch because
            venture and status live on the contact row, not on the search
            result, and a chip seeded from a guess would show the wrong thing
            for the second it took to learn otherwise. */}
        {detail?.contact && (
          <div className="mt-3 border-t border-white/[0.07] pt-3">
            <ContactEditChips
              contactId={person.contact_id}
              venture={detail.contact.primary_venture ?? null}
              status={detail.contact.status ?? null}
            />
          </div>
        )}

        {/* Facts, small and last. */}
        {(person.roles.length > 0 || person.industry || person.seniority) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/[0.07] pt-3">
            {person.roles.map(r => (
              <Badge key={r} variant="outline">{r.replace(/_/g, ' ')}</Badge>
            ))}
            {person.seniority && <Badge variant="outline">{person.seniority.replace(/_/g, ' ')}</Badge>}
            {person.industry && <Badge variant="outline">{person.industry}</Badge>}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

function ReachButton({ option, primary, onCopy, copied }: {
  option: ReachOption
  primary?: boolean
  onCopy: () => void
  copied: boolean
}) {
  const Icon = ICON[option.channel]
  return (
    <div className="flex items-stretch gap-1.5">
      <a
        href={option.href}
        {...(option.external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
        data-testid={`network-reach-${option.channel}`}
        className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 rounded-form border px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
          option.speculative
            ? 'border-dashed border-white/12 text-ink-faint hover:border-white/25 hover:bg-white/[0.03]'
            : primary
              ? 'border-violet-400/40 bg-violet-500/15 text-violet-100 hover:bg-violet-500/25'
              : 'border-white/10 text-ink-muted hover:border-white/20 hover:bg-white/[0.03]'}`}
      >
        <Icon size={15} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold leading-tight">
            {option.label}
            {option.recommended && (
              <span className={`ml-1.5 text-micro font-medium ${primary ? 'text-violet-200/70' : 'text-ink-faint'}`}>
                best channel
              </span>
            )}
            {/* Two different kinds of "we are not certain", and conflating them
                would be the whole problem. `unverified` means the address is a
                pattern guess and may bounce. `speculative` means we hold no
                profile at all and this is a search for someone by that name. */}
            {option.unverified && (
              <span className="ml-1.5 text-micro font-medium text-amber-200/70">unverified — may bounce</span>
            )}
            {option.speculative && (
              <span className="ml-1.5 text-micro font-medium text-ink-faint">no profile on file</span>
            )}
          </span>
          <span className={`block truncate text-label leading-tight ${primary ? 'text-violet-100/60' : 'text-ink-faint'}`}>
            {option.address}
          </span>
        </span>
        {option.external && <ExternalLink size={12} className="shrink-0 opacity-40" aria-hidden />}
      </a>
      {/* Copy is a peer of the action, not a menu item under it. Half of what
          this sheet gets used for is pasting an address somewhere else. Not
          offered for the search fallback: `address` there is a name and a
          company, not something anyone wants on their clipboard. */}
      {!option.speculative && <button
        type="button"
        onClick={onCopy}
        aria-label={`Copy ${option.label.toLowerCase()} address`}
        data-testid={`network-copy-${option.channel}`}
        className="flex min-h-[44px] w-11 shrink-0 items-center justify-center rounded-form border border-white/10 text-ink-faint transition-colors hover:border-white/20 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
      >
        {copied ? <Check size={14} className="text-emerald-300" aria-hidden /> : <Copy size={14} aria-hidden />}
      </button>}
    </div>
  )
}
