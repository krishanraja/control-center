import React, { useEffect, useRef } from 'react'
import { useOnline } from '../../hooks/useOnline'
import { useToast } from './Toast'

/**
 * One line at the top of the screen while the device is offline. Nothing else
 * changes: the page stays readable, nothing dims, no modal. Every write
 * already refuses with a sentence when offline (src/lib/apiFetch.ts); this is
 * the ambient reason for that sentence, so the third refusal is not a mystery.
 *
 * Absent entirely when online, which is almost always. Says "back" once when
 * the connection returns, through the ordinary toast, so a save that failed a
 * minute ago has an obvious moment to be retried.
 */
export function OfflineLine() {
  const online = useOnline()
  const { toast } = useToast()
  const wasOffline = useRef(false)

  useEffect(() => {
    if (!online) { wasOffline.current = true; return }
    if (wasOffline.current) {
      wasOffline.current = false
      toast('Back online.', 'info')
    }
  }, [online, toast])

  if (online) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[80] flex items-center justify-center gap-2 bg-base/95 backdrop-blur-sm border-b border-amber-400/25 px-4 py-2 pt-[calc(env(safe-area-inset-top,0px)+8px)] text-label text-amber-100/90"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" aria-hidden />
      Offline. Nothing saves until the connection is back.
    </div>
  )
}
