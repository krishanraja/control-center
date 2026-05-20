import React from 'react'
import {
  ExternalLink, Calendar, Users, MapPin, DollarSign, Globe2, Sparkles,
} from 'lucide-react'
import type { NovaConferenceRow } from '../hooks/useNovaConferences'

interface Props {
  conference: NovaConferenceRow
}

/**
 * Visibility event card — what "Submit proposal: AI Summit London" should
 * have been all along. Shows audience size, deadline countdown, format,
 * location, why-relevant, recommended next step, and a primary CTA to the
 * CFP page.
 *
 * Falls back gracefully when Nova hasn't enriched a row yet — only fields
 * that exist are rendered, so unenriched legacy rows still look reasonable.
 */
export function VisibilityEventCard({ conference: c }: Props) {
  const daysToDeadline = c.deadline_at
    ? Math.ceil((new Date(c.deadline_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null

  const deadlineTone =
    daysToDeadline === null ? '' :
    daysToDeadline < 0 ? 'text-rose-300 bg-rose-500/10 border-rose-500/30' :
    daysToDeadline <= 14 ? 'text-amber-300 bg-amber-500/10 border-amber-500/30' :
    'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'

  const deadlineLabel =
    daysToDeadline === null ? null :
    daysToDeadline < 0 ? `CFP closed ${Math.abs(daysToDeadline)}d ago` :
    daysToDeadline === 0 ? 'CFP closes today' :
    `CFP closes in ${daysToDeadline}d`

  const formatLabel: Record<string, string> = {
    in_person: 'in-person',
    hybrid: 'hybrid',
    online: 'online',
  }

  const primaryCta = c.cfp_url || c.url || c.speaker_page_url || null

  return (
    <article className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-3.5 hover:border-violet-500/35 transition-colors">
      <header className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-white leading-snug">{c.name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {c.format && (
              <span className="inline-flex items-center gap-1 text-[10px] text-white/55">
                <Globe2 size={10} />
                {formatLabel[c.format] || c.format}
              </span>
            )}
            {c.location && (
              <span className="inline-flex items-center gap-1 text-[10px] text-white/55">
                <MapPin size={10} />
                {c.location}
              </span>
            )}
            {typeof c.relevance_score === 'number' && c.relevance_score > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-200 tabular-nums">
                Fit {c.relevance_score}
              </span>
            )}
          </div>
        </div>
        {deadlineLabel && (
          <span className={`text-[10px] tabular-nums px-2 py-0.5 rounded-full border ${deadlineTone} flex-shrink-0`}>
            {deadlineLabel}
          </span>
        )}
      </header>

      <div className="grid grid-cols-2 gap-2 mt-3">
        {(c.audience_size || c.audience_description) && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-white/35 mb-0.5">
              <Users size={9} className="inline mr-1" />
              Audience
            </p>
            <p className="text-[11px] text-white/75 leading-snug">
              {c.audience_size != null && (
                <span className="font-semibold tabular-nums">{c.audience_size.toLocaleString()}+ </span>
              )}
              {c.audience_description || (c.audience_size ? 'attendees' : '—')}
            </p>
          </div>
        )}
        {(c.ticket_price_usd != null || c.event_start_at) && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-white/35 mb-0.5">
              <Calendar size={9} className="inline mr-1" />
              When
            </p>
            <p className="text-[11px] text-white/75 leading-snug">
              {c.event_start_at
                ? new Date(c.event_start_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                : '—'}
              {c.ticket_price_usd != null && (
                <span className="text-white/45 ml-1">
                  · <DollarSign size={9} className="inline" />{c.ticket_price_usd.toLocaleString()}
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {c.why_relevant && (
        <p className="text-[12px] text-white/75 leading-snug mt-3">
          <Sparkles size={10} className="inline mr-1 text-violet-300" />
          <span className="text-white/40">Why: </span>
          {c.why_relevant}
        </p>
      )}

      {c.recommended_next_step && (
        <p className="text-[12px] text-violet-200/85 mt-2 leading-snug">
          → {c.recommended_next_step}
        </p>
      )}

      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        {primaryCta && (
          <a
            href={primaryCta}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-violet-500/30 text-violet-200 hover:bg-violet-500/15 transition-colors"
          >
            <ExternalLink size={11} />
            {c.cfp_url ? 'Open CFP' : 'Open event'}
          </a>
        )}
        {c.speaker_page_url && c.speaker_page_url !== primaryCta && (
          <a
            href={c.speaker_page_url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <ExternalLink size={11} />
            Speakers
          </a>
        )}
      </div>
    </article>
  )
}
