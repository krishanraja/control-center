import React, { useState } from 'react'
import { ChevronRight, ArchiveRestore } from 'lucide-react'
import { useToast } from './Toast'
import { useHaptics } from '../../hooks/useHaptics'

export interface BackburnerItem {
  id: string
  title: string
  buried_reason?: string | null
}

interface Props {
  table: 'tasks' | 'guests' | 'leads' | 'visibility_targets' | 'content_ideas'
  items: BackburnerItem[]
  onRestored?: (id: string) => void
}

/**
 * Collapsed per-tab section for items the nightly grader buried (low score +
 * idle, agent-originated only). Modeled on Today's StaleDisclosure. Restore
 * sets protected_at server-side, so a restored item is never re-buried.
 */
export function BackburnerSection({ table, items, onRestored }: Props) {
  const [open, setOpen] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [restored, setRestored] = useState<Set<string>>(() => new Set())
  const { toast } = useToast()
  const h = useHaptics()

  const visible = items.filter(i => !restored.has(i.id))
  if (visible.length === 0) return null

  const restore = async (id: string) => {
    if (restoring) return
    h.heavy()
    setRestoring(id)
    try {
      const res = await fetch('/api/triage/sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', source_table: table, source_id: id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`)
      setRestored(prev => { const n = new Set(prev); n.add(id); return n })
      onRestored?.(id)
      h.success()
      toast('Restored — it will not be auto-buried again.', 'success')
    } catch {
      h.error()
      toast('Could not restore — try again.', 'error')
    } finally {
      setRestoring(null)
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.01]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.02] transition-colors text-left"
      >
        <ChevronRight
          size={11}
          className={`text-white/40 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <ArchiveRestore size={11} className="text-white/35" />
        <span className="text-[11px] font-semibold text-white/55 uppercase tracking-[0.14em]">
          Backburner ({visible.length})
        </span>
        <span className="text-[10px] text-white/35 ml-1">auto-buried by the nightly grader</span>
      </button>

      {open && (
        <div className="border-t border-white/[0.05] divide-y divide-white/[0.04]">
          {visible.slice(0, 50).map(item => (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-white/70 truncate">{item.title}</p>
                {item.buried_reason && (
                  <p className="text-[10px] text-white/35 truncate mt-0.5">{item.buried_reason}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => restore(item.id)}
                disabled={restoring !== null}
                className="px-2 py-0.5 rounded-md text-[10px] font-medium border border-white/10 text-white/55 hover:bg-white/[0.06] transition-colors disabled:opacity-40 flex-shrink-0"
              >
                {restoring === item.id ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          ))}
          {visible.length > 50 && (
            <div className="px-3 py-2 text-[10px] text-white/35 text-center">
              +{visible.length - 50} more
            </div>
          )}
        </div>
      )}
    </div>
  )
}
