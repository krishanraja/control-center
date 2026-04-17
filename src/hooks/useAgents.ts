import { useState, useEffect, useCallback, useRef } from 'react'
import { Agent } from '../types'

interface ApiAgent {
  id: string
  name: string
  role?: string
  pod?: string
  active?: boolean
  mandate?: string | null
  last_run?: string | null
  last_output?: string | null
  brief_content?: string | null
  brief_updated_at?: string | null
  brief_checksum?: string | null
  plan_doc_url?: string | null
  status?: string | null
  model?: string | null
  personality?: string | null
  mission?: string | null
  expected_runs_per_day?: number | null
  kpi_label?: string | null
  kpi_target?: string | null
  kpi_current?: string | null
  human_name?: string | null
  schedule?: string | null
  tasks: { total: number; active: number; done: number; blocked: number }
}

interface ApiResponse {
  agents: ApiAgent[]
  updated_at: string
}

function deriveStatus(api: ApiAgent): Agent['status'] {
  const t = api.tasks
  if (t.blocked > 0) return 'blocked'
  if (t.active > 0) return 'running'
  if (t.total > 0 && t.total === t.done) return 'success'
  return 'waiting'
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function mapToAgent(live: ApiAgent): Agent {
  const model = (live.model === 'opus' || live.model === 'sonnet' || live.model === 'haiku')
    ? live.model
    : 'sonnet'
  const pod = (live.pod === 'ops' || live.pod === 'revenue' || live.pod === 'growth')
    ? live.pod
    : undefined
  return {
    id: live.id,
    name: live.name,
    humanName: live.human_name || titleCase(live.name),
    role: live.role || '',
    model,
    schedule: live.schedule || '',
    nextRun: new Date(0),
    lastRun: live.last_run ? new Date(live.last_run) : undefined,
    status: deriveStatus(live),
    personality: live.personality ?? undefined,
    mission: live.mission ?? undefined,
    currentWork: [],
    collaborations: [],
    nextActions: [],
    workSummary: live.last_output ?? undefined,
    pod,
    planDocUrl: live.plan_doc_url ?? undefined,
    briefContent: live.brief_content ?? undefined,
    briefUpdatedAt: live.brief_updated_at ?? undefined,
    briefChecksum: live.brief_checksum ?? undefined,
    expected_runs_per_day: live.expected_runs_per_day ?? null,
    active: live.active ?? undefined,
    mandate: live.mandate ?? null,
    kpi_label: live.kpi_label ?? undefined,
    kpi_target: live.kpi_target ?? undefined,
    kpi_current: live.kpi_current ?? undefined,
  }
}

export function useAgents(intervalMs = 60_000) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/agents', {
        cache: 'no-cache',
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: ApiResponse = await res.json()

      setAgents(data.agents.map(mapToAgent))
      setUpdatedAt(new Date(data.updated_at))
      setError(null)
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, intervalMs)
    return () => {
      abortRef.current?.abort()
      clearInterval(iv)
    }
  }, [refresh, intervalMs])

  return { agents, updatedAt, loading, error, refresh }
}
