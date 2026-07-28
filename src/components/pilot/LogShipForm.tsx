import React, { useState } from 'react'
import { SHIP_CHANNELS, type ShipChannel } from '../../types/pilot'
import { logShip } from '../../hooks/usePilot'
import { useHaptics } from '../../hooks/useHaptics'
import { Tap, VoiceField } from './controls'

// The two-field ship log. One implementation, used by both the home widget and
// red mode's mark-done, so "do it now" can never grow a parallel write path.

interface Props {
  onLogged: () => void
  onCancel?: () => void
  /** Red mode pre-fills the description with today's ONE. */
  initialDescription?: string
  submitLabel?: string
}

const CHANNEL_LABEL: Record<ShipChannel, string> = {
  email: 'Email',
  publish: 'Publish',
  invoice: 'Invoice',
  ask: 'Ask',
  campaign: 'Campaign',
  other: 'Other',
}

export function LogShipForm({ onLogged, onCancel, initialDescription = '', submitLabel = 'Log it' }: Props) {
  const h = useHaptics()
  const [channel, setChannel] = useState<ShipChannel | null>(null)
  const [description, setDescription] = useState(initialDescription)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = Boolean(channel) && description.trim().length > 0 && !saving

  const submit = async () => {
    if (!channel || !description.trim()) return
    setSaving(true)
    setError(null)
    try {
      await logShip({ channel, description: description.trim() })
      h.notifySuccess()
      onLogged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log it')
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {SHIP_CHANNELS.map(c => (
          <button
            key={c}
            type="button"
            onPointerDown={() => h.select()}
            onClick={() => setChannel(c)}
            className={`min-h-[48px] px-4 rounded-xl text-[14px] border transition-all duration-100 active:scale-95 touch-manipulation ${
              channel === c
                ? 'bg-white/[0.10] border-white/25 text-ink'
                : 'bg-white/[0.03] border-white/10 text-ink-muted hover:bg-white/[0.06]'
            }`}
          >
            {CHANNEL_LABEL[c]}
          </button>
        ))}
      </div>

      <VoiceField
        value={description}
        onChange={setDescription}
        onEnter={() => { if (canSubmit) submit() }}
        placeholder="What left your machine, and to whom"
        rows={2}
      />

      {error && <p className="text-[12px] text-ink-muted">{error}</p>}

      <div className="flex items-center gap-2">
        <Tap onTap={submit} disabled={!canSubmit} feel="success" className="flex items-center justify-center">
          {saving ? 'Saving' : submitLabel}
        </Tap>
        {onCancel && (
          <Tap variant="quiet" className="!min-h-[48px] text-[13px] flex items-center" onTap={() => { h.tap(); onCancel() }}>
            Cancel
          </Tap>
        )}
      </div>
    </div>
  )
}
