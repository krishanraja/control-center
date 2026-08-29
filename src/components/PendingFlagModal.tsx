import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Modal } from './shared/Modal'

interface PendingFlag {
  id: string | number
  agent?: string | null
  reason?: string | null
  fires_at?: string | null
  fired?: boolean | null
}

const LOOKAHEAD_MS = 2 * 60 * 1000

export function PendingFlagModal() {
  const [flags, setFlags] = useState<PendingFlag[]>([])
  const [now, setNow] = useState(Date.now())
  const [cancelling, setCancelling] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data } = await supabase
        .from('pending_flags')
        .select('*')
        .eq('fired', false)
      if (alive && data) setFlags(data as PendingFlag[])
    }
    load()

    const ch = supabase
      .channel('pending-flags-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_flags' }, load)
      .subscribe()

    const tick = setInterval(() => setNow(Date.now()), 30_000)

    return () => {
      alive = false
      supabase.removeChannel(ch)
      clearInterval(tick)
    }
  }, [])

  const imminent = flags.filter(f => {
    if (f.fired) return false
    if (!f.fires_at) return false
    const t = new Date(f.fires_at).getTime()
    return t - now <= LOOKAHEAD_MS && t - now > -60_000
  })

  if (imminent.length === 0) return null

  const cancel = async (id: string | number) => {
    const key = String(id)
    setCancelling(prev => ({ ...prev, [key]: true }))
    await supabase.from('pending_flags').update({ fired: false }).eq('id', id)
    setCancelling(prev => ({ ...prev, [key]: false }))
    setFlags(prev => prev.filter(f => String(f.id) !== key))
  }

  return (
    // dismissible={false} is the whole point of this surface: a flag about to
    // fire is a decision, not a notification, so Escape and the scrim are both
    // disarmed. The hand-rolled version achieved that by having no close path
    // at all, which also meant no dialog role and no focus trap.
    <Modal
      open
      onClose={() => {}}
      dismissible={false}
      variant="center"
      title="Flag firing soon"
      className="max-w-md"
    >
      <div className="space-y-3">
        {imminent.map(f => {
          const t = f.fires_at ? new Date(f.fires_at).getTime() : now
          const secs = Math.max(0, Math.round((t - now) / 1000))
          return (
            <div key={String(f.id)} className="border border-command-border/50 rounded-lg p-3 space-y-2">
              <div className="text-sm text-white">
                {f.agent ? <span className="font-medium">{f.agent}</span> : null}
                {f.agent && f.reason ? ': ' : null}
                {f.reason || 'Pending flag'}
              </div>
              <div className="text-xs text-command-text/60">Fires in {secs}s</div>
              <button
                onClick={() => cancel(f.id)}
                disabled={cancelling[String(f.id)]}
                className="text-xs px-3 py-1 rounded bg-command-bg/40 border border-command-border hover:bg-command-bg/60 disabled:opacity-50"
              >
                {cancelling[String(f.id)] ? 'Cancelling…' : 'Cancel'}
              </button>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
