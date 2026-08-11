import React, { useEffect, useState } from 'react'
import { isAfterShutdownHour } from '../../lib/pilotDay'
import { saveEvening, usePilotState } from '../../hooks/usePilot'
import { useHaptics } from '../../hooks/useHaptics'
import { OneActionPicker } from './OneActionPicker'
import { WorryCompilerButton } from './WorryCompiler'
import { Tap, VoiceField, PilotDock, DockButton } from './controls'
import { Modal } from '../shared/Modal'

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
      <PilotDock>
        <WorryCompilerButton />
        <span aria-hidden className="w-px h-5 bg-white/[0.10]" />
        <DockButton
          label="shutdown"
          dimmed={eveningDone}
          title={eveningDone ? 'Shutdown logged' : 'Evening shutdown'}
          onTap={() => setOpen(true)}
        />
      </PilotDock>
      {open && (
        <ShutdownModal
          onClose={dismiss}
          onSaved={() => { setOpen(false); refresh() }}
        />
      )}
    </>
  )
}

function ShutdownModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const h = useHaptics()
  const [shipped, setShipped] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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
      await saveEvening({
        shipped_today: shipped.trim() || undefined,
        tomorrow_one: one,
        tomorrow_one_url: url.trim() || pickedUrl || undefined,
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
      className="sm:max-w-[430px] max-h-[92dvh] p-6 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] sm:pb-6 flex flex-col gap-6 text-ink"
    >
        <div>
          <h2 className="font-display text-[20px] leading-tight">Shutdown</h2>
          <p className="text-[13px] text-ink-faint mt-1">Choose tomorrow now, so the morning does not have to.</p>
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] text-ink-muted">What shipped today</span>
          <VoiceField value={shipped} onChange={setShipped} placeholder="Optional" rows={2} />
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] text-ink-muted">Tomorrow&rsquo;s ONE</span>
          <OneActionPicker onCommit={commit} saving={saving} submitLabel="Close the day" />
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] text-ink-muted">Link to it</span>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            inputMode="url"
            placeholder="Optional. A draft, an editor, a campaign."
            className="w-full px-4 py-3.5 min-h-[52px] rounded-xl bg-white/[0.03] border border-white/10 text-[16px] text-ink placeholder:text-ink-faint outline-none focus:border-white/25"
          />
        </div>

        {error && <p className="text-[13px] text-ink-muted">{error}</p>}

        <Tap variant="quiet" className="!min-h-[48px] text-[13px] self-start flex items-center" onTap={() => { h.tap(); onClose() }}>
          Not now
        </Tap>
    </Modal>
  )
}
