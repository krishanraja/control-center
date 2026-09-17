import { Mail, Linkedin, Phone, Instagram, AtSign, AlertTriangle, MapPin, Search, Radio } from '@/lib/icons'
import { Badge } from '@/components/ui/badge'
import { ScoreBreakdown } from './ScoreBreakdown'
import { geoLabel } from '../../hooks/useNetworkGeo'
import { resolveReach, type ChannelId, type ReachOption } from '../../lib/networkReach'
import { contactProvenance } from '../../lib/contactProvenance'
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
  // A magnifier, not the LinkedIn glyph. The icon is the only thing some people
  // will read before tapping, and it has to say "this is a search" on its own.
  linkedin_search: Search,
}

// What the chip says for each stance. Written as the thing Krish would say to
// himself, not as the classifier's category name.
const STANCE_CHIP: Record<string, string> = {
  asking: 'asking for help with AI',
  struggling: 'stuck on AI',
  hiring: 'hiring for AI',
  evaluating: 'evaluating AI',
  building: 'shipping AI',
  teaching: 'teaching AI',
  commenting: 'posting about AI',
}

// The stances worth interrupting your day for. Everything else renders in the
// neutral outline so the eye is not drawn to commentary.
const HOT_STANCE = new Set(['asking', 'struggling', 'hiring', 'evaluating'])

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
  // Where he knows them from. On the row, because the whole point is not having
  // to open anything to remember who this is.
  const prov = contactProvenance(r)
  // The best channel that can actually be ACTED on, which is not always the one
  // on file: 368 people are recorded as best-reached by phone and this database
  // has no phone column at all. See lib/networkReach.
  const reach = resolveReach(r)
  // Two buttons, and the order is deliberate. LinkedIn is unconditional — the
  // profile when we hold one, a pre-filled people-search when we do not — so
  // the row never renders a person with no way through to them. The second is
  // whatever else can actually be acted on, which is usually email.
  //
  // Pick the best NON-LinkedIn option rather than testing only the best one and
  // giving up. resolveReach sorts the recommended channel first, so for anyone
  // whose best_channel is linkedin_dm and who has a profile URL, reach.best IS
  // the LinkedIn option — and the old test then nulled the second button and
  // silently dropped a real email address off the row. That broke the one thing
  // this row promises: one click to the profile, one click to an address where
  // one exists. Speculative options are excluded because the LinkedIn search
  // fallback is already rendered as the first button.
  const second = reach.options.find(o => !o.speculative && o.channel !== 'linkedin_dm') || null
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
          <span className="truncate text-ui font-semibold text-ink">{name}</span>
          <Badge variant={TIER_VARIANT[r.network_tier] || 'outline'}>{TIER_LABEL[r.network_tier] || r.network_tier}</Badge>
          {/* Says why this row is low, rather than leaving Krish to work it
              out from the risk line after he has already read the name. They
              are demoted in the ranker, not hidden: a rival advisory founder
              is still an intro path and still a podcast guest, which is why
              the pilots classifier sorts these people to "can introduce"
              instead of dropping them. */}
          {r.sells_competing_services && (
            <Badge variant="warning" className="gap-1" title="Sells the kind of advisory work you sell, so this row is ranked down.">
              <AlertTriangle size={9} aria-hidden /> competitor
            </Badge>
          )}
          {r.thin_evidence && (
            // Never hidden, always labelled. A record under 50 completeness has
            // large gaps: typically nobody read a profile, so the title and
            // company were pattern-matched and the rest is inference. Saying so
            // is the difference between a ranked list and a confident wrong
            // answer.
            <Badge variant="warning" className="gap-1">
              <AlertTriangle size={9} aria-hidden /> thin evidence
            </Badge>
          )}
          {/* Intent, as a STANCE rather than a subject.
              "Posting about AI" flagged 45% of the warm network, which is true
              and useless. What makes the next message write itself is knowing
              they are stuck, or hiring, or asking — and the badge only earns
              its place if it says which.
              Shown while the signal is live; the score decays to zero past a
              quarter, so this can never describe someone's 2023 posts as a
              reason to call them today. Someone SELLING AI is deliberately not
              badged: they are a vendor, not a buyer, and a green chip on them
              would be a lie about what the row is for. */}
          {(r.intent_score ?? 0) > 0 && r.intent_stance && r.intent_stance !== 'selling' && (
            <Badge
              variant={HOT_STANCE.has(r.intent_stance) ? 'success' : 'outline'}
              className="gap-1"
              title={r.intent_evidence || r.intent_summary || undefined}
            >
              <Radio size={9} aria-hidden /> {STANCE_CHIP[r.intent_stance] || 'active on AI'}
            </Badge>
          )}
        </div>

        <p className="mt-1 flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded border px-1 py-0.5 text-micro font-medium ${prov.tone}`}
            title={prov.known ? `Source: ${prov.full}` : 'No recorded source for this contact'}
          >
            {prov.label}
          </span>
          {prov.detail && (
            <span className="truncate text-micro text-ink-faint" title={prov.detail}>{prov.detail}</span>
          )}
        </p>

        {(sub || place) && (
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-label text-ink-faint">
            {sub && <span className="truncate">{sub}</span>}
            {place && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-ink-faint">
                <MapPin size={10} aria-hidden />
                {place}
              </span>
            )}
          </p>
        )}
        {reason && <p className="mt-1.5 text-label leading-relaxed text-ink-muted">{reason}</p>}
        {opening && (
          <p className="mt-1 text-label leading-relaxed text-ink-faint">
            <span className="text-ink-faint">Open with</span> {opening}
          </p>
        )}
        {r.risk && (
          <p className="mt-1 text-label leading-relaxed text-amber-200/85">
            <span className="text-ink-faint">Risk</span> {r.risk}
          </p>
        )}
      </button>

      {/* One tap to the person, without opening anything. The row still opens
          the sheet; these are the shortcuts for when the name alone was enough.
          A button renders only when the tap completes somewhere real, so this
          is never a control that looks live and does nothing. */}
      <div className="flex shrink-0 items-center gap-1.5 self-center">
        {reach.linkedin && <RowReach option={reach.linkedin} name={name} primary />}
        {second && <RowReach option={second} name={name} />}
      </div>
    </div>
  )
}

function RowReach({ option, name, primary }: {
  option: ReachOption
  name: string
  primary?: boolean
}) {
  const Icon = CHANNEL_ICON[option.channel]
  // The speculative search is visibly quieter and dashed. It has to be possible
  // to tell, at a glance down a list of forty, which of these land on the person
  // and which land on a search for someone who might be them.
  const tone = option.speculative
    ? 'border-dashed border-white/12 text-ink-faint hover:border-white/25 hover:text-ink-faint'
    : primary
      ? 'border-white/10 text-ink-faint hover:border-violet-400/40 hover:bg-violet-500/15 hover:text-violet-100'
      : 'border-white/10 text-ink-faint hover:border-violet-400/40 hover:bg-violet-500/15 hover:text-violet-100'
  return (
    <a
      href={option.href}
      {...(option.external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      onClick={e => e.stopPropagation()}
      title={option.speculative
        ? `No profile URL on file — search LinkedIn for ${option.address}`
        : `${option.label}: ${option.address}${option.unverified ? ' (unverified)' : ''}`}
      aria-label={`${option.label} ${name}`}
      data-testid={`network-row-reach-${option.channel}`}
      className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${tone}`}
    >
      <Icon size={14} aria-hidden />
    </a>
  )
}
