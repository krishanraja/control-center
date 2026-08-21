import { useEffect, useState } from 'react'
import {
  Mail, Linkedin, Phone, Instagram, AtSign, Copy, Check, ExternalLink,
  AlertTriangle, MapPin,
} from '@/lib/icons'
import { Badge } from '@/components/ui/badge'
import { BottomSheet } from '../mobile/BottomSheet'
import { useToast } from '../shared/Toast'
import { ContactEditChips } from '../shared/ContactEditChips'
import { useHaptics } from '../../hooks/useHaptics'
import { resolveReach, type ReachOption, type ChannelId } from '../../lib/networkReach'
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

  const reach = resolveReach({
    email: person.email,
    linkedin_url: person.linkedin_url,
    twitter_handle: detail?.contact?.twitter_handle,
    best_channel: person.best_channel,
    reachable_via: person.reachable_via,
  })

  const sub = [person.title, person.company].filter(Boolean).join(' · ')
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
            <h2 className="text-title font-semibold leading-tight text-white">
              {person.full_name || person.company || 'Unnamed contact'}
            </h2>
            <Badge variant={person.network_tier === '1_reciprocated' ? 'accent' : 'default'}>
              {TIER_LABEL[person.network_tier] || person.network_tier}
            </Badge>
          </div>
          {(sub || place) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-body text-white/55">
              {sub && <span>{sub}</span>}
              {place && (
                <span className="inline-flex items-center gap-0.5 text-white/40">
                  <MapPin size={11} aria-hidden /> {place}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Reach. First, because this is what the sheet is for. */}
        <div className="space-y-2 border-t border-white/[0.07] pt-3">
          {reach.best ? (
            <>
              <ReachButton option={reach.best} primary
                           onCopy={() => copy(reach.best!.address)}
                           copied={copied === reach.best.address} />
              {reach.options.slice(1).map(o => (
                <ReachButton key={o.channel} option={o}
                             onCopy={() => copy(o.address)} copied={copied === o.address} />
              ))}
            </>
          ) : (
            <div className="flex items-start gap-2 rounded-card border border-amber-400/20 bg-amber-500/[0.06] px-3 py-2.5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-200" aria-hidden />
              <p className="text-label leading-relaxed text-amber-100/85">
                {reach.note || 'No contact details on file for this person.'}
              </p>
            </div>
          )}

          {/* The recorded best channel is not always one we hold an address for.
              Saying which, rather than quietly showing a different button. */}
          {reach.best && reach.note && (
            <p className="text-label leading-relaxed text-white/40">{reach.note}</p>
          )}
          {loadingDetail && !detail && (
            <p className="flex items-center gap-1.5 text-label text-white/30">
              <Working size={11} /> Checking for other channels.
            </p>
          )}
        </div>

        {/* Judgment. Why this person, and what to open with. */}
        <div className="mt-3 space-y-2 border-t border-white/[0.07] pt-3">
          {(person.why_match || person.why_them) && (
            <p className="text-body leading-relaxed text-white/80">{person.why_match || person.why_them}</p>
          )}
          {person.who && person.who !== person.why_them && (
            <p className="text-label leading-relaxed text-white/50">{person.who}</p>
          )}
          {person.hook && (
            <p className="text-label leading-relaxed text-white/60">
              <span className="text-white/30">Open with</span> {person.hook}
            </p>
          )}
          {person.risk && (
            <p className="text-label leading-relaxed text-amber-200/85">
              <span className="text-white/30">Risk</span> {person.risk}
            </p>
          )}
          {detail?.contact?.first_met_context && (
            <p className="text-label leading-relaxed text-white/45">
              <span className="text-white/30">First met</span> {detail.contact.first_met_context}
            </p>
          )}
          {person.thin_evidence && (
            <p className="flex items-start gap-1.5 text-label leading-relaxed text-amber-200/70">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" aria-hidden />
              Thin evidence: their title and company were pattern-matched and no profile was ever read.
            </p>
          )}
        </div>

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
          primary
            ? 'border-violet-400/40 bg-violet-500/15 text-violet-100 hover:bg-violet-500/25'
            : 'border-white/10 text-white/70 hover:border-white/20 hover:bg-white/[0.03]'}`}
      >
        <Icon size={15} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold leading-tight">
            {option.label}
            {option.recommended && (
              <span className={`ml-1.5 text-micro font-medium ${primary ? 'text-violet-200/70' : 'text-white/35'}`}>
                best channel
              </span>
            )}
          </span>
          <span className={`block truncate text-label leading-tight ${primary ? 'text-violet-100/60' : 'text-white/40'}`}>
            {option.address}
          </span>
        </span>
        {option.external && <ExternalLink size={12} className="shrink-0 opacity-40" aria-hidden />}
      </a>
      {/* Copy is a peer of the action, not a menu item under it. Half of what
          this sheet gets used for is pasting an address somewhere else. */}
      <button
        type="button"
        onClick={onCopy}
        aria-label={`Copy ${option.label.toLowerCase()} address`}
        data-testid={`network-copy-${option.channel}`}
        className="flex min-h-[44px] w-11 shrink-0 items-center justify-center rounded-form border border-white/10 text-white/45 transition-colors hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
      >
        {copied ? <Check size={14} className="text-emerald-300" aria-hidden /> : <Copy size={14} aria-hidden />}
      </button>
    </div>
  )
}
