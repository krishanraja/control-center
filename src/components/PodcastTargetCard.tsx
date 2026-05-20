import React from 'react'
import { ExternalLink, Mic, Headphones, Sparkles, Mail } from 'lucide-react'
import type { PodchaserPodcast } from '../hooks/usePodchaserPodcasts'

interface Props {
  podcast: PodchaserPodcast
}

/**
 * Podcast target card for the Visibility lane — Podchaser-sourced shows
 * Nova found that match the Mindmaker ICP. Mirrors the visual language of
 * VisibilityEventCard so the lane reads as one surface; differs only in
 * the host + listen-url + latest-episode chip + pitch CTA.
 */
export function PodcastTargetCard({ podcast: p }: Props) {
  const latestAge =
    p.latest_episode_date
      ? humanAgo(p.latest_episode_date)
      : null

  const freshnessTone =
    latestAge && p.latest_episode_date
      ? ageTone(p.latest_episode_date)
      : 'text-white/40 border-white/[0.08] bg-white/[0.02]'

  return (
    <article className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-3.5 hover:border-rose-500/35 transition-colors">
      <header className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-white leading-snug flex items-center gap-1.5">
            <Mic size={11} className="text-rose-300 flex-shrink-0" />
            <span className="truncate">{p.title}</span>
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {p.author && (
              <span className="inline-flex items-center text-[10px] text-white/55">
                Host: <span className="text-white/75 ml-1">{p.author}</span>
              </span>
            )}
            {typeof p.number_of_episodes === 'number' && p.number_of_episodes > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-white/55">
                <Headphones size={10} />
                {p.number_of_episodes.toLocaleString()} eps
              </span>
            )}
            {typeof p.fit_score === 'number' && p.fit_score > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-200 tabular-nums">
                Fit {p.fit_score}
              </span>
            )}
          </div>
        </div>
        {latestAge && (
          <span className={`text-[10px] tabular-nums px-2 py-0.5 rounded-full border ${freshnessTone} flex-shrink-0`}>
            Latest {latestAge}
          </span>
        )}
      </header>

      {p.latest_episode_title && (
        <p className="text-[11.5px] text-white/65 leading-snug mt-3 truncate">
          → {p.latest_episode_title}
        </p>
      )}

      {p.why_relevant && (
        <p className="text-[12px] text-white/75 leading-snug mt-3">
          <Sparkles size={10} className="inline mr-1 text-rose-300" />
          <span className="text-white/40">Why: </span>
          {p.why_relevant}
        </p>
      )}

      {p.recommended_next_step && (
        <p className="text-[12px] text-rose-200/85 mt-2 leading-snug">
          → {p.recommended_next_step}
        </p>
      )}

      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        {p.web_url && (
          <a
            href={p.web_url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-rose-500/30 text-rose-200 hover:bg-rose-500/15 transition-colors"
          >
            <ExternalLink size={11} />
            Listen
          </a>
        )}
        {p.host_email && (
          <a
            href={`mailto:${p.host_email}`}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <Mail size={11} />
            Pitch host
          </a>
        )}
        {p.host_linkedin && !p.host_email && (
          <a
            href={p.host_linkedin}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <ExternalLink size={11} />
            Host LinkedIn
          </a>
        )}
      </div>
    </article>
  )
}

function humanAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  const d = Math.floor(ms / 86_400_000)
  if (d < 1) return 'today'
  if (d < 7) return `${d}d ago`
  if (d < 60) return `${Math.floor(d / 7)}w ago`
  return `${Math.floor(d / 30)}mo ago`
}

function ageTone(iso: string): string {
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000
  if (days < 14) return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
  if (days < 60) return 'text-amber-300 bg-amber-500/10 border-amber-500/30'
  return 'text-white/40 bg-white/[0.02] border-white/[0.08]'
}
