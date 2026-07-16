import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { useVentureRegistry, type VentureRow } from '../../hooks/useVentureRegistry'
import { laneAction } from '../../hooks/useLaneDetail'
import { useToast } from '../shared/Toast'

type VoiceProfile = NonNullable<VentureRow['voice_profile']>

/**
 * Lane Playbook — the lane's own voice, ICP, and cut-through strategy
 * (venture_registry.voice_profile). This is the contract every agent-written
 * touch, reply, and sequence proposal must conform to; surfacing it here
 * keeps drift visible, and inline editing lets Krish amend the strategy
 * without SQL. Product-brand only, never the personal brand.
 */
export function LanePlaybookCard({ lane }: { lane: string }) {
  const { ventures } = useVentureRegistry()
  const { toast } = useToast()
  const registryProfile = ventures.find(v => v.slug === lane)?.voice_profile || null
  const [profile, setProfile] = useState<VoiceProfile | null>(registryProfile)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({ voice: '', icp: '', strategy: '', never_say: '' })

  // Track lane switches (registry loads once; local state carries amendments).
  useEffect(() => {
    setProfile(registryProfile)
    setEditing(false)
  }, [lane]) // eslint-disable-line react-hooks/exhaustive-deps

  const vp = profile
  if (!vp && !registryProfile) return null
  const view = vp || registryProfile!

  const startEdit = () => {
    setDraft({
      voice: view.voice || '',
      icp: view.icp || '',
      strategy: view.strategy || '',
      never_say: (view.never_say || []).join(', '),
    })
    setEditing(true)
  }

  const save = async () => {
    if (busy) return
    setBusy(true)
    try {
      const { status, body } = await laneAction(lane, {
        action: 'set_voice',
        voice_profile: {
          voice: draft.voice,
          icp: draft.icp,
          strategy: draft.strategy,
          never_say: draft.never_say.split(',').map(s => s.trim()).filter(Boolean),
        },
      })
      if (status >= 400) throw new Error(body?.error || `HTTP ${status}`)
      setProfile(body.voice_profile)
      setEditing(false)
      toast('Playbook amended — every agent-written touch now conforms.', 'success')
    } catch (e: any) {
      toast(e?.message || 'Save failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
      <header className="px-4 py-3 flex items-center gap-2 border-b border-white/[0.06]">
        <BookOpen size={13} className="text-violet-400" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Lane playbook
        </h2>
        <span className="ml-auto flex items-center gap-2">
          {view.sender && <span className="text-[10px] text-white/35">{view.sender}</span>}
          <button
            type="button"
            onClick={() => (editing ? setEditing(false) : startEdit())}
            className="text-[10px] font-medium text-white/40 hover:text-white/80 transition-colors"
          >
            {editing ? 'Cancel' : 'Amend'}
          </button>
        </span>
      </header>

      {editing ? (
        <div className="px-4 py-3 space-y-2">
          {([
            ['Voice', 'voice'],
            ['ICP', 'icp'],
            ['Cut-through strategy', 'strategy'],
          ] as const).map(([label, key]) => (
            <label key={key} className="block">
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/30">{label}</span>
              <textarea
                value={draft[key]}
                onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                rows={2}
                className="mt-0.5 w-full rounded-md bg-white/[0.04] border border-white/[0.08] px-2.5 py-1.5 text-[11.5px] text-white/85 leading-snug focus:outline-none focus:border-violet-400/50 resize-y"
              />
            </label>
          ))}
          <label className="block">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/30">Never say (comma-separated)</span>
            <input
              value={draft.never_say}
              onChange={e => setDraft(d => ({ ...d, never_say: e.target.value }))}
              className="mt-0.5 w-full rounded-md bg-white/[0.04] border border-white/[0.08] px-2.5 py-1.5 text-[11.5px] text-white/85 focus:outline-none focus:border-violet-400/50"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded-lg bg-violet-500/15 border border-violet-400/30 px-3 py-1 text-[11px] font-medium text-violet-300 hover:bg-violet-500/25 transition-colors disabled:opacity-40"
          >
            Save playbook
          </button>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-2">
          {view.icp && (
            <div>
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/30">ICP</p>
              <p className="text-[11.5px] text-white/70 leading-snug">{view.icp}</p>
            </div>
          )}
          {view.voice && (
            <div>
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/30">Voice</p>
              <p className="text-[11.5px] text-white/70 leading-snug">{view.voice}</p>
            </div>
          )}
          {view.strategy && (
            <div>
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/30">Cut-through strategy</p>
              <p className="text-[11.5px] text-white/70 leading-snug">{view.strategy}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {(view.channels || []).map(c => (
              <span key={c} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/55">
                {c.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
          {view.never_say && view.never_say.length > 0 && (
            <p className="text-[10px] text-white/30">Never: {view.never_say.join(' · ')}</p>
          )}
        </div>
      )}
    </section>
  )
}
