import { useCallback, useState } from 'react'

// Full Focus Mode (Phase 3). A per-session, localStorage-backed preference that
// flips every work-item tab between a focus-lane view (the day's 3 targets +
// muted) and the tab's normal "all" view. Defaults to 'focus' so the app
// narrows to today's 3 by default; the toggle lets Krish widen to 'all'.
// Gated by VITE_FOCUS_MODE_ENABLED (default off until verified).

const KEY = 'focus_mode'
export type FocusMode = 'focus' | 'all'

export function isFocusModeEnabled(): boolean {
  return import.meta.env.VITE_FOCUS_MODE_ENABLED === 'true'
}

function read(): FocusMode {
  try { return localStorage.getItem(KEY) === 'all' ? 'all' : 'focus' } catch { return 'focus' }
}

export function useFocusMode() {
  const [mode, setModeState] = useState<FocusMode>(read)

  const setMode = useCallback((m: FocusMode) => {
    setModeState(m)
    try { localStorage.setItem(KEY, m) } catch { /* ignore */ }
  }, [])

  const toggle = useCallback(() => {
    setModeState(prev => {
      const next: FocusMode = prev === 'focus' ? 'all' : 'focus'
      try { localStorage.setItem(KEY, next) } catch { /* ignore */ }
      return next
    })
  }, [])

  return { mode, setMode, toggle }
}
