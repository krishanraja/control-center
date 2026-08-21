import React, { useState } from 'react'
import {
  Plus, Inbox, Sparkles, Search, ImagePlus, Target, CalendarCheck, ListChecks, Send,
  type LucideIcon,
} from 'lucide-react'
import { BottomSheet } from './mobile/BottomSheet'
import { IdeaCaptureModal, isInboxEnabled } from './inbox/IdeaCaptureModal'
import { ContentIdeaModal } from './QuickCaptureIdea'
import { StartFromResearch } from './content/StartFromResearch'
import { AddPersonModal } from './network/AddPersonFromImage'
import { openFocusRitual } from '../lib/focusRitual'
import { requestCreate } from '../lib/quickCreate'
import { useHaptics } from '../hooks/useHaptics'

/**
 * The one create system on a phone.
 *
 * One purple + button, bottom right on every tab, opening one sheet: the
 * current tab's create actions first, then the two captures that work from
 * anywhere. It replaces the two-item capture speed dial AND the per-tab
 * inline buttons ("Start from research", "Add from screenshot", the goal
 * "+ Add" links), which each invented their own placement and left the +
 * doing the same two things everywhere.
 *
 * Mounted from App keyed on the same `narrow` state as the mobile shell (the
 * old md:hidden gate cut out at 768px while the shell runs to 900-1024px, so
 * a band of viewports had no create control at all) and hidden while a
 * full-screen overlay owns the screen (it used to paint over the brief
 * editor's own footer).
 *
 * Actions that a tab's own components own (the goal composer, the ask
 * compose field) are reached over the quickCreate bus; self-contained flows
 * (research, add a person, the two captures) are mounted here.
 */

type ModalId = 'task' | 'idea' | 'research' | 'person'

interface CreateAction {
  id: string
  label: string
  hint: string
  icon: LucideIcon
  run: () => void
}

export function CreateSheet({ tab }: { tab: string }) {
  const h = useHaptics()
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState<ModalId | null>(null)

  const go = (fn: () => void) => () => {
    h.select()
    setOpen(false)
    fn()
  }

  const tabActions: CreateAction[] = (() => {
    switch (tab) {
      case 'home':
        return [
          { id: 'today3', label: "Set today's 3", hint: 'Pick the three things today is for', icon: ListChecks, run: go(() => openFocusRitual('daily')) },
          { id: 'weekly', label: 'Add a weekly objective', hint: 'What moves an OS goal this week', icon: CalendarCheck, run: go(() => requestCreate('goal:weekly')) },
          { id: 'os', label: 'Add an OS goal', hint: 'What the whole system is for', icon: Target, run: go(() => requestCreate('goal:os')) },
        ]
      case 'content':
        return [
          { id: 'research', label: 'Start from research', hint: 'Name a topic, or paste what you already have', icon: Search, run: go(() => setModal('research')) },
        ]
      case 'people':
        return [
          { id: 'person', label: 'Add a person', hint: 'From a LinkedIn screenshot. You confirm before it saves', icon: ImagePlus, run: go(() => setModal('person')) },
        ]
      case 'focus':
        return [
          { id: 'ask', label: "Write today's ask", hint: 'One clear request to one person', icon: Send, run: go(() => requestCreate('ask')) },
        ]
      default:
        return []
    }
  })()

  const globalActions: CreateAction[] = [
    ...(isInboxEnabled()
      ? [{ id: 'task', label: 'Capture a task', hint: 'Sonnet routes it to the right agent', icon: Inbox, run: go(() => setModal('task')) }]
      : []),
    { id: 'idea', label: 'Capture an idea', hint: 'Cleo enriches and dedupes it', icon: Sparkles, run: go(() => setModal('idea')) },
  ]

  return (
    <>
      <button
        type="button"
        aria-label="Create"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { h.select(); setOpen(true) }}
        className="fixed right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full border border-violet-300/40 bg-violet-500/90 text-[#fff] shadow-2xl transition-colors hover:bg-violet-500"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 92px)' }}
      >
        <Plus size={22} strokeWidth={2.5} />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} fullHeight={false} ariaLabel="Create">
        <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
          {tabActions.length > 0 && (
            <div className="flex flex-col">
              {tabActions.map(a => <ActionRow key={a.id} action={a} />)}
            </div>
          )}
          {tabActions.length > 0 && globalActions.length > 0 && (
            <div className="my-2 h-px bg-white/[0.07]" aria-hidden />
          )}
          <div className="flex flex-col">
            {globalActions.map(a => <ActionRow key={a.id} action={a} />)}
          </div>
        </div>
      </BottomSheet>

      <IdeaCaptureModal open={modal === 'task'} onClose={() => setModal(null)} source="mobile" />
      <ContentIdeaModal open={modal === 'idea'} onClose={() => setModal(null)} />
      <StartFromResearch open={modal === 'research'} onClose={() => setModal(null)} />
      <AddPersonModal open={modal === 'person'} onClose={() => setModal(null)} />
    </>
  )
}

function ActionRow({ action }: { action: CreateAction }) {
  const Icon = action.icon
  return (
    <button
      type="button"
      onClick={action.run}
      className="flex w-full items-center gap-3.5 rounded-xl px-2 py-3 text-left transition-colors active:bg-white/[0.06]"
    >
      <span className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-violet-300/30 bg-violet-500/15 text-violet-200">
        <Icon size={19} strokeWidth={1.9} />
      </span>
      <span className="min-w-0">
        <span className="block text-ui font-semibold leading-tight text-white/90">{action.label}</span>
        <span className="mt-0.5 block text-label leading-tight text-white/45">{action.hint}</span>
      </span>
    </button>
  )
}
