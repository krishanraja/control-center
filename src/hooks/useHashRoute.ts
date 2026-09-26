import { startTransition, useCallback, useEffect, useState } from 'react'

export interface HashRoute {
  tab: string
  params: Record<string, string>
}

function parseHash(hash: string): HashRoute {
  const h = (hash || '').replace(/^#\/?/, '')
  const [pathname, query = ''] = h.split('?')
  const tab = pathname || 'home'
  const params: Record<string, string> = {}
  if (query) {
    const usp = new URLSearchParams(query)
    usp.forEach((v, k) => { params[k] = v })
  }
  return { tab, params }
}

function stringifyHash(tab: string, params: Record<string, string> = {}): string {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '')
  const query = entries.length ? '?' + new URLSearchParams(entries).toString() : ''
  return `#/${tab}${query}`
}

export function useHashRoute() {
  const [route, setRoute] = useState<HashRoute>(() =>
    typeof window === 'undefined' ? { tab: 'home', params: {} } : parseHash(window.location.hash)
  )

  useEffect(() => {
    // A route change is a transition. Mounting a tab is the heaviest render
    // this app does, and as an urgent update it blocked the main thread while
    // the tap's press feedback and the nav highlight were mid-animation, which
    // read as a stutter on every switch. As a transition React renders the new
    // tab in yielding slices, and on a tab's first visit it keeps the old one
    // on screen while the chunk loads instead of flashing the route skeleton.
    const onHash = () => {
      const next = parseHash(window.location.hash)
      startTransition(() => setRoute(next))
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((tab: string, params: Record<string, string> = {}) => {
    const newHash = stringifyHash(tab, params)
    if (newHash !== window.location.hash) {
      window.location.hash = newHash
    }
    // CLO-008 (audit 2026-05-26): scroll on every navigate. If a deep-link
    // param is passed, retry-scroll the matching element into view. Otherwise
    // scroll to top of the scrollable container.
    setTimeout(() => {
      const hasParam = params && Object.keys(params).length > 0
      if (hasParam) {
        const targetId = Object.values(params)[0]
        let tries = 0
        const iv = setInterval(() => {
          tries++
          const el = document.querySelector(
            `[data-target-id="${targetId}"], [data-task-id="${targetId}"], [data-lead-id="${targetId}"], [data-guest-id="${targetId}"], [data-idea-id="${targetId}"], [data-correction-id="${targetId}"], [data-skill-proposal-id="${targetId}"]`
          ) as HTMLElement | null
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            clearInterval(iv)
          } else if (tries > 15) {
            clearInterval(iv)
            window.scrollTo({ top: 0, behavior: 'smooth' })
            document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
          }
        }, 150)
      } else {
        // Instant, not smooth: the window and `main` never scroll in this
        // shell, so this only ever undoes a stray offset, and animating that
        // 60ms after the new tab painted slid the whole page under the finger.
        window.scrollTo({ top: 0 })
        document.querySelector('main')?.scrollTo({ top: 0 })
      }
    }, 60)
  }, [])

  return { route, navigate }
}
