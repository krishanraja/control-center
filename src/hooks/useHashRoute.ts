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
  }, [])

  return { route, navigate }
}
