import React, { useState } from 'react'
import {
  ExternalLink, Calendar, Users, MapPin, DollarSign, Globe2, Sparkles, Mic, Newspaper, Megaphone,
  Check, X, Loader2, Wand2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { FeedbackButton } from './shared/FeedbackButton'
import { EnrichSheet, type EnrichTarget } from './EnrichSheet'
import { useToast } from './shared/Toast'
import type { VisibilityTargetRow, VisibilityTargetType } from '../hooks/useVisibilityTargets'

interface Props {
  target: VisibilityTargetRow
  onOpen?: (id: string) => void
}

const TYPE_META: Record<string, { label: string; Icon: LucideIcon }> = {
  cfp:                { label: 'CFP',                Icon: Megaphone },
  conference:         { label: 'Conference',         Icon: Globe2 },
  podcast:            { label: 'Podcast',            Icon: Mic },
  newsletter:         { label: 'Newsletter',         Icon: Newspaper },
  guest_appearance:   { label: 'Appearance',         Icon: Mic },
  press_relationship: { label: 'Press relationship', Icon: Newspaper },
  speaking:           { label: 'Speaking',           Icon: Mic },
  other:              { label: 'Other',              Icon: Globe2 },
}

function isStubTarget(t: VisibilityTargetRow): boolean {
  if (!t.deep_enriched_at) return true
  const why = t.why_relevant || ''
  return why.startsWith('Migrated from tasks row')
}

/**
 * Visibility target card. Replaces VisibilityEventCard. Reads from the new
 * visibility_targets table (PR 4), which carries event_url + cfp_url +
 * deadline + audience + why_relevant + suggested_talk_title on every row.
 */
export function VisibilityTargetCard({ target: t, onOpen }: Props) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<null | 'apply' | 'pass' | 'enrich'>(null)
  const [enrichTarget, setEnrichTarget] = useState<EnrichTarget | null>(null)

  const openEnrich = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEnrichTarget({
      id: t.id,
      name: t.title,
      subtitle: [t.type?.replace(/_/g, ' '), t.location].filter(Boolean).join(' · ') || null,
      kind: 'event',
      endpoint: `/api/visibility-targets/${t.id}/enrich-deep`,
      existingBrief: ((t as any).raw_data?.direct_research?.summary as string) || null,
    })
  }
  const daysToDeadline = t.deadline_at
    ? Math.ceil((new Date(t.deadline_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null

  const stub = isStubTarget(t)
  // Decision pair only renders for `queued` rows (Nova-enriched, awaiting
  // Krish's apply/pass call). Mirrors the per-lead Enrich/Skip pattern.
  const decisionPair = t.status === 'queued'

  const decide = async (e: React.MouseEvent, next: 'applied' | 'dropped') => {
    e.stopPropagation()
    if (busy) return
    setBusy(next === 'applied' ? 'apply' : 'pass')
    try {
      const r = await fetch(`/api/visibility-targets/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      toast(next === 'applied' ? 'Marked applied — track the reply.' : 'Passed. Vera will learn.', 'success')
    } catch (err: any) {
      toast(`Could not update: ${err?.message || 'try again'}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  const enrich = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    setBusy('enrich')
    try {
      const r = await fetch(`/api/visibility-targets/${t.id}/enrich-deep`, { method: 'POST' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      toast('Enrich queued — Nova will refresh the card.', 'success')
    } catch (err: any) {
      toast(`Could not enrich: ${err?.message || 'try again'}`, 'error')
    } finally {
      // Realtime + 60s poll will refresh; keep the spinner visible briefly
      // so the user knows the click registered.
      setTimeout(() => setBusy(null), 4000)
    }
  }

  const deadlineTone =
    daysToDeadline === null ? '' :
    daysToDeadline < 0 ? 'text-rose-300 bg-rose-500/10 border-rose-500/30' :
    daysToDeadline <= 14 ? 'text-amber-300 bg-amber-500/10 border-amber-500/30' :
    'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'

  const deadlineLabel =
    daysToDeadline === null ? null :
    daysToDeadline < 0 ? `Deadline ${Math.abs(daysToDeadline)}d ago` :
    daysToDeadline === 0 ? 'Deadline today' :
    `Deadline in ${daysToDeadline}d`

  const formatLabel: Record<string, string> = {
    in_person: 'in-person',
    hybrid: 'hybrid',
    online: 'online',
  }

  const primaryCta = t.cfp_url || t.event_url || t.source_url || null
  const primaryCtaLabel = t.cfp_url
    ? 'Open CFP'
    : t.event_url
      ? 'Open event'
      : t.type === 'press_relationship'
        ? 'Open profile'
        : 'View source'
  const meta = TYPE_META[t.type] || TYPE_META.other
  const TypeIcon = meta.Icon

  return (
    <article
      className={`rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-3.5 hover:border-violet-500/35 transition-colors ${onOpen ? 'cursor-pointer' : ''}`}
      onClick={onOpen ? () => onOpen(t.id) : undefined}
    >
      <header className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-white leading-snug">{t.title}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-200">
              <TypeIcon size={10} />
              {meta.label}
            </span>
            {t.format && (
              <span className="inline-flex items-center gap-1 text-[10px] text-white/55">
                <Globe2 size={10} />
                {formatLabel[t.format] || t.format}
              </span>
            )}
            {t.location && (
              <span className="inline-flex items-center gap-1 text-[10px] text-white/55">
                <MapPin size={10} />
                {t.location}
              </span>
            )}
            {typeof t.relevance_score === 'number' && t.relevance_score > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-200 tabular-nums">
                Fit {t.relevance_score}
              </span>
            )}
            {t.quality_score && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-[0.1em] ${
                t.quality_score === 'green' ? 'bg-emerald-500/10 text-emerald-300' :
                t.quality_score === 'amber' ? 'bg-amber-500/10 text-amber-300' :
                'bg-rose-500/10 text-rose-300'
              }`}>
                {t.quality_score}
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
        {(t.audience_size || t.audience) && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-white/35 mb-0.5">
              <Users size={9} className="inline mr-1" />
              Audience
            </p>
            <p className="text-[11px] text-white/75 leading-snug">
              {t.audience_size != null && (
                <span className="font-semibold tabular-nums">{t.audience_size.toLocaleString()}+ </span>
              )}
              {t.audience || (t.audience_size ? 'attendees' : '·')}
            </p>
          </div>
        )}
        {(t.ticket_price_usd != null || t.event_start_at) && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-white/35 mb-0.5">
              <Calendar size={9} className="inline mr-1" />
              When
            </p>
            <p className="text-[11px] text-white/75 leading-snug">
              {t.event_start_at
                ? new Date(t.event_start_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                : '·'}
              {t.ticket_price_usd != null && (
                <span className="text-white/45 ml-1">
                  · <DollarSign size={9} className="inline" />{t.ticket_price_usd.toLocaleString()}
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {t.why_relevant && (
        <p className="text-[12px] text-white/75 leading-snug mt-3">
          <Sparkles size={10} className="inline mr-1 text-violet-300" />
          <span className="text-white/40">Why: </span>
          {t.why_relevant}
        </p>
      )}

      {t.suggested_talk_title && (
        <p className="text-[12px] text-white/85 leading-snug mt-2">
          <span className="text-white/40">Pitch: </span>
          <span className="italic">{t.suggested_talk_title}</span>
        </p>
      )}

      {t.recommended_next_step && (
        <p className="text-[12px] text-violet-200/85 mt-2 leading-snug">
          → {t.recommended_next_step}
        </p>
      )}

      {decisionPair && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-500/[0.04] p-2">
          {stub ? (
            <button
              type="button"
              onClick={openEnrich}
              disabled={busy !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-violet-500/90 text-white hover:bg-violet-400 disabled:opacity-40 transition-colors"
              title="Research this — Nova deep enrich (n8n) or direct (web + Cleo)"
            >
              {busy === 'enrich' ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
              Enrich
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => decide(e, 'applied')}
              disabled={busy !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-amber-500/90 text-black hover:bg-amber-400 disabled:opacity-40 transition-colors"
              title="Mark applied — moves to Applied lane"
            >
              {busy === 'apply' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Apply
            </button>
          )}
          <button
            type="button"
            onClick={(e) => decide(e, 'dropped')}
            disabled={busy !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border border-white/15 text-white/75 hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
            title="Pass — Vera learns from the drop"
          >
            {busy === 'pass' ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
            Pass
          </button>
          <span className="text-[10px] text-white/45 ml-auto">
            {stub ? 'Enrich first to see context.' : 'Nova enriched it — your call.'}
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        {primaryCta && (
          <a
            href={primaryCta}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-violet-500/30 text-violet-200 hover:bg-violet-500/15 transition-colors"
          >
            <ExternalLink size={11} />
            {primaryCtaLabel}
          </a>
        )}
        {t.cfp_url && t.event_url && t.event_url !== t.cfp_url && (
          <a
            href={t.event_url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <ExternalLink size={11} />
            Event page
          </a>
        )}
        <div className="ml-auto" onClick={(e) => e.stopPropagation()}>
          <FeedbackButton
            sourceTable="visibility_targets"
            sourceId={t.id}
            agentId="nova"
            compact
          />
        </div>
      </div>

      <EnrichSheet target={enrichTarget} onClose={() => setEnrichTarget(null)} />
    </article>
  )
}
