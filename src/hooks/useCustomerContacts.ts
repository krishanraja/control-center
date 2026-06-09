import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCustomers, type CustomerRow } from './useCustomers'

export type ContactReason = 'welcome' | 'check_in' | 'expansion' | 'save' | 'exit_interview' | 'other'

export interface CustomerContactRow {
  id: string
  customer_id: string
  contacted_at: string
  channel?: string | null
  reason?: ContactReason | null
  summary?: string | null
  agent?: string | null
  next_step?: string | null
  created_at: string
}

export interface CouncilEntry {
  customer: CustomerRow
  priority: 'churn_exit' | 'new_welcome' | 'high_value_check_in' | 'long_tenure_expansion' | 'stale_check_in'
  reason: string
  days_since_contact: number | null
  suggested_action: ContactReason
}

const MS_PER_DAY = 86_400_000

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / MS_PER_DAY)
}

/**
 * Pillar 3 — Customer Council. Returns a ranked "next 5 to talk to" queue
 * computed from customers + customer_contacts. Priority order:
 *
 *   1. Recent churn (≤7d) without an exit_interview → critical
 *   2. New paid customer (≤7d) without welcome → high
 *   3. High-MRR (≥$200/mo) paid customer not contacted in 14d → high
 *   4. Long-tenured (≥60d) paid customer not contacted in 30d → med
 *   5. Any paid customer not contacted in 30d → low
 */
export function useCustomerContacts() {
  const { customers, loading: customersLoading } = useCustomers()
  const [contacts, setContacts] = useState<CustomerContactRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error: err } = await supabase
        .from('customer_contacts')
        .select('*')
        .order('contacted_at', { ascending: false })
        .limit(1000)
      if (cancelled) return
      if (err) {
        if (err.code !== 'PGRST205') setError(err.message)
        setContacts([])
      } else {
        setContacts((data as CustomerContactRow[]) || [])
        setError(null)
      }
      setLoading(false)
    }
    load()
    const iv = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  const byCustomer = useMemo(() => {
    const map = new Map<string, CustomerContactRow[]>()
    for (const c of contacts) {
      const arr = map.get(c.customer_id) || []
      arr.push(c)
      map.set(c.customer_id, arr)
    }
    return map
  }, [contacts])

  const council = useMemo<CouncilEntry[]>(() => {
    const entries: CouncilEntry[] = []

    for (const cust of customers) {
      const history = byCustomer.get(cust.id) || []
      const lastContact = history[0]?.contacted_at || null
      const daysSinceContact = lastContact ? daysSince(lastContact) : null

      // 1. Churn exit
      if (cust.kind === 'churned' && cust.churned_at && daysSince(cust.churned_at) <= 7) {
        const hasExit = history.some(h => h.reason === 'exit_interview')
        if (!hasExit) {
          entries.push({
            customer: cust,
            priority: 'churn_exit',
            reason: `Churned ${daysSince(cust.churned_at)}d ago — exit interview overdue`,
            days_since_contact: daysSinceContact,
            suggested_action: 'exit_interview',
          })
          continue
        }
      }

      if (cust.kind !== 'paid' || cust.churned_at) continue
      const paidFor = cust.became_paid_at ? daysSince(cust.became_paid_at) : null

      // 2. New paid (welcome)
      if (paidFor != null && paidFor <= 7) {
        const hasWelcome = history.some(h => h.reason === 'welcome')
        if (!hasWelcome) {
          entries.push({
            customer: cust,
            priority: 'new_welcome',
            reason: `Paid ${paidFor}d ago — no welcome call yet`,
            days_since_contact: daysSinceContact,
            suggested_action: 'welcome',
          })
          continue
        }
      }

      // 3. High-MRR not contacted in 14d
      const mrr = Number(cust.mrr_usd) || 0
      if (mrr >= 200 && (daysSinceContact == null || daysSinceContact >= 14)) {
        entries.push({
          customer: cust,
          priority: 'high_value_check_in',
          reason: `$${Math.round(mrr)}/mo · ${daysSinceContact == null ? 'never contacted' : `last contact ${daysSinceContact}d ago`}`,
          days_since_contact: daysSinceContact,
          suggested_action: 'check_in',
        })
        continue
      }

      // 4. Long tenure not contacted in 30d
      if (paidFor != null && paidFor >= 60 && (daysSinceContact == null || daysSinceContact >= 30)) {
        entries.push({
          customer: cust,
          priority: 'long_tenure_expansion',
          reason: `Paid ${paidFor}d · ${daysSinceContact == null ? 'never contacted' : `last contact ${daysSinceContact}d ago`} — expansion check`,
          days_since_contact: daysSinceContact,
          suggested_action: 'expansion',
        })
        continue
      }

      // 5. Stale fallback
      if (daysSinceContact == null || daysSinceContact >= 30) {
        entries.push({
          customer: cust,
          priority: 'stale_check_in',
          reason: daysSinceContact == null ? 'Never contacted' : `No contact in ${daysSinceContact}d`,
          days_since_contact: daysSinceContact,
          suggested_action: 'check_in',
        })
      }
    }

    const priorityRank: Record<CouncilEntry['priority'], number> = {
      churn_exit: 0,
      new_welcome: 1,
      high_value_check_in: 2,
      long_tenure_expansion: 3,
      stale_check_in: 4,
    }
    entries.sort((a, b) => {
      const pa = priorityRank[a.priority] - priorityRank[b.priority]
      if (pa !== 0) return pa
      return (Number(b.customer.mrr_usd) || 0) - (Number(a.customer.mrr_usd) || 0)
    })
    return entries.slice(0, 8)
  }, [customers, byCustomer])

  const expansionTargets = useMemo(() => {
    return customers.filter(c => {
      if (c.kind !== 'paid' || c.churned_at) return false
      const paidFor = c.became_paid_at ? daysSince(c.became_paid_at) : 0
      const isStarter = c.plan?.toLowerCase().includes('starter') || (Number(c.mrr_usd) || 0) < 50
      return paidFor >= 60 && isStarter
    }).slice(0, 5)
  }, [customers])

  const recentContacts = useMemo(() => contacts.slice(0, 10), [contacts])

  const streakDays = useMemo(() => {
    if (contacts.length === 0) return 0
    let streak = 0
    let cursor = new Date()
    cursor.setHours(0, 0, 0, 0)
    const dates = new Set(contacts.map(c => {
      const d = new Date(c.contacted_at); d.setHours(0, 0, 0, 0)
      return d.toISOString()
    }))
    for (;;) {
      const key = cursor.toISOString()
      if (!dates.has(key)) break
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    }
    return streak
  }, [contacts])

  return {
    council, expansionTargets, recentContacts, contacts,
    streakDays,
    loading: customersLoading || loading,
    error,
  }
}
