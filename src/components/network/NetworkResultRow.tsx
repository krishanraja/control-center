import { Mail, Linkedin, Phone, Instagram, AtSign, AlertTriangle, MapPin } from '@/lib/icons'
import { Badge } from '@/components/ui/badge'
import { ScoreBreakdown } from './ScoreBreakdown'
import { geoLabel } from '../../hooks/useNetworkGeo'
import { resolveReach, type ChannelId } from '../../lib/networkReach'
import type { NetworkResult } from '../../hooks/useNetworkSearch'

// One person in a result list. Structure referenced from Relume's stacked-list6,
// retyped in house tokens: Relume's version is an avatar, a name, an email and a
// job title, which is a directory row. This has to answer "why am I looking at
// this person", so the judgment carries the row and the identity supports it.

const TIER_LABEL: Record<string, string> = {
  '1_reciprocated': 'Replied to you',
  '2_core_network': 'Core network',
  '3_known_network': 'Known',
  '4_owned_network': 'Your list',
  '5_cold_lead': 'Cold',
}
const TIER_VARIANT: Record<string, 'accent' | 'solid' | 'default' | 'outline'> = {
  '1_reciprocated': 'accent',
  '2_core_network': 'solid',
  '3_known_network': 'default',
  '4_owned_network': 'outline',
  '5_cold_lead': 'outline',
}
const CHANNEL_ICON: Record<ChannelId, typeof Mail> = {
  email: Mail, linkedin_dm: Linkedin, phone: Phone, instagram_dm: Instagram, twitter: AtSign,
}

export function NetworkResultRow({ r, onOpen, weak }: {
  r: NetworkResult
  onOpen?: (r: NetworkResult) => void
  weak?: boolean
}) {
  const name = r.full_name || r.company || 'Unnamed contact'
  const sub = [r.title, r.company].filter(Boolean).join(' · ')
  // Where they are, when we know. Rendered from the RESOLVED code rather than
  // the country column, so someone placed by their location or their email
  // domain shows a country too. Absent rather than "Unknown": a row that says
  // nothing about location is honest, a row that asserts unknown is noise on
  // most of the corpus.
  const place = r.geo_code ? geoLabel(r.geo_code, r.country || undefined) : null
  // The best channel that can actually be ACTED on, which is not always the one
  // on file: 368 people are recorded as best-reached by phone and this database
  // has no phone column at all. See lib/networkReach.
  const reach = resolveReach(r).best
  const Channel = reach ? CHANNEL_ICON[reach.channel] : null
  // why_match is the reranker answering THIS question. why_them is the stored
  // judgment. Prefer the former; fall back so a row is never reasonless.
  const reason = r.why_match || r.why_them
  // Same precedence as reason, one line down: `move` is the explain pass
  // answering "so how do I open THIS conversation", `hook` is the stored
  // opener for the person in general. A reason to contact someone with no way
  // in is half an answer, which is what this row was before the explain pass
  // returned a move at all.
  const opening = r.move || r.hook

  return (
    <div className="group flex items-start gap-3 border-b border-white/[0.06] px-4 py-3.5 transition-colors last:border-b-0 hover:bg-white/[0.02]">
      <ScoreBreakdown score={r.match_score} terms={r} tone={weak ? 'weak' : 'default'} />

      <button
        type="button"
        onClick={() => onOpen?.(r)}
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 rounded-lg"
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="truncate text-ui font-semibold text-white">{name}</span>
          <Badge variant={TIER_VARIANT[r.network_tier] || 'outline'}>{TIER_LABEL[r.network_tier] || r.network_tier}</Badge>
          {r.thin_evidence && (
            // Never hidden, always labelled. rules_v1 means nobody read a
            // profile: the title and company were pattern-matched and the rest
            // is inference. Saying so is the difference between a ranked list
            // and a confident wrong answer.
            <Badge variant="warning" className="gap-1">
              <AlertTriangle size={9} aria-hidden /> thin evidence
            </Badge>
          )}
        </div>

        {(sub || place) && (
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-label text-white/50">
            {sub && <span className="truncate">{sub}</span>}
            {place && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-white/35">
                <MapPin size={10} aria-hidden />
                {place}
              </span>
            )}
          </p>
        )}
        {reason && <p className="mt-1.5 text-label leading-relaxed text-white/75">{reason}</p>}
        {opening && (
          <p className="mt-1 text-label leading-relaxed text-white/45">
            <span className="text-white/30">Open with</span> {opening}
          </p>
        )}
        {r.risk && (
          <p className="mt-1 text-label leading-relaxed text-amber-200/85">
            <span className="text-white/30">Risk</span> {r.risk}
          </p>
        )}
      </button>

      {/* One tap to the person, without opening anything. The row still opens
          the sheet; this is the shortcut for when the name alone was enough. It
          renders only when there is an address a tap can complete, so it is
          never a button that looks live and does nothing. */}
      {reach && Channel && (
        <a
          href={reach.href}
          {...(reach.external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
          onClick={e => e.stopPropagation()}
          title={`${reach.label}: ${reach.address}`}
          aria-label={`${reach.label} ${name}`}
          data-testid="network-row-reach"
          className="flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full border border-white/10 text-white/40 transition-colors hover:border-violet-400/40 hover:bg-violet-500/15 hover:text-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
        >
          <Channel size={14} aria-hidden />
        </a>
      )}
    </div>
  )
}
