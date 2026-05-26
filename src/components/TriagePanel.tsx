import React, { useState } from 'react'
import { ThumbsUp, ThumbsDown, ExternalLink, Mic, UserPlus, FileText, Target } from 'lucide-react'
import { useTriageQueue, type TriageRow, type TriageKind } from '../hooks/useTriageQueue'
import { useHaptics } from '../hooks/useHaptics'
import { useToast } from './shared/Toast'

const KIND_ICON: Record<TriageKind, typeof Mic> = {
  content_idea: FileText,
  lead: UserPlus,
  visibility: Target,
  guest: Mic,
}

const KIND_LABEL: Record<TriageKind, string> = {
  content_idea: 'Idea',
  lead: 'Lead',
  visibility: 'Visibility',
  guest: 'Guest',
}

const REASON_OPTS: Record<TriageKind, Array<{ code: string; label: string }>> = {
  content_idea: [
    { code: 'content_too_generic', label: 'Too generic' },
    { code: 'content_not_my_voice', label: 'Not my voice' },
    { code: 'content_old_news', label: 'Old news' },
    { code: 'content_wrong_venture', label: 'Wrong venture' },
    { code: 'content_other', label: 'Other' },
  ],
  lead: [
    { code: 'lead_wrong_seniority', label: 'Wrong seniority' },
    { code: 'lead_wrong_company_size', label: 'Wrong company size' },
    { code: 'lead_no_budget_signal', label: 'No real budget signal' },
    { code: 'lead_already_contacted', label: 'Already contacted' },
    { code: 'lead_other', label: 'Other' },
  ],
  visibility: [
    { code: 'visibility_wrong_audience', label: 'Wrong audience' },
    { code: 'visibility_bad_timing', label: 'Bad timing' },
    { code: 'visibility_too_low_tier', label: 'Too low tier' },
    { code: 'visibility_other', label: 'Other' },
  ],
  guest: [
    { code: 'guest_wrong_show', label: 'Wrong show' },
    { code: 'guest_not_a_builder', label: 'Not actually a builder/operator' },
    { code: 'guest_other', label: 'Other' },
  ],
}

interface Props {
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

export function TriagePanel({ onNavigate }: Props) {
  const { rows, loading } = useTriageQueue()
  const { toast } = useToast()
  const h = useHaptics()
  const [busy, setBusy] = useState<string | null>(null)
  const [openReason, setOpenReason] = useState<string | null>(null)
  const [reasonText, setReasonText] = useState('')

  const promote = async (row: TriageRow) => {
    if (busy) return
    setBusy(row.id)
    h.tap()
    try {
      const r = await fetch('/api/triage/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_table: row.source_table, source_id: row.id, agent: row.agent }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      h.success()
      toast('Accepted. Moved to Today.', 'success')
    } catch (e) {
      h.error()
      toast(`Could not accept: ${(e as Error).message}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  const reject = async (row: TriageRow, reasonCode: string | null) => {
    if (busy) return
    setBusy(row.id)
    h.tap()
    try {
      const r = await fetch('/api/triage/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_table: row.source_table,
          source_id: row.id,
          agent: row.agent,
          reason_code: reasonCode,
          reason_text: reasonText.trim() || null,
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      h.success()
      toast('Rejected. Vera will learn from this.', 'success')
      setOpenReason(null)
      setReasonText('')
    } catch (e) {
      h.error()
      toast(`Could not reject: ${(e as Error).message}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  if (loading && rows.length === 0) {
    return (
      <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <p className="text-[12px] text-white/45">Loading triage queue…</p>
      </section>
    )
  }

  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <p className="text-[16px] text-white/85 font-semibold mb-1">Triage zero.</p>
        <p className="text-[13px] text-white/50">No agent suggestions waiting. They'll show up here as agents propose new content ideas, leads, visibility opportunities, and guests.</p>
      </section>
    )
  }

  // Group by kind for visual rhythm
  const byKind = rows.reduce<Record<string, TriageRow[]>>((acc, r) => {
    acc[r.kind] = acc[r.kind] || []
    acc[r.kind].push(r)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-[24px] font-bold text-white">Triage</h1>
          <p className="text-[12px] text-white/45 mt-1">
            Agent suggestions waiting for your call. Thumb-up to add to Today; thumb-down with a reason so Vera learns.
          </p>
        </div>
        <span className="text-[14px] tabular-nums text-white/55">{rows.length}</span>
      </header>

      {(['content_idea', 'lead', 'visibility', 'guest'] as TriageKind[]).map(k => {
        const list = byKind[k] || []
        if (list.length === 0) return null
        const Icon = KIND_ICON[k]
        return (
          <section key={k} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
            <header className="flex items-baseline gap-2 mb-3">
              <Icon size={14} className="text-white/55" />
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/75">{KIND_LABEL[k]}</h2>
              <span className="text-[11px] text-white/35 tabular-nums">{list.length}</span>
            </header>
            <div className="space-y-2">
              {list.map(row => (
                <div
                  key={`${row.kind}-${row.id}`}
                  className="rounded-lg border border-white/[0.05] bg-white/[0.015] p-3 hover:border-white/[0.10] transition-colors"
                  data-triage-id={row.id}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap mb-1">
                        <span className="text-[10px] uppercase tracking-wider text-white/40">{row.agent}</span>
                        {typeof row.confidence === 'number' && row.confidence > 0 && (
                          <span className="text-[10px] text-white/30 tabular-nums">conf {row.confidence.toFixed(1)}</span>
                        )}
                      </div>
                      <p className="text-[14px] text-white font-medium leading-snug">{row.title}</p>
                      {row.description && (
                        <p className="text-[12px] text-white/60 mt-1 line-clamp-2 leading-relaxed">{row.description}</p>
                      )}
                      {row.source_url && (
                        <a
                          href={row.source_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 text-[11px] text-violet-300/85 hover:text-violet-200 mt-2"
                        >
                          Source <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => promote(row)}
                        disabled={busy === row.id}
                        aria-label="Accept and add to Today"
                        title="Accept"
                        className="p-2 rounded-md text-emerald-300/85 hover:bg-emerald-500/15 disabled:opacity-50 transition-colors"
                      >
                        <ThumbsUp size={16} strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { h.tap(); setOpenReason(row.id) }}
                        disabled={busy === row.id}
                        aria-label="Reject with reason"
                        title="Reject"
                        className="p-2 rounded-md text-rose-300/85 hover:bg-rose-500/15 disabled:opacity-50 transition-colors"
                      >
                        <ThumbsDown size={16} strokeWidth={2.2} />
                      </button>
                    </div>
                  </div>

                  {openReason === row.id && (
                    <div className="mt-3 pt-3 border-t border-white/[0.05] space-y-2">
                      <p className="text-[11px] text-white/55">Why is this wrong? (optional)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {REASON_OPTS[row.kind].map(opt => (
                          <button
                            key={opt.code}
                            type="button"
                            onClick={() => reject(row, opt.code)}
                            disabled={busy === row.id}
                            className="text-[11px] px-2.5 py-1 rounded-md border border-white/[0.10] text-white/70 hover:border-white/[0.20] hover:bg-white/[0.04] disabled:opacity-50 transition-colors"
                          >
                            {opt.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => reject(row, null)}
                          disabled={busy === row.id}
                          className="text-[11px] px-2.5 py-1 rounded-md text-white/50 hover:text-white/70 disabled:opacity-50"
                        >
                          Skip reason
                        </button>
                      </div>
                      <input
                        type="text"
                        value={reasonText}
                        onChange={e => setReasonText(e.target.value)}
                        placeholder="Optional: a short note Vera will learn from"
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded text-[12px] text-white p-2 placeholder:text-white/30 focus:outline-none focus:border-white/[0.18]"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
