import React, { useState } from 'react'
import { ExternalLink, Mic, X, CalendarPlus, Linkedin } from 'lucide-react'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import type { NellCandidate } from '../hooks/useNellCandidates'

interface Props {
  candidate: NellCandidate
}

const POD_LABEL: Record<string, string> = {
  'signal-and-noise': 'Signal & Noise',
  'builder-economy':  'Builder Economy',
}

/**
 * GuestCandidateCard — Krish hosting someone on his own podcast.
 * Distinct from VisibilityEventCard / PodcastTargetCard which are Krish
 * appearing on someone else's show.
 *
 * Schedule → creates a tasks row for Nell to run outreach.
 * Skip → soft-hides the candidate via skipped_at.
 */
export function GuestCandidateCard({ candidate: c }: Props) {
  const { toast } = useToast()
  const h = useHaptics()
  const [busy, setBusy] = useState<null | 'schedule' | 'skip'>(null)
  const [done, setDone]   = useState<null | 'scheduled' | 'skipped'>(null)

  const podLabel = c.podcast_target ? POD_LABEL[c.podcast_target] || c.podcast_target : null

  const schedule = async () => {
    h.heavy()
    setBusy('schedule')
    try {
      const r = await fetch(`/api/nell-candidates/${c.id}/schedule`, { method: 'POST' })
      if (!r.ok) throw new Error(String(r.status))
      h.success()
      toast(`Nell will reach out to ${c.name ?? 'this guest'}.`, 'success')
      setDone('scheduled')
    } catch {
      h.error()
      toast('Could not schedule — try again.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const skip = async () => {
    h.heavy()
    setBusy('skip')
    try {
      const r = await fetch(`/api/nell-candidates/${c.id}/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipped: true }),
      })
      if (!r.ok) throw new Error(String(r.status))
      h.success()
      toast('Skipped.', 'success')
      setDone('skipped')
    } catch {
      h.error()
      toast('Could not skip — try again.', 'error')
    } finally {
      setBusy(null)
    }
  }

  if (done) {
    return (
      <article className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 text-[12px] text-emerald-200/85">
        {done === 'scheduled'
          ? `Scheduled — Nell will reach out to ${c.name ?? 'this guest'}.`
          : `Skipped ${c.name ?? 'this guest'}.`}
      </article>
    )
  }

  return (
    <article className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-3 hover:border-rose-500/35 transition-colors">
      <header className="flex items-start gap-2 min-w-0">
        <Mic size={12} className="text-rose-300 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white leading-snug truncate">
            {c.name ?? 'Unnamed candidate'}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {podLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-200">
                {podLabel}
              </span>
            )}
            {c.signal_type && (
              <span className="text-[10px] text-white/45">{c.signal_type}</span>
            )}
          </div>
        </div>
        {typeof c.fit_score === 'number' && c.fit_score > 0 && (
          <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-200 flex-shrink-0">
            Fit {c.fit_score}
          </span>
        )}
      </header>

      {c.signal_description && (
        <p className="text-[11px] text-white/65 leading-snug mt-2 line-clamp-3">
          {c.signal_description}
        </p>
      )}

      {c.best_channel && (
        <p className="text-[11px] text-rose-200/75 mt-2">
          → Best channel: <span className="text-white/85">{c.best_channel}</span>
        </p>
      )}

      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); schedule() }}
          disabled={busy !== null}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-rose-500/30 text-rose-200 hover:bg-rose-500/15 disabled:opacity-40 transition-colors"
        >
          <CalendarPlus size={11} />
          {busy === 'schedule' ? 'Scheduling…' : 'Schedule with Nell'}
        </button>
        {c.linkedin_url && (
          <a
            href={c.linkedin_url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <Linkedin size={11} />
            LinkedIn
          </a>
        )}
        {c.source_url && (
          <a
            href={c.source_url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <ExternalLink size={11} />
            Source
          </a>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); skip() }}
          disabled={busy !== null}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.04] disabled:opacity-40 transition-colors ml-auto"
          title="Skip this candidate"
        >
          <X size={11} />
        </button>
      </div>
    </article>
  )
}
