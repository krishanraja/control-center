import { useEffect, useState } from 'react'

/**
 * Whether the device believes it has a network. Browsers are honest about
 * "definitely offline" (airplane mode, no radio) and optimistic about
 * "online", so false is reliable and true only means "not known to be off".
 * The surfaces that write treat false as a reason to say so before trying.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() => {
    try { return typeof navigator === 'undefined' ? true : navigator.onLine !== false } catch { return true }
  })
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}
