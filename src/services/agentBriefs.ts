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
 * Returns only the Supabase rows for active agents, without merging
 * into any static data. Useful when callers only need the
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
