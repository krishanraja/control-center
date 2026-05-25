import React, { useState } from 'react'
import { ExternalLink, Linkedin, Mail, X, CheckCircle2, Mic, Twitter } from 'lucide-react'
import { humanAge } from '../lib/ageHelpers'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import { FeedbackButton } from './shared/FeedbackButton'
import type { GuestRow, GuestStatus } from '../hooks/useRealtimeGuests'

const TARGET_LABEL: Record<GuestRow['podcast_target'], string> = {
  signal_noise: 'Signal & Noise',
  builder_economy: 'Builder Economy',
  either: 'Either show',
}

interface Props {
  guest: GuestRow
  onOpen?: (id: string) => void
}

export function GuestCard({ guest: g, onOpen }: Props) {
  const { toast } = useToast()
  const h = useHaptics()
  const [busy, setBusy] = useState<null | 'confirm' | 'drop' | GuestStatus>(null)

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

  return (
    <article className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 hover:border-white/[0.12] transition-colors">
      <header className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <button type="button" onClick={() => onOpen?.(g.id)} className="text-left w-full">
            <p className="text-[13px] font-semibold text-white leading-snug truncate">{g.name}</p>
            {g.one_liner && (
              <p className="text-[11px] text-white/55 leading-snug line-clamp-2">{g.one_liner}</p>
            )}
          </button>
        </div>
        <span className="text-[10px] tabular-nums text-white/35 flex-shrink-0">
          {humanAge(g.updated_at)}
        </span>
      </header>

      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-200 flex items-center gap-1">
          <Mic size={9} />
          {TARGET_LABEL[g.podcast_target]}
        </span>
        {g.quality_score && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-[0.1em] ${
            g.quality_score === 'green' ? 'bg-emerald-500/10 text-emerald-300' :
            g.quality_score === 'amber' ? 'bg-amber-500/10 text-amber-300' :
            'bg-rose-500/10 text-rose-300'
          }`}>
            {g.quality_score}
          </span>
        )}
        {typeof g.fit_score === 'number' && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-white/[0.06] text-white/55 tabular-nums">
            Fit {g.fit_score}
          </span>
        )}
        {typeof g.attainability_score === 'number' && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-white/[0.06] text-white/55 tabular-nums">
            Reach {g.attainability_score}
          </span>
        )}
      </div>

      {g.why_fit && (
        <p className="text-[11px] text-white/65 leading-snug mt-2 line-clamp-3">
          <span className="text-white/35">Why: </span>
          {g.why_fit}
        </p>
      )}

      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        {g.status === 'scheduled' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); confirmGuest() }}
            disabled={busy !== null}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-40 transition-colors"
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
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-violet-500/30 text-violet-200 hover:bg-violet-500/15 disabled:opacity-40 transition-colors"
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
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors"
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
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors"
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
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-violet-500/30 text-violet-200 hover:bg-violet-500/15 transition-colors"
            title="Draft an email via Cleo (lands in your Gmail Drafts)"
          >
            <Mail size={11} />
            Draft email
          </button>
        )}
        {g.personal_url && (
          <a
            href={g.personal_url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <ExternalLink size={11} />
            Site
          </a>
        )}
        <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
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
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.04] disabled:opacity-40 transition-colors"
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
