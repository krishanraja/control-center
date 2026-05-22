import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface StreakSnapshot {
  customer_contacts: number
  content_shipped:   number
  sales_touches:     number
  daily_lock_done:   boolean   // any lever_score>=7 task marked done today?
  loading: boolean
}

const MS_PER_DAY = 86_400_000

function consecutiveDaysWithEvent(timestamps: string[]): number {
  if (timestamps.length === 0) return 0
  const days = new Set<string>()
  for (const t of timestamps) {
    const d = new Date(t); d.setHours(0, 0, 0, 0)
    days.add(d.toISOString())
  }
  let streak = 0
  const cursor = new Date(); cursor.setHours(0, 0, 0, 0)
  for (;;) {
    if (!days.has(cursor.toISOString())) break
    streak += 1
    cursor.setTime(cursor.getTime() - MS_PER_DAY)
  }
  return streak
}

/**
 * Pillar 5 — streak counters + Daily Lock derivation.
 * - Customer-contacts streak (requires Pillar 3 customer_contacts table)
 * - Content-shipped streak (tasks workstream=content status=done)
 * - Sales-touches streak (tasks workstream IN advisory_sales OR
 *   customer-acquisition workstreams + status flipped to contacted/active)
 * - Daily Lock: any lever_score >= threshold task completed_at >= today?
 */
export function useStreaks() {
  const [state, setState] = useState<StreakSnapshot>({
    customer_contacts: 0, content_shipped: 0, sales_touches: 0,
    daily_lock_done: false, loading: true,
  })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const since30d = new Date(Date.now() - 30 * MS_PER_DAY).toISOString()
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

      // Daily lock threshold from system_config (default 7).
      const cfgRes = await supabase
        .from('system_config').select('key, value')
        .in('key', ['daily_lock_threshold','daily_lock_enabled'])
      const threshold = Number(cfgRes.data?.find(r => r.key === 'daily_lock_threshold')?.value) || 7

      const [contactsRes, contentRes, salesRes, leverRes] = await Promise.all([
        supabase.from('customer_contacts').select('contacted_at').gte('contacted_at', since30d).limit(500),
        supabase.from('tasks').select('completed_at').eq('workstream', 'content').eq('status', 'done').gte('completed_at', since30d).limit(500),
        supabase.from('tasks').select('updated_at').in('workstream', ['advisory_sales','outreach','customer_acquisition']).gte('updated_at', since30d).limit(500),
        supabase.from('tasks').select('id').eq('status', 'done').gte('lever_score', threshold).gte('completed_at', todayStart.toISOString()).limit(1),
      ])

      if (cancelled) return
      setState({
        customer_contacts: consecutiveDaysWithEvent((contactsRes.data || []).map(r => r.contacted_at).filter(Boolean) as string[]),
        content_shipped:   consecutiveDaysWithEvent((contentRes.data  || []).map(r => r.completed_at).filter(Boolean) as string[]),
        sales_touches:     consecutiveDaysWithEvent((salesRes.data    || []).map(r => r.updated_at).filter(Boolean) as string[]),
        daily_lock_done:   (leverRes.data || []).length > 0,
        loading: false,
      })
    }
    load()
    const iv = setInterval(load, 5 * 60_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  return state
}
