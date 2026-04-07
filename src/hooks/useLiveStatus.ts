import { useState, useEffect } from 'react'

export interface WorkflowStatus {
  id: string
  name: string
  active: boolean
  lastStatus: 'success' | 'error' | 'running' | 'never'
  lastRun: string | null
}

export interface LiveStatus {
  ok: boolean
  fetched_at: string | null
  workflows: {
    total: number
    active: number
    errors: number
    running: number
    list: WorkflowStatus[]
  }
  loading: boolean
  error: string | null
}

const DEFAULT: LiveStatus = {
  ok: false,
  fetched_at: null,
  workflows: { total: 0, active: 0, errors: 0, running: 0, list: [] },
  loading: true,
  error: null,
}

export function useLiveStatus(intervalMs = 60_000): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>(DEFAULT)

  const fetch_status = async () => {
    try {
      const res = await fetch('/api/status')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setStatus({ ...data, loading: false, error: null })
    } catch (err: any) {
      setStatus(prev => ({ ...prev, loading: false, error: err.message }))
    }
  }

  useEffect(() => {
    fetch_status()
    const timer = setInterval(fetch_status, intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])

  return status
}
