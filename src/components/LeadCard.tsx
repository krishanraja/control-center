import React, { useState } from 'react'
import { ExternalLink, ThumbsUp, X, Linkedin, Mail } from 'lucide-react'
import { humanAge } from '../lib/ageHelpers'
import { LeadSourcePill } from './LeadSourcePill'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import type { LeadRow, LeadStatus } from '../hooks/useRealtimeLeads'

interface Props {
  lead: LeadRow
  onOpen?: (id: string) => void
}

/**
 * Lead card — the unit of action on the Leads tab. Shows:
 *   • Who they are (name · company · title)
 *   • Provenance chip (source pill, deep-links to origin)
 *   • Why-relevant one-liner (the single biggest gap on the old Visibility cards)
 *   • Fit / ICP / tier chips when present
 *   • Primary CTA (Mark contacted), secondary (LinkedIn, Email, Drop)
 *
 * Status changes write through /api/leads/:id which updates Supabase; the
 * realtime subscription animates the card to its new lane.
 */
export function LeadCard({ lead: l, onOpen }: Props) {
  const { toast } = useToast()
  const h = useHaptics()
  const [busy, setBusy] = useState<null | LeadStatus>(null)

  const setStatus = async (next: LeadStatus) => {
    h.heavy()
    setBusy(next)
    try {
      const r = await fetch(`/api/leads/${l.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const labels: Partial<Record<LeadStatus, string>> = {
        contacted: 'Marked contacted.',
        superseded: 'Dropped.',
        ready: 'Marked ready.',
      }
      h.success()
      toast(labels[next] || 'Updated.', 'success')
    } catch {
      h.error()
      toast('Could not update lead — try again.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const fullName = l.full_name || (l.email ? l.email.split('@')[0] : 'Unnamed')
  const subtitleParts = [l.title, l.company].filter(Boolean) as string[]
  const subtitle = subtitleParts.join(' · ')

  return (
    <article className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 hover:border-white/[0.12] transition-colors">
      <header className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => onOpen?.(l.id)}
            className="text-left w-full"
          >
            <p className="text-[13px] font-semibold text-white leading-snug truncate">{fullName}</p>
            {subtitle && (
              <p className="text-[11px] text-white/55 leading-snug truncate">{subtitle}</p>
            )}
          </button>
        </div>
        <span className="text-[10px] tabular-nums text-white/35 flex-shrink-0">
          {humanAge(l.updated_at)}
        </span>
      </header>

      {/* Provenance row */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <LeadSourcePill source={l.source_type} href={l.source_url || null} />
        {l.source_document_name && (
          <span className="text-[10px] text-white/45 truncate max-w-[160px]" title={l.source_document_name}>
            {l.source_document_name}
          </span>
        )}
      </div>

      {l.why_relevant && (
        <p className="text-[11px] text-white/65 leading-snug mt-2 line-clamp-3">
          <span className="text-white/35">Why: </span>
          {l.why_relevant}
        </p>
      )}

      {/* Scoring + tier chips */}
      {(l.fit_score != null || l.icp_score != null || l.tier) && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {typeof l.fit_score === 'number' && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-300 tabular-nums">
              Fit {l.fit_score}
            </span>
          )}
          {typeof l.icp_score === 'number' && l.icp_score > 0 && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-300 tabular-nums">
              ICP {l.icp_score}
            </span>
          )}
          {l.tier && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-white/[0.06] text-white/55 uppercase tracking-[0.1em]">
              {l.tier}
            </span>
          )}
        </div>
      )}

      {l.next_step && (
        <p className="text-[11px] text-violet-200/80 mt-2 leading-snug">
          → {l.next_step}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        {l.status !== 'contacted' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setStatus('contacted') }}
            disabled={busy !== null}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-violet-500/30 text-violet-200 hover:bg-violet-500/15 disabled:opacity-40 transition-colors"
          >
            <ThumbsUp size={11} />
            Mark contacted
          </button>
        )}
        {l.linkedin_url && (
          <a
            href={l.linkedin_url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <Linkedin size={11} />
            LinkedIn
          </a>
        )}
        {l.email && (
          <a
            href={`mailto:${l.email}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <Mail size={11} />
            Email
          </a>
        )}
        {l.source_url && (
          <a
            href={l.source_url}
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
          onClick={(e) => { e.stopPropagation(); setStatus('superseded') }}
          disabled={busy !== null}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.04] disabled:opacity-40 transition-colors ml-auto"
          title="Drop this lead"
        >
          <X size={11} />
        </button>
      </div>
    </article>
  )
}
