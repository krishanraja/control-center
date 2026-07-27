import React, { useEffect, useState } from 'react'
import { validateConcreteness } from '../../lib/pilotConcreteness'
import { isAfterShutdownHour } from '../../lib/pilotDay'
import { saveEvening, usePilotState } from '../../hooks/usePilot'

// The evening shutdown. Three fields, and the only required one is tomorrow's
// ONE, because choosing at night at higher capacity is what lets the morning
// avoid choosing at all.
//
// Auto-prompts after 5pm in the pilot zone on first interaction, once per day.
// It never nags twice: dismissing sets a per-day flag in sessionStorage, and
// saving writes the evening row, which stops the prompt permanently for that day.

const DISMISS_KEY = 'pilot_shutdown_dismissed'

export function EveningShutdown() {
  const { state, refresh } = usePilotState()
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)

  const today = state?.today
  const eveningDone = state?.evening_done_today ?? true

  // Arm on the first real interaction after the shutdown hour, so the modal
  // never lands on top of something the operator is mid-way through.
  useEffect(() => {
    if (!today || eveningDone || armed) return
    if (!isAfterShutdownHour()) return
    if (sessionStorage.getItem(DISMISS_KEY) === today) return

    const fire = () => { setArmed(true); setOpen(true) }
    const opts = { once: true, passive: true } as const
    window.addEventListener('pointerdown', fire, opts)
    window.addEventListener('keydown', fire, opts)
    return () => {
      window.removeEventListener('pointerdown', fire)
      window.removeEventListener('keydown', fire)
    }
  }, [today, eveningDone, armed])

  const dismiss = () => {
    if (today) sessionStorage.setItem(DISMISS_KEY, today)
    setOpen(false)
  }

  return (
    <>
      <ShutdownButton onClick={() => setOpen(true)} done={eveningDone} />
      {open && (
        <ShutdownModal
          onClose={dismiss}
          onSaved={() => { setOpen(false); refresh() }}
        />
      )}
    </>
  )
}

function ShutdownButton({ onClick, done }: { onClick: () => void; done: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={done ? 'Shutdown logged' : 'Evening shutdown'}
      className={`fixed bottom-4 right-4 z-40 px-3 py-1.5 rounded-lg text-[11px] border transition-colors ${
        done
          ? 'bg-white/[0.02] border-white/[0.06] text-ink-faint/50 hover:text-ink-faint'
          : 'bg-white/[0.05] border-white/10 text-ink-muted hover:bg-white/[0.09] hover:text-ink'
      }`}
    >
      shutdown
    </button>
  )
}

function ShutdownModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [shipped, setShipped] = useState('')
  const [one, setOne] = useState('')
  const [url, setUrl] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async () => {
    const check = validateConcreteness(one)
    if (!check.ok) { setHint(check.hint || null); return }
    setSaving(true)
    try {
      await saveEvening({
        shipped_today: shipped.trim() || undefined,
        tomorrow_one: one.trim(),
        tomorrow_one_url: url.trim() || undefined,
      })
      onSaved()
    } catch (e) {
      setHint(e instanceof Error ? e.message : 'Could not save')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5 py-8 bg-base/80 backdrop-blur-sm">
      <div className="w-full max-w-[430px] rounded-2xl bg-base border border-white/[0.10] p-6 flex flex-col gap-5 text-ink">
        <div>
          <h2 className="font-display text-[19px] leading-tight">Shutdown</h2>
          <p className="text-[12px] text-ink-faint mt-1">Choose tomorrow now, so the morning does not have to.</p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[12px] text-ink-muted">What shipped today</span>
          <input
            value={shipped}
            onChange={e => setShipped(e.target.value)}
            placeholder="Optional"
            className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-[14px] text-ink placeholder:text-ink-faint outline-none focus:border-white/25"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[12px] text-ink-muted">Tomorrow&rsquo;s ONE</span>
          <textarea
            value={one}
            onChange={e => { setOne(e.target.value); setHint(null) }}
            rows={2}
            placeholder="Verb, artifact, recipient"
            className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-[14px] leading-relaxed text-ink placeholder:text-ink-faint outline-none focus:border-white/25 resize-none"
          />
          {hint && <p className="text-[12px] text-ink-muted leading-relaxed">{hint}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[12px] text-ink-muted">Link to it</span>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Optional. A draft, an editor, a campaign."
            className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-[14px] text-ink placeholder:text-ink-faint outline-none focus:border-white/25"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={submit}
            disabled={saving || !one.trim()}
            className="px-4 py-2.5 rounded-lg text-[14px] font-medium bg-white/[0.10] border border-white/20 text-ink hover:bg-white/[0.14] disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving' : 'Close the day'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2.5 rounded-lg text-[13px] text-ink-faint hover:text-ink-muted transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
