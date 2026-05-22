import React, { useState } from 'react'
import { ExternalLink, ThumbsUp, X, Linkedin, Mail, ArrowUpRight, Calendar, UserCog, Sparkles } from 'lucide-react'
import { humanAge } from '../lib/ageHelpers'
import { LeadSourcePill } from './LeadSourcePill'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import { FeedbackButton } from './shared/FeedbackButton'
import type { LeadRow, LeadStatus } from '../hooks/useRealtimeLeads'

const ASSIGNEE_OPTIONS = ['felix', 'maya', 'nell', 'krish'] as const

function plusDaysIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function overdueFollowUp(iso?: string | null): boolean {
  if (!iso) return false
  return new Date(iso).getTime() < Date.now()
}

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
type LeadActionState = LeadStatus | 'promote' | 'reassign' | 'follow_up' | 'deep_enrich'

export function LeadCard({ lead: l, onOpen }: Props) {
  const { toast } = useToast()
  const h = useHaptics()
  const [busy, setBusy] = useState<null | LeadActionState>(null)
  const [reassignOpen, setReassignOpen] = useState(false)
  const [followUpOpen, setFollowUpOpen] = useState(false)

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

  const patchLead = async (body: Record<string, unknown>) => {
    const r = await fetch(`/api/leads/${l.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(String(r.status))
  }

  const promote = async () => {
    h.heavy()
    setBusy('promote')
    try {
      const r = await fetch('/api/leads/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: l.id }),
      })
      if (!r.ok) throw new Error(String(r.status))
      h.success()
      toast('Promoted — task created.', 'success')
    } catch {
      h.error()
      toast('Could not promote — try again.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const reassign = async (agent: string) => {
    h.heavy()
    setBusy('reassign')
    setReassignOpen(false)
    try {
      await patchLead({ assignee_agent: agent })
      h.success()
      toast(`Reassigned to ${agent}.`, 'success')
    } catch {
      h.error()
      toast('Could not reassign — try again.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const scheduleFollowUp = async (days: number) => {
    h.heavy()
    setBusy('follow_up')
    setFollowUpOpen(false)
    try {
      await patchLead({ follow_up_at: plusDaysIso(days) })
      h.success()
      toast(`Follow up in ${days}d.`, 'success')
    } catch {
      h.error()
      toast('Could not schedule — try again.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const deepEnrich = async () => {
    h.heavy()
    setBusy('deep_enrich')
    try {
      const r = await fetch('/webhook/lead-deep-enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: l.id }),
      })
      if (!r.ok) throw new Error(String(r.status))
      h.success()
      toast('Agatha is enriching — refresh in ~30s.', 'success')
    } catch {
      h.error()
      toast('Could not trigger enrichment — try again.', 'error')
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

      {/* Venture + tag chips */}
      {(l.primary_venture || (l.tags && l.tags.length > 0)) && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {l.primary_venture && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-200 uppercase tracking-[0.1em]">
              {l.primary_venture.replace(/_/g, ' ')}
            </span>
          )}
          {(l.tags || [])
            .filter(t => t !== `${l.primary_venture}_buyer` && t !== `${l.primary_venture}_guest`)
            .slice(0, 4)
            .map(t => (
              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/55">
                {t.replace(/_/g, ' ')}
              </span>
            ))}
        </div>
      )}

      {/* Scoring chips: per-venture icp_scores when present, fall back to single icp_score */}
      {(l.fit_score != null || l.icp_score != null || (l.icp_scores && Object.keys(l.icp_scores).length > 0) || l.tier) && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {typeof l.fit_score === 'number' && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-300 tabular-nums">
              Fit {l.fit_score}
            </span>
          )}
          {l.icp_scores && Object.keys(l.icp_scores).length > 0
            ? Object.entries(l.icp_scores)
                .filter(([, score]) => typeof score === 'number' && score > 0)
                .sort((a, b) => Number(b[1]) - Number(a[1]))
                .slice(0, 3)
                .map(([slug, score]) => (
                  <span
                    key={slug}
                    className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-300 tabular-nums"
                    title={`${slug} ICP score`}
                  >
                    {slug.split('_').map(s => s[0]?.toUpperCase()).join('') || slug.slice(0, 2).toUpperCase()} {Number(score)}
                  </span>
                ))
            : typeof l.icp_score === 'number' && l.icp_score > 0 && (
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

      {l.follow_up_at && (
        <p className={`text-[11px] mt-2 leading-snug ${overdueFollowUp(l.follow_up_at) ? 'text-rose-300' : 'text-white/45'}`}>
          <Calendar size={10} className="inline mr-1" />
          {overdueFollowUp(l.follow_up_at)
            ? `Follow-up overdue (${humanAge(l.follow_up_at)})`
            : `Follow up ${humanAge(l.follow_up_at)}`}
        </p>
      )}

      {l.promoted_task_id && (
        <p className="text-[11px] text-emerald-300/80 mt-1.5">
          <ArrowUpRight size={10} className="inline mr-1" />
          Promoted to opportunity
        </p>
      )}
      {l.deep_enriched_at && (
        <p className="text-[10px] text-white/35 mt-1">
          <Sparkles size={9} className="inline mr-1" />
          Deep-enriched {humanAge(l.deep_enriched_at)}
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
        {!l.promoted_task_id && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); promote() }}
            disabled={busy !== null}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-40 transition-colors"
          >
            <ArrowUpRight size={11} />
            {busy === 'promote' ? 'Promoting…' : 'Promote'}
          </button>
        )}
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setReassignOpen(o => !o)}
            disabled={busy !== null}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
          >
            <UserCog size={11} />
            {l.assignee_agent ? `Reassign · ${l.assignee_agent}` : 'Assign'}
          </button>
          {reassignOpen && (
            <div className="absolute z-20 mt-1 left-0 rounded-md border border-white/10 bg-[#141416] shadow-2xl p-1 flex flex-col min-w-[110px]">
              {ASSIGNEE_OPTIONS.filter(a => a !== l.assignee_agent).map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => reassign(a)}
                  className="text-left px-2 py-1 rounded text-[11px] text-white/75 hover:bg-white/[0.06]"
                >
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setFollowUpOpen(o => !o)}
            disabled={busy !== null}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
          >
            <Calendar size={11} />
            Follow-up
          </button>
          {followUpOpen && (
            <div className="absolute z-20 mt-1 left-0 rounded-md border border-white/10 bg-[#141416] shadow-2xl p-1 flex gap-1">
              {[1, 3, 7, 14].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => scheduleFollowUp(d)}
                  className="text-left px-2 py-1 rounded text-[11px] text-white/75 hover:bg-white/[0.06] tabular-nums"
                >
                  {d}d
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); deepEnrich() }}
          disabled={busy !== null || l.deep_enriched_at != null}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-amber-500/30 text-amber-200 hover:bg-amber-500/15 disabled:opacity-40 transition-colors"
          title={l.deep_enriched_at ? 'Already deep-enriched' : 'Send to Agatha for deeper enrichment'}
        >
          <Sparkles size={11} />
          {busy === 'deep_enrich' ? 'Enriching…' : 'Deep enrich'}
        </button>
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
        <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
          <FeedbackButton
            sourceTable="leads"
            sourceId={l.id}
            agentId={l.assignee_agent || 'felix'}
            compact
          />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setStatus('superseded') }}
            disabled={busy !== null}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.04] disabled:opacity-40 transition-colors"
            title="Drop this lead"
          >
            <X size={11} />
          </button>
        </div>
      </div>
    </article>
  )
}
