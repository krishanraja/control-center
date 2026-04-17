import React, { createContext, useContext, useMemo } from 'react'
import { Agent } from '../types'
import { useAgents } from '../hooks/useAgents'

interface AgentsContextValue {
  agents: Agent[]
  updatedAt: Date | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  resolveAgent: (idOrName: string) => Agent | undefined
}

const AgentsContext = createContext<AgentsContextValue | null>(null)

export function AgentsProvider({ children }: { children: React.ReactNode }) {
  const { agents, updatedAt, loading, error, refresh } = useAgents()

  const value = useMemo<AgentsContextValue>(() => {
    const byKey = new Map<string, Agent>()
    for (const a of agents) {
      byKey.set(a.id.toLowerCase(), a)
      byKey.set(a.name.toLowerCase(), a)
      if (a.humanName) byKey.set(a.humanName.toLowerCase(), a)
    }
    return {
      agents,
      updatedAt,
      loading,
      error,
      refresh,
      resolveAgent: (idOrName: string) => {
        if (!idOrName) return undefined
        return byKey.get(idOrName.toLowerCase())
      },
    }
  }, [agents, updatedAt, loading, error, refresh])

  return <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>
}

export function useAgentsContext(): AgentsContextValue {
  const ctx = useContext(AgentsContext)
  if (!ctx) {
    return {
      agents: [],
      updatedAt: null,
      loading: false,
      error: null,
      refresh: async () => {},
      resolveAgent: () => undefined,
    }
  }
  return ctx
}
