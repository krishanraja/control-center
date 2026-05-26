import { useCallback, useEffect, useState } from 'react'

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
    const onHash = () => setRoute(parseHash(window.location.hash))
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
            `[data-target-id="${targetId}"], [data-task-id="${targetId}"], [data-lead-id="${targetId}"], [data-guest-id="${targetId}"], [data-idea-id="${targetId}"], [data-correction-id="${targetId}"]`
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
        window.scrollTo({ top: 0, behavior: 'smooth' })
        document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }, 60)
  }, [])

  return { route, navigate }
}
