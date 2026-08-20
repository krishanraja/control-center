import React, { useState } from 'react'
import { PartyPopper, Check } from 'lucide-react'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { Working } from '../shared/Working'

// CLOSE phase of the daily spine. The 3/3 completion is the deliberate peak;
// the two-field reflection is the end (peak-end rule), closing the Zeigarnik
// loop and seeding tomorrow. It writes one feedback_queue row
// (reason_code 'daily_reflection') so Marcus's next synthesis sees the signal.
export function CloseStep() {
  const { today } = useDailyFocus()
  const h = useHaptics()
  const { toast } = useToast()
  const [needle, setNeedle] = useState('')
  const [tomorrow, setTomorrow] = useState('')
  const [phase, setPhase] = useState<'idle' | 'submitting' | 'done'>('idle')

  if (!today) return null

  const submit = async () => {
    if (phase === 'submitting') return
    if (!needle.trim() && !tomorrow.trim()) {
      toast('Add a line so the reflection counts.', 'error')
      return
    }
    setPhase('submitting')
    h.tap()
    try {
      const reasonText = [
        needle.trim() && `Moved the needle: ${needle.trim()}`,
        tomorrow.trim() && `Tomorrow: ${tomorrow.trim()}`,
      ].filter(Boolean).join(' | ') || null
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_table: 'home_intelligence',
          source_id: today.focus_date,
          agent_id: 'marcus',
          vote: 1,
          reason_code: 'daily_reflection',
          reason_text: reasonText,
          meta: {
            focus_date: today.focus_date,
            moved_needle: needle.trim() || null,
            one_thing_tomorrow: tomorrow.trim() || null,
            captured_at: new Date().toISOString(),
          },
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      h.success()
      setPhase('done')
      toast('Logged. Tomorrow starts here.', 'success')
    } catch (e) {
      h.error()
      setPhase('idle')
      toast(`Could not save reflection: ${(e as Error).message}`, 'error')
    }
  }

  if (phase === 'done') {
    return (
      <section
        className="tab-content rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-4"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <PartyPopper size={14} className="text-emerald-300 flex-shrink-0" />
          <p className="text-[13px] text-emerald-100 font-semibold">Day closed. Tomorrow Marcus opens with your one thing.</p>
        </div>
      </section>
    )
  }

  return (
    <section
      className="tab-content rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.07] to-transparent p-4 min-w-0"
      aria-label="Close the day"
    >
      <header className="flex items-center gap-2 mb-3">
        <PartyPopper size={15} className="text-emerald-300 flex-shrink-0" />
        <h2 className="text-[14px] font-semibold text-white">3 shipped. Close the day.</h2>
      </header>
      <div className="space-y-3">
        <div>
          <label className="block text-[10px] uppercase tracking-[0.14em] text-white/45 mb-1">What moved the needle?</label>
          <textarea
            value={needle}
            onChange={e => setNeedle(e.target.value)}
            rows={2}
            placeholder="The one thing that actually mattered today."
            className="w-full bg-black/30 border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:border-emerald-400/40 focus:outline-none resize-none"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-[0.14em] text-white/45 mb-1">One thing for tomorrow</label>
          <textarea
            value={tomorrow}
            onChange={e => setTomorrow(e.target.value)}
            rows={2}
            placeholder="Marcus will surface this first in the morning."
            className="w-full bg-black/30 border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:border-emerald-400/40 focus:outline-none resize-none"
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={phase === 'submitting'}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-100 bg-emerald-500/25 hover:bg-emerald-500/40 border border-emerald-400/40 rounded-md px-3 py-1.5 disabled:opacity-50"
        >
          {phase === 'submitting' ? <Working size={12} /> : <Check size={12} />}
          {phase === 'submitting' ? 'Saving…' : 'Log and close'}
        </button>
      </div>
    </section>
  )
}
