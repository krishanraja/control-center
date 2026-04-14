import React, { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { supabase } from '../lib/supabase'

interface Props {
  open: boolean
  onClose: () => void
  onTab: (tab: string) => void
}

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'today', label: 'Today' },
  { id: 'plans', label: 'Plans' },
  { id: 'org', label: 'Org' },
  { id: 'exec', label: 'Intel' },
  { id: 'workflows', label: 'Flows' },
  { id: 'systems', label: 'Systems' },
]

export function CommandPalette({ open, onClose, onTab }: Props) {
  const [tasks, setTasks] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])

  useEffect(() => {
    if (!open) return
    supabase.from('tasks').select('id,title,status').neq('status', 'done').limit(50).then(({ data }) => setTasks((data as any) || []))
    supabase.from('agents').select('id,name,pod').eq('active', true).then(({ data }) => setAgents((data as any) || []))
  }, [open])

  const approve = async (id: string) => {
    await supabase.from('tasks').update({ status: 'active', krish_reviewed: true, updated_at: new Date().toISOString() }).eq('id', id)
    onClose()
  }
  const markDone = async (id: string) => {
    await supabase.from('tasks').update({ status: 'done', krish_reviewed: true, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[640px] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
        <Command className="rounded-xl border border-white/[0.12] bg-[#111113] shadow-2xl overflow-hidden" label="Global command">
          <Command.Input
            autoFocus
            placeholder="Search tasks, agents, tabs…"
            className="w-full bg-transparent px-4 py-3 text-[14px] text-white placeholder-white/30 border-b border-white/[0.06] focus:outline-none"
          />
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-4 text-[12px] text-white/35">No results</Command.Empty>

            <Command.Group heading="Navigate">
              {TABS.map(t => (
                <Command.Item key={t.id} value={`tab ${t.label}`} onSelect={() => { onTab(t.id); onClose() }} className="flex items-center justify-between px-3 py-2 rounded-lg text-[13px] text-white/70 cursor-pointer data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-white">
                  <span>Go to {t.label}</span>
                  <span className="text-[10px] text-white/30">tab</span>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Tasks">
              {tasks.map(t => (
                <Command.Item key={t.id} value={`task ${t.title}`} onSelect={() => { onTab('plans'); onClose() }} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[13px] text-white/70 cursor-pointer data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-white">
                  <span className="truncate flex-1">{t.title}</span>
                  <span className="text-[10px] text-white/35">{t.status}</span>
                  <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => approve(t.id)} className="text-[10px] text-violet-400 hover:text-violet-300 px-1.5 py-0.5 rounded border border-violet-500/20">Approve</button>
                    <button onClick={() => markDone(t.id)} className="text-[10px] text-emerald-400 hover:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/20">Done</button>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Agents">
              {agents.map(a => (
                <Command.Item key={a.id} value={`agent ${a.name}`} onSelect={() => { onTab('org'); onClose() }} className="flex items-center justify-between px-3 py-2 rounded-lg text-[13px] text-white/70 cursor-pointer data-[selected=true]:bg-white/[0.06] data-[selected=true]:text-white">
                  <span>{a.name}</span>
                  <span className="text-[10px] text-white/35">{a.pod}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
