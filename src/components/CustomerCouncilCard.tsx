import React, { useState } from 'react'
import { Mic, Calendar, Flame, AlertOctagon, Sparkles, ArrowUpRight } from '@/lib/icons'
import { useCustomerContacts, type CouncilEntry } from '../hooks/useCustomerContacts'
import { PRODUCT_LABEL } from '../hooks/useCustomers'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import { Skeleton } from './shared/Skeleton'

const PRIORITY_TONE: Record<CouncilEntry['priority'], { border: string; accent: string; icon: any; label: string }> = {
  churn_exit:            { border: 'border-red-500/40',     accent: 'text-red-300',     icon: AlertOctagon, label: 'Exit interview' },
  new_welcome:           { border: 'border-emerald-500/30', accent: 'text-emerald-300', icon: Sparkles,     label: 'Welcome' },
  high_value_check_in:   { border: 'border-amber-500/30',   accent: 'text-amber-300',   icon: Flame,        label: 'High-value check-in' },
  long_tenure_expansion: { border: 'border-violet-500/30',  accent: 'text-violet-300',  icon: ArrowUpRight, label: 'Expansion check' },
  stale_check_in:        { border: 'border-white/10',       accent: 'text-white/55',    icon: Calendar,     label: 'Stale — check in' },
}

/**
 * Pillar 3 — Customer Council. Rendered on Customers tab.
 * Shows the 8 most urgent customers to talk to + a quick-log CTA.
 */
export function CustomerCouncilCard() {
  const { council, streakDays, loading } = useCustomerContacts()
  const [logging, setLogging] = useState<string | null>(null)
  const [draft, setDraft] = useState({ channel: 'email', summary: '', reason: 'check_in', next_step: '' })
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()
  const h = useHaptics()

  const log = async (customer_id: string) => {
    if (!draft.summary.trim()) {
      toast('Summary required — one sentence is fine.', 'error')
      h.error()
      return
    }
    h.heavy()
    setBusy(true)
    try {
      const r = await fetch('/api/customer-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id, ...draft, agent: 'krish' }),
      })
      if (!r.ok) throw new Error(String(r.status))
      h.success()
      toast('Logged.', 'success')
      setLogging(null)
      setDraft({ channel: 'email', summary: '', reason: 'check_in', next_step: '' })
    } catch {
      h.error()
      toast('Could not save — try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
        <header className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton h={10} w={128} r={4} />
            <Skeleton h={8} w={96} r={4} />
          </div>
          <Skeleton h={10} w={40} r={4} />
        </header>
        <ul className="divide-y divide-white/[0.04]">
          {[0, 1, 2].map(i => (
            <li key={i} className="px-4 py-3 border-l-2 border-white/10">
              <Skeleton h={8} w={80} r={4} />
              <div className="h-2.5 w-40 bg-white/[0.08] rounded mt-2" />
              <div className="h-2 w-28 bg-white/[0.05] rounded mt-2" />
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      <header className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-label font-semibold text-white flex items-center gap-1.5">
            <Mic size={12} className="text-violet-300" />
            Customer Council
          </h3>
          <p className="text-micro text-white/45 mt-0.5">
            {council.length} customers to talk to this week
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Flame size={12} className={streakDays > 0 ? 'text-amber-300' : 'text-white/30'} />
          <span className={`text-micro tabular-nums font-semibold ${streakDays > 0 ? 'text-amber-300' : 'text-white/40'}`}>
            {streakDays}d streak
          </span>
        </div>
      </header>

      {council.length === 0 ? (
        <div className="p-4 text-center">
          <p className="text-micro text-white/45">No urgent contacts. Caught up — for now.</p>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {council.map(entry => {
            const tone = PRIORITY_TONE[entry.priority]
            const Icon = tone.icon
            const isLogging = logging === entry.customer.id
            return (
              <li key={entry.customer.id} className={`px-4 py-3 ${tone.border} border-l-2`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon size={11} className={tone.accent} />
                      <span className={`text-micro uppercase tracking-[0.14em] ${tone.accent} font-semibold`}>
                        {tone.label}
                      </span>
                    </div>
                    <p className="text-body font-semibold text-white truncate">
                      {entry.customer.full_name || entry.customer.email || 'Customer'}
                    </p>
                    <p className="text-micro text-white/45 mt-0.5">
                      {PRODUCT_LABEL[entry.customer.product]}
                      {entry.customer.mrr_usd ? ` · $${Math.round(entry.customer.mrr_usd)}/mo` : ''}
                    </p>
                    <p className="text-micro text-white/65 mt-1">{entry.reason}</p>
                  </div>
                </div>

                {isLogging ? (
                  <div className="mt-2.5 space-y-2 rounded-md border border-white/[0.08] bg-white/[0.03] p-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={draft.channel}
                        onChange={e => setDraft(d => ({ ...d, channel: e.target.value }))}
                        className="bg-white/[0.04] border border-white/[0.08] rounded text-micro text-white p-1.5"
                      >
                        <option value="email">Email</option>
                        <option value="call">Call</option>
                        <option value="video">Video</option>
                        <option value="message">Message</option>
                        <option value="in_person">In person</option>
                      </select>
                      <select
                        value={draft.reason}
                        onChange={e => setDraft(d => ({ ...d, reason: e.target.value }))}
                        className="bg-white/[0.04] border border-white/[0.08] rounded text-micro text-white p-1.5"
                      >
                        <option value="welcome">Welcome</option>
                        <option value="check_in">Check-in</option>
                        <option value="expansion">Expansion</option>
                        <option value="save">Save</option>
                        <option value="exit_interview">Exit interview</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <textarea
                      value={draft.summary}
                      onChange={e => setDraft(d => ({ ...d, summary: e.target.value }))}
                      rows={2}
                      placeholder="What was said? (one sentence)"
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded text-micro text-white p-2 placeholder:text-white/30 focus:outline-none focus:border-white/[0.18]"
                    />
                    <input
                      type="text"
                      value={draft.next_step}
                      onChange={e => setDraft(d => ({ ...d, next_step: e.target.value }))}
                      placeholder="Next step (optional)"
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded text-micro text-white p-2 placeholder:text-white/30 focus:outline-none focus:border-white/[0.18]"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => log(entry.customer.id)}
                        disabled={busy}
                        className="px-2.5 py-1 rounded-md text-micro font-semibold bg-violet-500/30 border border-violet-500/40 text-violet-100 hover:bg-violet-500/40 disabled:opacity-40"
                      >
                        {busy ? 'Saving…' : 'Log contact'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLogging(null)}
                        disabled={busy}
                        className="px-2 py-1 rounded-md text-micro text-white/55 hover:text-white/80"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setLogging(entry.customer.id)
                        setDraft({
                          channel: 'email',
                          summary: '',
                          reason: entry.suggested_action,
                          next_step: '',
                        })
                      }}
                      className="px-2.5 py-1 rounded-md text-micro font-medium border border-violet-500/30 text-violet-200 hover:bg-violet-500/15"
                    >
                      Log contact
                    </button>
                    {entry.customer.email && (
                      <a
                        href={`mailto:${entry.customer.email}`}
                        className="px-2.5 py-1 rounded-md text-micro font-medium border border-white/10 text-white/70 hover:bg-white/[0.06]"
                      >
                        Email
                      </a>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
