import React, { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { Search as SearchIcon } from 'lucide-react'
import { supabase, logKrishAction } from '../lib/supabase'
import { useHaptics } from '../hooks/useHaptics'
import { setMode, setAmbient, getAmbient } from '../lib/theme'
import { TABS as CANONICAL_TABS } from '../lib/tabs'

interface Props {
  open: boolean
  onClose: () => void
  onTab: (tab: string) => void
}

const TABS = CANONICAL_TABS.map(t => ({ id: t.id, label: t.label }))

export function CommandPalette({ open, onClose, onTab }: Props) {
  const h = useHaptics()
  const [tasks, setTasks] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])

  useEffect(() => {
    if (!open) return
    supabase.from('tasks').select('id,title,status,agent,owner').neq('status', 'done').limit(50).then(({ data }) => setTasks((data as any) || []))
    supabase.from('agents').select('id,name,pod').eq('active', true).then(({ data }) => setAgents((data as any) || []))
  }, [open])

  const approve = async (id: string) => {
    h.heavy()
    const { error } = await supabase.from('tasks').update({ status: 'active', krish_reviewed: true, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { h.error() } else { h.success() }
    await logKrishAction(id, 'approve')
    onClose()
  }
  const markDone = async (id: string) => {
    h.heavy()
    const { error } = await supabase.from('tasks').update({ status: 'done', krish_reviewed: true, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { h.error() } else { h.success() }
    await logKrishAction(id, 'done')
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div className="w-[640px] max-w-[92vw] animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <Command
          className="rounded-2xl border border-white/[0.10] bg-base/95 backdrop-blur-2xl shadow-e3 aurora-ring overflow-hidden
            [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-display [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.2em] [&_[cmdk-group-heading]]:text-accent/60"
          label="Global command"
        >
          <div className="flex items-center gap-2.5 px-4 border-b border-white/[0.07]">
            <SearchIcon size={16} className="text-white/35 flex-shrink-0" />
            <Command.Input
              autoFocus
              placeholder="Search tasks, agents, tabs…"
              className="w-full bg-transparent py-3.5 text-[15px] text-white placeholder-white/30 focus:outline-none"
            />
            <kbd className="hidden sm:inline-block rounded-md border border-white/12 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-mono text-white/40">esc</kbd>
          </div>
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-4 text-[12px] text-white/35">No results</Command.Empty>

            <Command.Group heading="Navigate">
              {TABS.map(t => (
                <Command.Item key={t.id} value={`tab ${t.label}`} onSelect={() => { h.select(); onTab(t.id); onClose() }} className="flex items-center justify-between px-3 py-2 rounded-lg text-[13px] text-white/70 cursor-pointer data-[selected=true]:bg-violet-500/[0.14] data-[selected=true]:text-white data-[selected=true]:ring-1 data-[selected=true]:ring-violet-400/20">
                  <span>Go to {t.label}</span>
                  <span className="text-[10px] text-white/30">tab</span>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Appearance">
              {([
                ['Switch to light', () => setMode('light')],
                ['Switch to dark', () => setMode('dark')],
                ['Use system theme', () => setMode('system')],
                [getAmbient() ? 'Turn ambient effects off' : 'Turn ambient effects on', () => setAmbient(!getAmbient())],
              ] as [string, () => void][]).map(([label, run]) => (
                <Command.Item key={label} value={`appearance ${label}`} onSelect={() => { h.select(); run(); onClose() }} className="flex items-center justify-between px-3 py-2 rounded-lg text-[13px] text-white/70 cursor-pointer data-[selected=true]:bg-violet-500/[0.14] data-[selected=true]:text-white data-[selected=true]:ring-1 data-[selected=true]:ring-violet-400/20">
                  <span>{label}</span>
                  <span className="text-[10px] text-white/30">theme</span>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Tasks">
              {tasks.map(t => (
                <Command.Item key={t.id} value={`task ${t.title}`} onSelect={() => { onTab('today'); onClose() }} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[13px] text-white/70 cursor-pointer data-[selected=true]:bg-violet-500/[0.14] data-[selected=true]:text-white data-[selected=true]:ring-1 data-[selected=true]:ring-violet-400/20">
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
                <Command.Item key={a.id} value={`agent ${a.name}`} onSelect={() => { onTab('org'); onClose() }} className="flex items-center justify-between px-3 py-2 rounded-lg text-[13px] text-white/70 cursor-pointer data-[selected=true]:bg-violet-500/[0.14] data-[selected=true]:text-white data-[selected=true]:ring-1 data-[selected=true]:ring-violet-400/20">
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
