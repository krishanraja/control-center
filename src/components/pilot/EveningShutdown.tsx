import React, { useEffect, useMemo, useState } from 'react'
import { isAfterShutdownHour } from '../../lib/pilotDay'
import { saveEvening, skipEvening, usePilotState } from '../../hooks/usePilot'
import { useHaptics } from '../../hooks/useHaptics'
import { useGoalCanon } from '../../hooks/useGoalCanon'
import { flagToday, isFlaggedToday } from '../../lib/dayFlag'
import type { TomorrowSlot } from '../../types/pilot'
import { OneActionPicker } from './OneActionPicker'
import { Tap, VoiceField } from './controls'
import { Modal } from '../shared/Modal'

// The evening shutdown. Tomorrow's 3, chosen tonight at higher capacity so
// the morning does not have to choose. Slot 1 is the ONE: the thing that must
// leave the machine, concreteness-checked, and what red mode runs on. Slots 2
// and 3 are optional and can name the weekly objective they serve. All three
// land on tomorrow's Today list through one route (api/pilot/checkin.ts).
//
// Auto-prompts after 5pm in the pilot zone on first interaction, once per day.
// Dismissing (X, "Not now", Escape, backdrop) closes it UNTIL TOMORROW on every
// device: it writes a skipped evening row and a civil-date flag in
// localStorage. The first version kept the flag in sessionStorage, which is
// per tab and dies with it, so every new tab and every PWA relaunch brought
// the prompt straight back.
//
// This used to also render the floating pilot dock ("compile a worry |
// shutdown") over every tab. The dock is gone: both actions now live on the
// Focus & Purpose tab (src/components/focusPurpose/FocusPurposeTab.tsx), which
// imports ShutdownModal directly.

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
    if (isFlaggedToday(DISMISS_KEY)) return

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
    flagToday(DISMISS_KEY)
    setOpen(false)
    // The server copy is what stops the prompt on the other device. Best
    // effort; the local flag already holds this one.
    void skipEvening().then(() => refresh())
  }

  if (!open) return null
  return (
    <ShutdownModal
      onClose={dismiss}
      onSaved={() => { setOpen(false); refresh() }}
    />
  )
}

interface ExtraSlot {
  text: string
  goalId: string
}

export function ShutdownModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const h = useHaptics()
  const { canon } = useGoalCanon()
  const [shipped, setShipped] = useState('')
  const [url, setUrl] = useState('')
  const [second, setSecond] = useState<ExtraSlot>({ text: '', goalId: '' })
  const [third, setThird] = useState<ExtraSlot>({ text: '', goalId: '' })
  const [oneGoalId, setOneGoalId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const weekly = useMemo(() => (canon?.weekly ?? []).filter(g => g.status === 'active'), [canon])
  const jobFor = (goalId: string) => weekly.find(g => g.id === goalId)?.job ?? null

  useEffect(() => {
    // Escape is the dialog's now (Radix). Kept only for the non-modal path.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // pickedUrl arrives when the picker resolved tomorrow's ONE against the
  // publish queue. A url typed by hand in the field below still wins.
  const commit = async (one: string, pickedUrl?: string) => {
    setSaving(true)
    setError(null)
    try {
      const tomorrow: TomorrowSlot[] = [
        { slot: 1, text: one, goal_id: oneGoalId || null, job: jobFor(oneGoalId) },
      ]
      if (second.text.trim()) tomorrow.push({ slot: 2, text: second.text.trim(), goal_id: second.goalId || null, job: jobFor(second.goalId) })
      if (third.text.trim()) tomorrow.push({ slot: 3, text: third.text.trim(), goal_id: third.goalId || null, job: jobFor(third.goalId) })
      await saveEvening({
        shipped_today: shipped.trim() || undefined,
        tomorrow_one: one,
        tomorrow_one_url: url.trim() || pickedUrl || undefined,
        tomorrow,
      })
      h.notifySuccess()
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Shutdown"
      hideTitle
      overlayClassName="bg-base/80 backdrop-blur-sm"
      className="sm:max-w-[460px] max-h-[92dvh] p-6 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] sm:pb-6 flex flex-col gap-6 text-ink overflow-y-auto"
    >
        <div>
          <h2 className="font-display text-title leading-tight">Shutdown</h2>
          <p className="text-body text-ink-faint mt-1">Choose tomorrow now, so the morning does not have to. The first one is the one that must leave the machine.</p>
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-body text-ink-muted">What shipped today</span>
          <VoiceField value={shipped} onChange={setShipped} placeholder="Optional" rows={2} />
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-body text-ink-muted">Tomorrow&rsquo;s ONE</span>
          <ServesChips weekly={weekly} value={oneGoalId} onChange={setOneGoalId} disabled={saving} />
          <OneActionPicker onCommit={commit} saving={saving} submitLabel="Close the day" />
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-body text-ink-muted">Link to it</span>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            inputMode="url"
            placeholder="Optional. A draft, an editor, a campaign."
            className="w-full px-4 py-3.5 min-h-[52px] rounded-xl bg-white/[0.03] border border-white/10 text-lede text-ink placeholder:text-ink-faint outline-none focus:border-white/25"
          />
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-body text-ink-muted">Second, if there is one</span>
          <VoiceField value={second.text} onChange={t => setSecond(s => ({ ...s, text: t }))} placeholder="Optional" rows={1} />
          {second.text.trim() && (
            <ServesChips weekly={weekly} value={second.goalId} onChange={id => setSecond(s => ({ ...s, goalId: id }))} disabled={saving} />
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-body text-ink-muted">Third, if there is one</span>
          <VoiceField value={third.text} onChange={t => setThird(s => ({ ...s, text: t }))} placeholder="Optional" rows={1} />
          {third.text.trim() && (
            <ServesChips weekly={weekly} value={third.goalId} onChange={id => setThird(s => ({ ...s, goalId: id }))} disabled={saving} />
          )}
        </div>

        {error && <p className="text-body text-ink-muted">{error}</p>}

        <Tap variant="quiet" className="!min-h-[48px] text-body self-start flex items-center" onTap={() => { h.tap(); onClose() }}>
          Not now
        </Tap>
    </Modal>
  )
}

/**
 * Which of this week's objectives a slot serves. Chips, never a select
 * (AGENTS.md); hidden entirely when the week has nothing set, so the shutdown
 * never asks a question the canon cannot answer.
 */
function ServesChips({ weekly, value, onChange, disabled }: {
  weekly: Array<{ id: string; title: string }>
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  if (weekly.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Which objective this serves">
      {weekly.map(g => {
        const on = value === g.id
        return (
          <button
            key={g.id}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(on ? '' : g.id)}
            className={`max-w-full truncate min-h-[32px] rounded-full border px-3 py-1 text-label transition-colors disabled:opacity-40 ${
              on
                ? 'border-white/30 bg-white/[0.10] text-ink'
                : 'border-white/10 bg-white/[0.03] text-ink-muted hover:bg-white/[0.06]'
            }`}
          >
            {g.title}
          </button>
        )
      })}
    </div>
  )
}
