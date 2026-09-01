import { useState } from 'react'
import {
  Check, Clock, ExternalLink, HeartHandshake, History, Megaphone, Compass, Save, X,
} from '@/lib/icons'
import type { LucideIcon } from '@/lib/icons'
import { useToast } from './shared/Toast'
import { Working } from './shared/Working'
import { patchBridge } from '../hooks/useBridges'
import type { BridgeRow, BridgeState, BridgeTier } from '../hooks/useBridges'

// One warm path into one target role. The card carries its own evidence and
// an editable ask. Krish sends everything himself: there is no send button
// here and there never will be one.

const TIER_META: Record<BridgeTier, { label: string; Icon: LucideIcon; chip: string }> = {
  current_employee: { label: 'Works there now', Icon: HeartHandshake, chip: 'bg-emerald-500/10 text-emerald-300' },
  ex_employee: { label: 'Worked there', Icon: History, chip: 'bg-violet-500/15 text-violet-200' },
  headhunter: { label: 'Headhunter path', Icon: Megaphone, chip: 'bg-amber-500/10 text-amber-300' },
  peer_transition: { label: 'Outside network', Icon: Compass, chip: 'bg-white/[0.08] text-white/60' },
}

interface Props {
  bridge: BridgeRow
  onChanged: () => void
}

export function BridgeCard({ bridge: b, onChanged }: Props) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<null | 'reached' | 'snooze' | 'drop' | 'draft'>(null)
  const [draft, setDraft] = useState(b.draft_ask)
  const meta = TIER_META[b.path_tier] || TIER_META.peer_transition
  const TierIcon = meta.Icon

  const person = b.contact
    ? `${b.contact.full_name}`
    : b.path_tier === 'headhunter'
      ? 'Retained search partner'
      : 'Person to find'
  const personLine = b.contact
    ? [b.contact.current_title, b.contact.current_company].filter(Boolean).join(', ')
    : b.path_tier === 'peer_transition'
      ? 'Someone who made the same move. The draft below says who to look for.'
      : ''

  const setState = async (next: BridgeState, key: 'reached' | 'snooze' | 'drop', done: string) => {
    if (busy) return
    setBusy(key)
    try {
      await patchBridge(b.bridge_id, { state: next })
      toast(done, 'success')
      onChanged()
    } catch (err) {
      toast(`Could not update: ${(err as Error)?.message || 'try again'}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  const saveDraft = async () => {
    if (busy) return
    setBusy('draft')
    try {
      await patchBridge(b.bridge_id, { draft_ask: draft })
      toast('Draft saved. Sending stays yours.', 'success')
      onChanged()
    } catch (err) {
      toast(`Could not save: ${(err as Error)?.message || 'try again'}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-3.5 hover:border-violet-500/35 transition-colors">
      <div className="flex items-start justify-between gap-x-3 gap-y-1.5 flex-wrap">
        <div className="min-w-0 basis-40 grow">
          <h3 className="text-ui font-semibold text-white">{person}</h3>
          {personLine && <p className="text-label text-white/55 mt-0.5">{personLine}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`inline-flex items-center gap-1 text-micro px-1.5 py-0.5 rounded ${meta.chip}`}>
            <TierIcon size={10} />
            {meta.label}
          </span>
          {b.contact && (
            <span className="text-micro px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-200 tabular-nums">
              Strength {b.contact.strength_score}
            </span>
          )}
        </div>
      </div>

      {b.role && (
        <p className="text-label text-white/70 mt-2">
          Why now: {b.role.title} is open at {b.role.company}
          {typeof b.role.score === 'number' && (
            <span className="text-white/45 tabular-nums"> (fit {b.role.score}/10)</span>
          )}
          {b.role.url && (
            <a
              href={b.role.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 ml-1.5 text-violet-300 hover:text-violet-200"
            >
              <ExternalLink size={11} />
              posting
            </a>
          )}
        </p>
      )}

      <p className="text-label text-white/55 mt-1.5">{b.path_evidence}</p>

      <div className="mt-3">
        <p className="text-micro uppercase tracking-[0.14em] text-white/35 mb-1">Your ask, edit freely</p>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-white/10 bg-white/[0.03] p-2 text-body text-white/85 focus:border-violet-500/40 focus:outline-none resize-y"
        />
        {draft !== b.draft_ask && (
          <button
            type="button"
            onClick={saveDraft}
            disabled={busy !== null}
            className="mt-1 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-label font-medium border border-violet-500/30 text-violet-200 hover:bg-violet-500/10 disabled:opacity-40 transition-colors"
          >
            {busy === 'draft' ? <Working size={12} /> : <Save size={12} />}
            Save draft
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={() => setState('reached_out', 'reached', 'Marked reached out. Track the reply.')}
          disabled={busy !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-label font-semibold bg-amber-500/90 text-black hover:bg-amber-400 disabled:opacity-40 transition-colors"
          title="You contacted them yourself, outside this app"
        >
          {busy === 'reached' ? <Working size={12} /> : <Check size={12} />}
          Mark reached out
        </button>
        <button
          type="button"
          onClick={() => setState('snoozed', 'snooze', 'Snoozed. It leaves the top five for now.')}
          disabled={busy !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-label font-medium border border-white/15 text-white/75 hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
        >
          {busy === 'snooze' ? <Working size={12} /> : <Clock size={12} />}
          Snooze
        </button>
        <button
          type="button"
          onClick={() => setState('not_a_path', 'drop', 'Noted. It will not come back.')}
          disabled={busy !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-label font-medium border border-white/15 text-white/75 hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
        >
          {busy === 'drop' ? <Working size={12} /> : <X size={12} />}
          Not a path
        </button>
      </div>
    </article>
  )
}
