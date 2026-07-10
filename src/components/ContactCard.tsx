import React from 'react'
import { Linkedin, Mail, Flame, UserCircle2 } from 'lucide-react'
import { humanAge } from '../lib/ageHelpers'
import { ContactSourcePill, ConsentTierBadge, ventureDisplayName } from './ContactSourcePill'
import { FeedbackButton } from './shared/FeedbackButton'
import { useHaptics } from '../hooks/useHaptics'
import { suggestedMove, type SuggestedMoveTone } from '../lib/contactSignals'
import type { ContactRow } from '../hooks/useRealtimeContacts'

interface Props {
  contact: ContactRow
  selected?: boolean
  onToggleSelect?: (id: string) => void
  onOpen?: (id: string) => void
}

/** warming_play → "Warming play"; nurture_sequence → "Nurture sequence". */
export function humanizePlayType(raw?: string | null): string | null {
  if (!raw) return null
  const spaced = raw.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const MOVE_TONE_CHIP: Record<SuggestedMoveTone, string> = {
  act: 'bg-emerald-500/10 text-emerald-300',
  due: 'bg-amber-500/10 text-amber-300',
  info: 'bg-white/[0.06] text-white/55',
}

/** Tone-matched text classes for inline (non-chip) renderings of the move. */
export const MOVE_TONE_TEXT: Record<SuggestedMoveTone, string> = {
  act: 'text-emerald-300/85',
  due: 'text-amber-300/85',
  info: 'text-white/45',
}

/**
 * The contact's single suggested next move as a small chip. A pure read of the
 * row (contactSignals.suggestedMove), so it is safe anywhere a ContactRow is
 * already in hand: cards, deck bodies, rails. Renders nothing when the ladder
 * has no suggestion.
 */
export function SuggestedMoveChip({ contact }: { contact: ContactRow }) {
  const move = suggestedMove(contact)
  if (!move) return null
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${MOVE_TONE_CHIP[move.tone]}`}
      title="Suggested move"
    >
      {move.label}
    </span>
  )
}

/** Small inline heat meter. Colour ramps cold→hot; number always shown. */
function HeatMeter({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score))
  const tone =
    pct >= 75 ? 'bg-rose-400' : pct >= 60 ? 'bg-amber-400' : pct >= 40 ? 'bg-sky-400' : 'bg-white/30'
  const textTone =
    pct >= 75 ? 'text-rose-300' : pct >= 60 ? 'text-amber-300' : pct >= 40 ? 'text-sky-300' : 'text-white/45'
  return (
    <span className="inline-flex items-center gap-1.5" title={`Heat score ${score}`}>
      <Flame size={11} className={textTone} />
      <span className="relative h-1.5 w-12 rounded-full bg-white/[0.08] overflow-hidden">
        <span className={`absolute inset-y-0 left-0 ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`text-[10px] tabular-nums font-semibold ${textTone}`}>{score}</span>
    </span>
  )
}

/**
 * ContactCard — unit of action on the Relationship Engine "Leads" tab.
 *
 * Shows who they are (name · title @ company), how to speak to them (consent
 * tier + provenance), how hot they are (heat meter), and which play the engine
 * proposed (primary_play_type for primary_venture, owned by owner_agent).
 *
 * Warm / customer cards get a highlighted border — those are the ones Krish
 * handles 1-by-1 rather than bulk-processing.
 */
export function ContactCard({ contact: c, selected = false, onToggleSelect, onOpen }: Props) {
  const h = useHaptics()
  const fullName = c.full_name || '—'
  const titleCompany = [c.title, c.company].filter(Boolean).join(' @ ')
  const heat = c.heat_score ?? 0
  const playLabel = humanizePlayType(c.primary_play_type)
  const move = suggestedMove(c)
  const isHighValue = c.consent_tier === 'warm' || c.consent_tier === 'customer'

  const borderCls = isHighValue
    ? 'border-rose-400/30 bg-rose-500/[0.03] hover:border-rose-400/45'
    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]'

  return (
    <article className={`rounded-xl border ${borderCls} p-3 transition-colors`}>
      <header className="flex items-start gap-2 min-w-0">
        {onToggleSelect && (
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-label={selected ? `Deselect ${fullName}` : `Select ${fullName}`}
            onClick={(e) => { e.stopPropagation(); selected ? h.soft() : h.impactRigid(); onToggleSelect(c.id) }}
            className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors
              ${selected ? 'bg-violet-500 border-violet-500 text-white' : 'border-white/25 hover:border-white/45 text-transparent'}`}
          >
            <span className="text-[10px] leading-none">✓</span>
          </button>
        )}
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => onOpen?.(c.id)}
            className="text-left w-full"
          >
            <p className="text-[13px] font-semibold text-white leading-snug truncate">{fullName}</p>
            {titleCompany && (
              <p className="text-[11px] text-white/55 leading-snug truncate">{titleCompany}</p>
            )}
          </button>
        </div>
        {c.linkedin_url && (
          <a
            href={c.linkedin_url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            title="LinkedIn profile"
            className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-white/35 hover:text-sky-300 hover:bg-sky-500/10 transition-colors"
          >
            <Linkedin size={11} />
          </a>
        )}
        {c.email && (
          <a
            href={`mailto:${c.email}`}
            onClick={(e) => e.stopPropagation()}
            title={c.email}
            className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-white/35 hover:text-violet-300 hover:bg-violet-500/10 transition-colors"
          >
            <Mail size={11} />
          </a>
        )}
        <span className="text-[10px] tabular-nums text-white/35 flex-shrink-0 self-center">
          {humanAge(c.updated_at)}
        </span>
      </header>

      {/* Tier + heat row */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <ConsentTierBadge tier={c.consent_tier} />
        <HeatMeter score={heat} />
        <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
          <FeedbackButton sourceTable="contacts" sourceId={c.id} agentId={c.owner_agent} compact />
        </div>
      </div>

      {/* Provenance row — where they came from / how to speak to them */}
      <div className="flex items-center gap-1.5 mt-2 min-w-0">
        <ContactSourcePill contact={c} />
      </div>

      {/* Suggested move + play + venture + owner */}
      {(move || c.primary_venture || playLabel || c.owner_agent) && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {move && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${MOVE_TONE_CHIP[move.tone]}`}
              title="Suggested move"
            >
              {move.label}
            </span>
          )}
          {c.primary_venture && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-200 uppercase tracking-[0.1em]">
              {ventureDisplayName(c.primary_venture)}
            </span>
          )}
          {playLabel && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/65">
              {playLabel}
            </span>
          )}
          {c.owner_agent && (
            <span className="inline-flex items-center gap-1 text-[10px] text-white/45" title="Owner agent">
              <UserCircle2 size={10} />
              {c.owner_agent}
            </span>
          )}
        </div>
      )}
    </article>
  )
}
