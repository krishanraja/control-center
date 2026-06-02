import React, { useState } from 'react'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { useToast } from './Toast'
import { useHaptics } from '../../hooks/useHaptics'

export type FeedbackSurface =
  | 'leads'
  | 'contacts'
  | 'content_ideas'
  | 'nova_target_conferences'
  | 'visibility_targets'
  | 'guests'
  | 'tasks'
  | 'customers'
  | 'bets'
  | 'opportunities'
  | 'corrections'

interface ReasonOption {
  code: string
  label: string
}

const REASON_OPTIONS: Record<FeedbackSurface, ReasonOption[]> = {
  leads: [
    { code: 'lead_wrong_seniority',     label: 'Wrong seniority' },
    { code: 'lead_wrong_company_size',  label: 'Wrong company size' },
    { code: 'lead_no_budget_signal',    label: 'No real budget signal' },
    { code: 'lead_already_contacted',   label: 'Already contacted' },
    { code: 'lead_wrong_venture_tag',   label: 'Wrong venture tag' },
    { code: 'lead_other',               label: 'Other' },
  ],
  contacts: [
    { code: 'contact_already_engaged',  label: 'Already engaged (S&N / podcast)' },
    { code: 'contact_not_a_fit',        label: 'Not actually a fit' },
    { code: 'contact_wrong_venture',    label: 'Wrong venture / play' },
    { code: 'contact_no_budget_signal', label: 'No real budget signal' },
    { code: 'contact_bad_timing',       label: 'Bad timing' },
    { code: 'contact_other',            label: 'Other' },
  ],
  content_ideas: [
    { code: 'content_too_generic',      label: 'Too generic' },
    { code: 'content_not_my_voice',     label: 'Not my voice' },
    { code: 'content_old_news',         label: 'Old news' },
    { code: 'content_wrong_venture',    label: 'Wrong venture' },
    { code: 'content_other',            label: 'Other' },
  ],
  nova_target_conferences: [
    { code: 'visibility_wrong_audience',  label: 'Wrong audience' },
    { code: 'visibility_bad_timing',      label: 'Bad timing' },
    { code: 'visibility_already_pitched', label: 'Already pitched' },
    { code: 'visibility_too_low_tier',    label: 'Too low tier' },
    { code: 'visibility_other',           label: 'Other' },
  ],
  visibility_targets: [
    { code: 'visibility_wrong_audience',  label: 'Wrong audience' },
    { code: 'visibility_bad_timing',      label: 'Bad timing' },
    { code: 'visibility_already_pitched', label: 'Already pitched' },
    { code: 'visibility_too_low_tier',    label: 'Too low tier' },
    { code: 'visibility_other',           label: 'Other' },
  ],
  guests: [
    { code: 'guest_wrong_show',         label: 'Wrong show, not S&N or BE' },
    { code: 'guest_too_inside_baseball', label: 'Too inside-baseball' },
    { code: 'guest_not_a_builder',      label: 'Not actually a builder/operator' },
    { code: 'guest_recently_appeared',  label: 'Recently appeared elsewhere' },
    { code: 'guest_other',              label: 'Other' },
  ],
  tasks: [
    { code: 'task_not_a_priority',      label: 'Not a real priority' },
    { code: 'task_wrong_framing',       label: 'Wrong framing of the job' },
    { code: 'task_outdated_context',    label: 'Context is outdated' },
    { code: 'task_already_done',        label: 'Already done elsewhere' },
    { code: 'task_other',               label: 'Other' },
  ],
  customers: [
    { code: 'customer_wrong_segment',   label: 'Wrong segment classification' },
    { code: 'customer_missing_context', label: 'Missing context about this customer' },
    { code: 'customer_other',           label: 'Other' },
  ],
  bets: [
    { code: 'bet_not_falsifiable',      label: 'Not actually falsifiable' },
    { code: 'bet_wrong_hypothesis',     label: 'Wrong hypothesis to bet on' },
    { code: 'bet_wrong_size',           label: 'Size is wrong (too big/small)' },
    { code: 'bet_other',                label: 'Other' },
  ],
  opportunities: [
    { code: 'opp_no_revenue_path',      label: 'No clear revenue path' },
    { code: 'opp_wrong_ICP',            label: 'Wrong ICP' },
    { code: 'opp_too_low_signal',       label: 'Signal too low' },
    { code: 'opp_other',                label: 'Other' },
  ],
  corrections: [
    { code: 'correction_no_action',     label: 'No action needed' },
    { code: 'correction_wrong_pattern', label: 'Pattern is wrong' },
    { code: 'correction_other',         label: 'Other' },
  ],
}

interface Props {
  sourceTable: FeedbackSurface
  sourceId: string
  agentId?: string | null
  compact?: boolean
}

export function FeedbackButton({ sourceTable, sourceId, agentId, compact }: Props) {
  const { toast } = useToast()
  const h = useHaptics()
  const [showReasons, setShowReasons] = useState(false)
  const [vote, setVote] = useState<1 | -1 | null>(null)
  const [busy, setBusy] = useState(false)
  const [reasonText, setReasonText] = useState('')

  const submit = async (v: 1 | -1, reasonCode?: string) => {
    if (busy) return
    setBusy(true)
    h.tap()
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_table: sourceTable,
          source_id: sourceId,
          agent_id: agentId || null,
          vote: v,
          reason_code: reasonCode || null,
          reason_text: reasonText.trim() || null,
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const payload = await r.json().catch(() => ({}))
      if (!payload.ok) throw new Error(payload.error || 'unknown error')
      setVote(v)
      setShowReasons(false)
      h.success()
      toast(v === 1 ? 'Thanks. Logged.' : 'Got it. Vera will learn from this.', 'success')
    } catch (e) {
      h.error()
      toast(`Could not save feedback: ${(e as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const size = compact ? 'w-3.5 h-3.5' : 'w-4 h-4'
  const reasons = REASON_OPTIONS[sourceTable] || []

  return (
    <div className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => submit(1)}
        disabled={busy || vote !== null}
        aria-label="Thumbs up"
        title="Useful"
        className={`p-1 rounded transition-colors ${
          vote === 1 ? 'text-emerald-300' : 'text-white/30 hover:text-white/70'
        } disabled:opacity-60`}
      >
        <ThumbsUp className={size} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={() => { h.tap(); setShowReasons(true) }}
        disabled={busy || vote !== null}
        aria-label="Thumbs down"
        title="Not useful"
        className={`p-1 rounded transition-colors ${
          vote === -1 ? 'text-rose-300' : 'text-white/30 hover:text-white/70'
        } disabled:opacity-60`}
      >
        <ThumbsDown className={size} strokeWidth={2} />
      </button>
      {showReasons && (
        <div
          className="absolute right-0 top-full mt-1 z-30 bg-[#0f0f17] border border-white/[0.08] rounded-lg shadow-2xl py-1 min-w-[240px]"
          onMouseLeave={() => setShowReasons(false)}
        >
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-white/40 border-b border-white/[0.06]">
            Why? (optional)
          </div>
          <div className="px-2 pt-2">
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="Add a short reason…"
              rows={2}
              className="w-full resize-none rounded-md border border-white/[0.1] bg-white/[0.03] px-2 py-1.5 text-[12px] text-white/85 placeholder:text-white/30 focus:border-violet-400/40 focus:outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          {reasons.map(r => (
            <button
              key={r.code}
              onClick={() => submit(-1, r.code)}
              className="w-full text-left px-3 py-2 text-[12px] text-white/80 hover:bg-white/5"
            >
              {r.label}
            </button>
          ))}
          <div className="border-t border-white/[0.06] mt-1 pt-1">
            <button
              onClick={() => submit(-1)}
              className="w-full text-left px-3 py-2 text-[12px] text-white/55 hover:bg-white/5"
            >
              {reasonText.trim() ? 'Submit reason' : 'Skip and just downvote'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
