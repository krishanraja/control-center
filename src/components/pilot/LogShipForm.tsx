import React, { useState } from 'react'
import { SHIP_CHANNELS, type ShipChannel } from '../../types/pilot'
import { logShip } from '../../hooks/usePilot'

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
            onClick={() => setChannel(c)}
            className={`px-3 py-1.5 rounded-lg text-[13px] border transition-colors ${
              channel === c
                ? 'bg-white/[0.10] border-white/25 text-ink'
                : 'bg-white/[0.03] border-white/10 text-ink-muted hover:bg-white/[0.06]'
            }`}
          >
            {CHANNEL_LABEL[c]}
          </button>
        ))}
      </div>

      <input
        value={description}
        onChange={e => setDescription(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && canSubmit) submit() }}
        placeholder="What left your machine, and to whom"
        className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-[14px] text-ink placeholder:text-ink-faint outline-none focus:border-white/25"
      />

      {error && <p className="text-[12px] text-ink-muted">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="px-4 py-2 rounded-lg text-[13px] font-medium bg-white/[0.10] border border-white/20 text-ink disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/[0.14] transition-colors"
        >
          {saving ? 'Saving' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 rounded-lg text-[13px] text-ink-faint hover:text-ink-muted transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
