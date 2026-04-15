import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

let channelCounter = 0

export interface TaskRow {
  id: string
  title: string
  description?: string
  status: string
  owner?: string
  agent?: string
  next_step?: string
  priority?: string
  priority_override?: number
  group_label?: string
  workstream?: string
  krish_notes?: string
  krish_reviewed?: boolean
  due_date?: string
  created?: string
  updated_at?: string
  started_at?: string    // Auto-stamped when status changes to in_progress (DB trigger)
  completed_at?: string
  notes?: string
  feedback_text?: string
  link_primary?: string
  link_secondary?: string
  evidence?: string
  venture_id?: string
  [key: string]: any
}

interface Options {
  filter?: (t: TaskRow) => boolean
  statusIn?: string[]
}

export function useRealtimeTasks(opts: Options = {}) {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const channelIdRef = useRef<number | null>(null)
  
  if (channelIdRef.current === null) {
    channelIdRef.current = ++channelCounter
  }

  const fetchAll = useCallback(async () => {
    let q = supabase.from('tasks').select('*').order('updated_at', { ascending: false })
    if (opts.statusIn && opts.statusIn.length) q = q.in('status', opts.statusIn)
    const { data } = await q
    if (data) setTasks(opts.filter ? data.filter(opts.filter) : data as TaskRow[])
    setLoading(false)
  }, [JSON.stringify(opts.statusIn)])

  useEffect(() => {
    fetchAll()
    const channelName = `tasks-rt-${channelIdRef.current}`
    const ch = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchAll())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchAll])

  return { tasks, loading, refresh: fetchAll }
}
