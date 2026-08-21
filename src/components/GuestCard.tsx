import React, { useState } from 'react'
import { ExternalLink, Linkedin, Mail, X, CheckCircle2, Mic, Twitter, FileText } from 'lucide-react'
import { humanAge } from '../lib/ageHelpers'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import { FeedbackButton } from './shared/FeedbackButton'
import { buildLookupLinks } from '../lib/lookupLinks'
import type { GuestRow, GuestStatus } from '../hooks/useRealtimeGuests'
import { WhyBadge } from './shared/WhyBadge'

const TARGET_LABEL: Record<GuestRow['podcast_target'], string> = {
  signal_noise: 'Signal & Noise',
  builder_economy: 'Builder Economy (retired)',
  either: 'Either show',
}

// Guests in these statuses are worth a full Speaker Briefing spend.
const BRIEFABLE: ReadonlySet<GuestStatus> = new Set<GuestStatus>(['enriched', 'recorded', 'published'])

// Pre-spend triage band: >=70 green "Strong", 45-69 amber "Maybe", <45 grey "Skip".
function triageBand(score: number): { label: string; cls: string } {
  if (score >= 70) return { label: 'Strong', cls: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/25' }
  if (score >= 45) return { label: 'Maybe', cls: 'bg-amber-500/12 text-amber-300 border-amber-500/25' }
  return { label: 'Skip', cls: 'bg-white/[0.05] text-white/45 border-white/10' }
}

interface Props {
  guest: GuestRow
  onOpen?: (id: string) => void
}

export function GuestCard({ guest: g, onOpen }: Props) {
  const { toast } = useToast()
  const h = useHaptics()
  const [busy, setBusy] = useState<null | 'confirm' | 'drop' | 'briefing' | GuestStatus>(null)

  const patchStatus = async (next: GuestStatus) => {
    h.heavy()
    setBusy(next)
    try {
      const r = await fetch(`/api/guests/${g.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!r.ok) throw new Error(String(r.status))
      h.success()
      toast(`Marked ${next}.`, 'success')
    } catch {
      h.error()
      toast('Could not update guest , try again.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const confirmGuest = async () => {
    h.heavy()
    setBusy('confirm')
    try {
      const r = await fetch('/api/guests/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guest_id: g.id }),
      })
      if (!r.ok) throw new Error(String(r.status))
      h.success()
      toast('Confirmed , cascade fired (prep, recording, promo drafts, email, follow-up).', 'success')
    } catch {
      h.error()
      toast('Could not confirm , try again.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const generateBriefing = async (force = false) => {
    h.heavy()
    setBusy('briefing')
    try {
      const r = await fetch(`/api/guests/${g.id}/briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`)
      h.success()
      toast('Briefing generating, Doc lands in ~60 to 120s.', 'success')
    } catch (err: any) {
      h.error()
      toast(`Could not start briefing: ${err?.message || 'try again'}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  const briefable = BRIEFABLE.has(g.status)

  return (
    <article className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 hover:border-white/[0.12] transition-colors">
      <header className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <button type="button" onClick={() => onOpen?.(g.id)} className="text-left w-full">
            <p className="text-body font-semibold text-white leading-snug truncate">{g.name}</p>
            {g.one_liner && (
              <p className="text-micro text-white/55 leading-snug line-clamp-2">{g.one_liner}</p>
            )}
          </button>
        </div>
        <span className="text-micro tabular-nums text-white/35 flex-shrink-0">
          {humanAge(g.updated_at)}
        </span>
      </header>

      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {typeof g.triage_score === 'number' && (() => {
          const band = triageBand(g.triage_score)
          return (
            <span
              className={`text-micro px-1.5 py-0.5 rounded border tabular-nums flex items-center gap-1 ${band.cls}`}
              title={g.triage_reason || 'Pre-spend triage signal'}
            >
              {band.label} {g.triage_score}
            </span>
          )
        })()}
        <span className="text-micro px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-200 flex items-center gap-1">
          <Mic size={9} />
          {TARGET_LABEL[g.podcast_target]}
        </span>
        {g.quality_score && (
          <span className={`text-micro px-1.5 py-0.5 rounded uppercase tracking-[0.14em] ${
            g.quality_score === 'green' ? 'bg-emerald-500/10 text-emerald-300' :
            g.quality_score === 'amber' ? 'bg-amber-500/10 text-amber-300' :
            'bg-rose-500/10 text-rose-300'
          }`}>
            {g.quality_score}
          </span>
        )}
        {typeof g.fit_score === 'number' && (
          <span className="text-micro px-1 py-0.5 rounded bg-white/[0.06] text-white/55 tabular-nums">
            Fit {g.fit_score}
          </span>
        )}
        {typeof g.attainability_score === 'number' && (
          <span className="text-micro px-1 py-0.5 rounded bg-white/[0.06] text-white/55 tabular-nums">
            Reach {g.attainability_score}
          </span>
        )}
      </div>

      {g.why_fit && (
        <p className="text-micro text-white/65 leading-snug mt-2 line-clamp-3">
          <span className="text-white/35">Why: </span>
          {g.why_fit}
        </p>
      )}

      {g.triage_reason && (
        <p className="text-micro text-white/45 leading-snug mt-1.5 line-clamp-2">
          <span className="text-white/30">Triage: </span>
          {g.triage_reason}
        </p>
      )}

      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        {g.status === 'scheduled' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); confirmGuest() }}
            disabled={busy !== null}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-micro font-medium border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-40 transition-colors"
          >
            <CheckCircle2 size={11} />
            {busy === 'confirm' ? 'Confirming…' : 'Confirm recording'}
          </button>
        )}
        {g.status !== 'pitched' && g.status !== 'scheduled' && g.status !== 'confirmed' && g.status !== 'recorded' && g.status !== 'published' && g.status !== 'dropped' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); patchStatus('pitched') }}
            disabled={busy !== null}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-micro font-medium border border-violet-500/30 text-violet-200 hover:bg-violet-500/15 disabled:opacity-40 transition-colors"
          >
            Mark pitched
          </button>
        )}
        {g.linkedin_url && (
          <a
            href={g.linkedin_url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-micro font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <Linkedin size={11} />
            LinkedIn
          </a>
        )}
        {g.twitter_handle && (
          <a
            href={`https://x.com/${g.twitter_handle.replace(/^@/, '')}`}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-micro font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <Twitter size={11} />
            X
          </a>
        )}
        {g.email && (
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation()
              h.heavy()
              try {
                const r = await fetch(`/api/guests/${g.id}/draft-email`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ intent: 'podcast_invite' }),
                })
                const body = await r.json().catch(() => ({}))
                if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`)
                h.success()
                toast('Draft created in Gmail.', 'success')
                if (body?.draft_url) {
                  try { window.open(body.draft_url, '_blank', 'noreferrer,noopener') } catch {}
                }
              } catch (err: any) {
                h.error()
                toast(`Could not draft email: ${err?.message || 'try again'}`, 'error')
              }
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-micro font-medium border border-violet-500/30 text-violet-200 hover:bg-violet-500/15 transition-colors"
            title="Draft an email via Cleo (lands in your Gmail Drafts)"
          >
            <Mail size={11} />
            Draft email
          </button>
        )}
        {briefable && (
          g.briefing_doc_url && g.briefing_status === 'ready' ? (
            <>
              <a
                href={g.briefing_doc_url}
                target="_blank"
                rel="noreferrer noopener"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-micro font-medium border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/15 transition-colors"
                title="Open the Speaker Briefing Google Doc"
              >
                <FileText size={11} />
                View briefing
              </a>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); generateBriefing(true) }}
                disabled={busy !== null}
                className="text-micro text-white/40 hover:text-white/70 disabled:opacity-40 transition-colors"
                title="Regenerate the briefing (updates the same Doc)"
              >
                {busy === 'briefing' ? 'Regenerating…' : 'Regenerate'}
              </button>
            </>
          ) : g.briefing_status === 'failed' ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); generateBriefing(true) }}
              disabled={busy !== null}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-micro font-medium border border-amber-500/30 text-amber-200 hover:bg-amber-500/15 disabled:opacity-40 transition-colors"
              title="Retry the Speaker Briefing"
            >
              <FileText size={11} />
              Retry briefing
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); generateBriefing(false) }}
              disabled={busy !== null || g.briefing_status === 'generating'}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-micro font-medium border border-violet-500/30 text-violet-200 hover:bg-violet-500/15 disabled:opacity-40 transition-colors"
              title="Generate a 10/10 Speaker Briefing Doc via Nell"
            >
              <FileText size={11} />
              {busy === 'briefing' || g.briefing_status === 'generating' ? 'Briefing…' : 'Generate briefing'}
            </button>
          )
        )}
        {g.personal_url && (
          <a
            href={g.personal_url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-micro font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <ExternalLink size={11} />
            Site
          </a>
        )}
        {/* Always-on lookups so you can research them even with no stored URLs —
            LinkedIn search suppressed when a real LinkedIn link is already shown. */}
        {buildLookupLinks(g.name)
          .filter(l => !(l.label === 'LinkedIn' && g.linkedin_url))
          .map(l => (
            <a
              key={`lookup-${l.label}`}
              href={l.href}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-micro font-medium border border-white/10 text-white/55 hover:bg-white/[0.06] hover:text-white/80 transition-colors"
            >
              {l.icon}
              {l.label}
            </a>
          ))}
        <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
          <WhyBadge table="guests" row={g} />
          <FeedbackButton
            sourceTable="guests"
            sourceId={g.id}
            agentId="nell"
            compact
          />
          {g.status !== 'dropped' && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); patchStatus('dropped') }}
              disabled={busy !== null}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-micro font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.04] disabled:opacity-40 transition-colors"
              title="Drop this guest"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
