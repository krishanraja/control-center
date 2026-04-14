import { Agent } from '../types'
import { AGENTS } from './agentData'

export interface SupabaseAgent {
  id: string
  name: string
  active: boolean
  brief_content?: string | null
  brief_updated_at?: string | null
  brief_checksum?: string | null
  plan_doc_url?: string | null
  role?: string | null
  model?: string | null
  pod?: string | null
  status?: string | null
}

/**
 * Fetches agent data from Supabase and merges brief fields into the
 * static AGENTS array. Components that only need brief metadata (such as
 * brief_updated_at or brief_checksum) can call this instead of reading
 * the old static JSON files in public/data/agent-briefs/.
 */
export async function loadAgentsWithBriefs(): Promise<Agent[]> {
  try {
    const { supabase } = await import('../lib/supabase')
    const { data } = await supabase
      .from('agents')
      .select('*')
      .eq('active', true)

    if (!data || data.length === 0) return AGENTS

    const byName: Record<string, SupabaseAgent> = {}
    for (const row of data as SupabaseAgent[]) {
      const key = (row.name || row.id || '').toLowerCase()
      byName[key] = row
    }

    return AGENTS.map(agent => {
      const key = agent.name.toLowerCase()
      const sb = byName[key]
      if (!sb) return agent
      return {
        ...agent,
        planDocUrl: sb.plan_doc_url || agent.planDocUrl,
        briefContent: sb.brief_content ?? undefined,
        briefUpdatedAt: sb.brief_updated_at ?? undefined,
        briefChecksum: sb.brief_checksum ?? undefined,
      }
    })
  } catch (err) {
    console.error('Failed to load agents from Supabase, falling back to static data:', err)
    return AGENTS
  }
}

/**
 * Returns only the Supabase rows for active agents, without merging
 * into the static AGENTS array. Useful when callers only need the
 * database fields (e.g. brief freshness checks).
 */
export async function loadSupabaseAgents(): Promise<SupabaseAgent[]> {
  try {
    const { supabase } = await import('../lib/supabase')
    const { data } = await supabase
      .from('agents')
      .select('*')
      .eq('active', true)
    return (data ?? []) as SupabaseAgent[]
  } catch (err) {
    console.error('Failed to load Supabase agents:', err)
    return []
  }
}
