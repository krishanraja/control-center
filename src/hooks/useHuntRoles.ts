import { useCallback, useEffect, useState } from 'react'

// The roles Krish said Yes to on the Pipeline sheet, with the package and
// the person hunter found. Read through the gated /api/hunter/roles route:
// the bridge and person data is private judgment about named people.

export interface HuntPerson {
  name: string
  title: string | null
  company: string | null
  linkedin_url: string | null
  // One click to contact needs an address; without it the lane could only ever
  // show a name and leave him to go looking.
  email: string | null
}

export interface HuntBridge {
  bridge_id: string
  tier: string
  evidence: string
  /** The drafted opener, carried so the contact click takes it along. */
  ask: string
  state: string
}

export interface HuntRole {
  job_id: string
  company: string
  title: string
  url: string | null
  score: number | null
  location: string | null
  comp: string | null
  status: string | null
  package_status: string | null
  package_built_at: string | null
  cv_url: string | null
  letter_url: string | null
  rejection_reason: string | null
  why_it_fits: string | null
  bridge: HuntBridge | null
  person: HuntPerson | null
  // Null means not applied. Set by hunter from Krish's column A verdict or from a
  // recorded submission, never authored in the app.
  application_state: string | null
  applied_at: string | null
}

export function useHuntRoles() {
  const [roles, setRoles] = useState<HuntRole[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/hunter/roles')
      const j = await r.json()
      if (j?.ok) setRoles((j.roles as HuntRole[]) || [])
    } catch {
      // the lane renders its quiet empty state; the next poll retries
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const poll = setInterval(load, 120_000)
    return () => clearInterval(poll)
  }, [load])

  return { roles, loading, refetch: load }
}
