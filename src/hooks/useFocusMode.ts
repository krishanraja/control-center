import { useCallback, useState } from 'react'

// Full Focus Mode. A per-session, localStorage-backed preference that flips
// every work-item tab between a focus-lane view (the day's 3 targets + muted)
// and the tab's normal "all" view. Defaults to 'focus' so the app narrows to
// today's 3 by default; the toggle lets Krish widen to 'all'.
//
// Committed with the 2026-08-20 recompose: this is the mechanism by which the
// canon (today's 3) feeds every tab, so it is structural, not configured. The
// function stays for its call sites; the flag is gone.

const KEY = 'focus_mode'
export type FocusMode = 'focus' | 'all'

export function isFocusModeEnabled(): boolean {
  return true
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
