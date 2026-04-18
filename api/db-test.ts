import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const { supabase } = await import('./_supabase')
    const { count, error } = await supabase
      .from('agents')
      .select('*', { count: 'exact', head: true })
    
    if (error) return res.json({ ok: false, error: error.message })
    return res.json({ ok: true, agentCount: count })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message, stack: e.stack?.split('\n').slice(0, 5) })
  }
}
