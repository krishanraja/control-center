import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

// Resolve the parent portfolio objective title for a set of task ids, via
// tasks.milestone_id -> milestones.goal_id -> goals.title. Returns a map of
// taskId -> objective title; task ids with no milestone chain are omitted.
//
// Promoted out of TopThreeCards (Phase 1 daily spine) so the cards, the daily
// TrackStep, and the commit picker can all share one implementation. The
// caller passes the ids; ids that are not real task uuids simply miss.
export function useTaskParentObjectives(taskIds: string[]): Record<string, string> {
  // Stable key so the effect only refires when the actual id set changes,
  // not on every render that produces a new array identity.
  const key = useMemo(() => taskIds.slice().sort().join('|'), [taskIds])
  const [parents, setParents] = useState<Record<string, string>>({})

  useEffect(() => {
    const ids = key ? key.split('|') : []
    if (ids.length === 0) { setParents({}); return }
    let cancelled = false
    void (async () => {
      try {
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, milestone_id')
          .in('id', ids)
        const milestoneIds = (tasks || []).map(t => t.milestone_id).filter(Boolean) as string[]
        if (milestoneIds.length === 0) { if (!cancelled) setParents({}); return }
        const { data: milestones } = await supabase
          .from('milestones')
          .select('id, goal_id')
          .in('id', milestoneIds)
        const goalIds = Array.from(new Set((milestones || []).map(m => m.goal_id).filter(Boolean) as string[]))
        if (goalIds.length === 0) { if (!cancelled) setParents({}); return }
        const { data: goals } = await supabase
          .from('goals')
          .select('id, title')
          .in('id', goalIds)
        const goalTitle = new Map<string, string>((goals || []).map(g => [g.id as string, g.title as string]))
        const milestoneGoal = new Map<string, string>((milestones || []).map(m => [m.id as string, m.goal_id as string]))
        const taskMilestone = new Map<string, string>((tasks || []).map(t => [t.id as string, t.milestone_id as string]))
        const next: Record<string, string> = {}
        for (const tid of ids) {
          const mid = taskMilestone.get(tid)
          if (!mid) continue
          const gid = milestoneGoal.get(mid)
          if (!gid) continue
          const title = goalTitle.get(gid)
          if (title) next[tid] = title
        }
        if (!cancelled) setParents(next)
      } catch {
        if (!cancelled) setParents({})
      }
    })()
    return () => { cancelled = true }
  }, [key])

  return parents
}
