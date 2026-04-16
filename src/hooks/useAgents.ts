import { useState, useEffect, useCallback, useRef } from 'react'
import { Agent } from '../types'
import { AGENTS } from '../services/agentData'

interface ApiAgent {
  id: string
  name: string
  role?: string
  pod?: string
  active?: boolean
  mandate?: string
  last_run?: string | null
  last_output?: string | null
  brief_content?: string | null
  brief_updated_at?: string | null
  brief_checksum?: string | null
  plan_doc_url?: string | null
  status?: string | null
  model?: string | null
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

export function useAgents(intervalMs = 60_000) {
  const [agents, setAgents] = useState<Agent[]>(AGENTS)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/agents', { cache: 'no-cache' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: ApiResponse = await res.json()

      if (!mountedRef.current) return

      // Build lookup by id from API response
      const liveById = new Map<string, ApiAgent>()
      for (const a of data.agents) {
        liveById.set(a.id, a)
        liveById.set(a.name.toLowerCase(), a)
      }

      // Merge: static AGENTS base + live overlay
      const merged = AGENTS.map(staticAgent => {
        const live = liveById.get(staticAgent.id)
          || liveById.get(staticAgent.name.toLowerCase())
        if (!live) return staticAgent

        return {
          ...staticAgent,
          status: deriveStatus(live),
          lastRun: live.last_run ? new Date(live.last_run) : staticAgent.lastRun,
          workSummary: live.last_output || staticAgent.workSummary,
          planDocUrl: live.plan_doc_url || staticAgent.planDocUrl,
          briefContent: live.brief_content ?? staticAgent.briefContent,
          briefUpdatedAt: live.brief_updated_at ?? staticAgent.briefUpdatedAt,
          briefChecksum: live.brief_checksum ?? staticAgent.briefChecksum,
          role: live.role || staticAgent.role,
          pod: (live.pod as Agent['pod']) || staticAgent.pod,
        }
      })

      setAgents(merged)
      setUpdatedAt(new Date(data.updated_at))
      setError(null)
    } catch (err: any) {
      if (mountedRef.current) setError(err.message)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    refresh()
    const iv = setInterval(refresh, intervalMs)
    return () => {
      mountedRef.current = false
      clearInterval(iv)
    }
  }, [refresh, intervalMs])

  return { agents, updatedAt, loading, error, refresh }
}
