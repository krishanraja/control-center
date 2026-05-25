import React, { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink, PenLine, Save, Search, Sparkles, Wand2, X } from 'lucide-react'
import { humanAge } from '../lib/ageHelpers'
import { LeadSourcePill } from './LeadSourcePill'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import { FeedbackButton } from './shared/FeedbackButton'
import { supabase } from '../lib/supabase'
import type { ContentIdeaRow, IdeaState, TransformedOutputs } from '../hooks/useRealtimeContentIdeas'

interface Props {
  idea: ContentIdeaRow
  /** Optional: parent panel mode. When true, card auto-expands editor. */
  expanded?: boolean
  onClose?: () => void
}

type TransformFormat = keyof Exclude<TransformedOutputs, undefined | null>

const FORMAT_LABEL: Record<TransformFormat, string> = {
  linkedin: 'LinkedIn',
  substack: 'Substack',
  twitter: 'Twitter / X',
  cohort_prompt: 'Cohort prompt',
  mindmaker_block: 'Mindmaker block',
  expand: 'Long-form',
}

const TRANSFORM_OPTIONS: TransformFormat[] = [
  'linkedin', 'substack', 'twitter', 'cohort_prompt', 'mindmaker_block',
]

/**
 * Actionable replacement for `ContentIdeaCard`. Adds:
 *  - Expand: triggers Cleo's transform webhook with `target_format=expand` to
 *    generate a long-form draft into `content_ideas.body`.
 *  - Edit: inline text editor saving back to `content_ideas.body`.
 *  - Transform: dropdown of formats. Each calls
 *    `POST /webhook/cleo/transform` and renders the resulting variant as a
 *    tab on the same card.
 *
 * Webhook URL comes from `VITE_N8N_CLEO_TRANSFORM_URL`. If unset, the
 * Transform/Expand actions surface a clear toast and skip the call.
 */
export function ContentIdeaCardActionable({ idea: i, expanded, onClose }: Props) {
  const { toast } = useToast()
  const h = useHaptics()
  const [busy, setBusy] = useState<null | IdeaState | TransformFormat | 'edit'>(null)
  const [editing, setEditing] = useState(false)
  const [bodyDraft, setBodyDraft] = useState<string>(i.body || '')
  const [activeTab, setActiveTab] = useState<TransformFormat | 'idea'>(i.body ? 'idea' : 'idea')
  const [open, setOpen] = useState(!!expanded)

  const transformedKeys = useMemo<TransformFormat[]>(() => {
    const t = i.transformed_outputs || {}
    return Object.keys(t).filter(k => k !== 'expand' && (t as TransformedOutputs)[k as TransformFormat]?.body) as TransformFormat[]
  }, [i.transformed_outputs])

  React.useEffect(() => {
    setBodyDraft(i.body || '')
  }, [i.body])

  React.useEffect(() => {
    if (expanded) setOpen(true)
  }, [expanded])

  const cleoUrl = import.meta.env.VITE_N8N_CLEO_TRANSFORM_URL as string | undefined

  const setState = async (next: IdeaState) => {
    h.heavy()
    setBusy(next)
    try {
      const r = await fetch('/api/content-ideas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: i.id, state: next }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const labels: Partial<Record<IdeaState, string>> = {
        drafting: 'Promoted to drafting.',
        researching: 'Sent to Zara for research.',
        dropped: 'Dropped.',
      }
      h.success()
      toast(labels[next] || 'Updated.', 'success')
    } catch {
      h.error()
      toast('Could not update idea — try again.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const saveBody = async () => {
    h.tap()
    setBusy('edit')
    const { error } = await supabase
      .from('content_ideas')
      .update({ body: bodyDraft, updated_at: new Date().toISOString() })
      .eq('id', i.id)
    setBusy(null)
    if (error) {
      h.error()
      toast('Could not save draft — try again.', 'error')
      return
    }
    h.success()
    setEditing(false)
    toast('Draft saved.', 'success')
  }

  const callCleo = async (target_format: TransformFormat) => {
    if (!cleoUrl) {
      toast('Cleo transform webhook not configured (VITE_N8N_CLEO_TRANSFORM_URL).', 'error')
      h.error()
      return
    }
    h.heavy()
    setBusy(target_format)
    try {
      const res = await fetch(cleoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea_id: i.id, target_format }),
      })
      if (!res.ok) {
        let detail = `HTTP ${res.status}`
        try {
          const body = await res.json()
          detail = body?.error || body?.message || body?.error_text || JSON.stringify(body).slice(0, 200)
        } catch {
          try { detail = (await res.text()).slice(0, 200) || detail } catch {}
        }
        throw new Error(detail)
      }
      h.success()
      const verb = target_format === 'expand' ? 'Long-form draft incoming' : `${FORMAT_LABEL[target_format]} variant queued`
      toast(`${verb}. Realtime will refresh when ready.`, 'success')
      setActiveTab(target_format === 'expand' ? 'idea' : target_format)
    } catch (e: any) {
      h.error()
      toast(`Cleo transform failed: ${e?.message || 'unknown error'}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  const distribution = Array.isArray(i.distribution)
    ? (i.distribution as string[]).filter(Boolean)
    : []

  const tabsBody: Record<string, string | null | undefined> = useMemo(() => {
    const t = i.transformed_outputs || {}
    return {
      idea: i.body || null,
      ...Object.fromEntries(transformedKeys.map(k => [k, (t as TransformedOutputs)[k]?.body])),
    }
  }, [i.body, i.transformed_outputs, transformedKeys])

  const bodyToShow = (tabsBody[activeTab] as string | null | undefined) || null

  return (
    <article className="rounded-xl border border-rose-500/15 bg-rose-500/[0.03] p-3 hover:border-rose-500/25 transition-colors">
      <header className="flex items-center gap-1.5 flex-wrap text-[10px] mb-2">
        <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-200 uppercase tracking-[0.1em] font-semibold">
          {i.state}
        </span>
        <LeadSourcePill source={i.source_type} href={i.source_url || null} />
        <span className="text-white/35 tabular-nums ml-auto">{humanAge(i.updated_at)}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white/80 ml-1"
            aria-label="Close detail"
          >
            <X size={12} />
          </button>
        )}
      </header>

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-left w-full flex items-start gap-2"
      >
        <p className="text-[13px] font-semibold text-white leading-snug flex-1 min-w-0">{i.idea}</p>
        {open ? <ChevronUp size={14} className="text-white/40 mt-0.5" /> : <ChevronDown size={14} className="text-white/40 mt-0.5" />}
      </button>

      {i.thesis && (
        <p className="text-[11px] text-white/65 leading-snug mt-1.5">
          <span className="text-white/35">Thesis: </span>{i.thesis}
        </p>
      )}

      {distribution.length > 0 && (
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          <span className="text-[10px] text-white/35">→</span>
          {distribution.map((d) => (
            <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/75">{d}</span>
          ))}
        </div>
      )}

      {open && (
        <>
          {(transformedKeys.length > 0 || i.body) && (
            <div className="flex items-center gap-1 mt-3 flex-wrap border-b border-white/[0.05] pb-1">
              <button
                type="button"
                onClick={() => setActiveTab('idea')}
                className={`text-[10px] px-2 py-1 rounded-t-md transition-colors ${activeTab === 'idea' ? 'bg-white/[0.06] text-white/85' : 'text-white/45 hover:text-white/70'}`}
              >
                Draft
              </button>
              {transformedKeys.map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setActiveTab(k)}
                  className={`text-[10px] px-2 py-1 rounded-t-md transition-colors ${activeTab === k ? 'bg-white/[0.06] text-white/85' : 'text-white/45 hover:text-white/70'}`}
                >
                  {FORMAT_LABEL[k]}
                </button>
              ))}
            </div>
          )}

          <div className="mt-2.5">
            {editing && activeTab === 'idea' ? (
              <div className="space-y-2">
                <textarea
                  value={bodyDraft}
                  onChange={(e) => setBodyDraft(e.target.value)}
                  rows={8}
                  className="w-full rounded-md bg-black/40 border border-white/10 p-2 text-[12px] text-white/90 leading-snug focus:outline-none focus:border-rose-500/40"
                  placeholder="Long-form draft. Save sticks to content_ideas.body."
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={saveBody}
                    disabled={busy === 'edit'}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-rose-500/30 text-white hover:bg-rose-500/40 disabled:opacity-40 transition-colors min-h-[44px]"
                  >
                    <Save size={11} /> Save draft
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setBodyDraft(i.body || '') }}
                    className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors min-h-[44px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : bodyToShow ? (
              <p className="text-[12px] text-white/85 leading-relaxed whitespace-pre-wrap">{bodyToShow}</p>
            ) : (
              <p className="text-[11px] text-white/45 italic">
                No draft yet. Hit <span className="text-white/65">Expand</span> to have Cleo write the long form, or <span className="text-white/65">Edit</span> to write yours.
              </p>
            )}
          </div>
        </>
      )}

      {i.source_snippet && !open && (
        <details className="mt-2">
          <summary className="text-[10px] text-white/35 cursor-pointer hover:text-white/55 transition-colors">Source quote</summary>
          <p className="text-[11px] text-white/55 italic mt-1 leading-snug">"{i.source_snippet}"</p>
        </details>
      )}

      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        {i.state === 'seeded' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setState('drafting') }}
            disabled={busy !== null}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium border border-rose-500/30 text-rose-200 hover:bg-rose-500/15 disabled:opacity-40 transition-colors min-h-[44px]"
          >
            <PenLine size={11} /> Draft now
          </button>
        )}
        {i.state === 'seeded' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setState('researching') }}
            disabled={busy !== null}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] disabled:opacity-40 transition-colors min-h-[44px]"
          >
            <Search size={11} /> Research
          </button>
        )}

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); callCleo('expand') }}
          disabled={busy !== null}
          className="flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium border border-violet-500/25 text-violet-200 hover:bg-violet-500/10 disabled:opacity-40 transition-colors min-h-[44px]"
          title="Cleo writes a long-form draft into the body"
        >
          <Sparkles size={11} /> {busy === 'expand' ? 'Expanding…' : 'Expand'}
        </button>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setEditing(o => !o); setActiveTab('idea'); setOpen(true) }}
          disabled={busy !== null}
          className="flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] disabled:opacity-40 transition-colors min-h-[44px]"
        >
          <PenLine size={11} /> {editing ? 'Stop edit' : 'Edit'}
        </button>

        <TransformMenu
          busy={busy}
          onPick={callCleo}
        />

        {i.draft_link && (
          <a
            href={i.draft_link}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] transition-colors min-h-[44px]"
          >
            <ExternalLink size={11} /> External draft
          </a>
        )}

        <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
          <FeedbackButton sourceTable="content_ideas" sourceId={i.id} agentId="cleo" compact />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setState('dropped') }}
            disabled={busy !== null}
            className="flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.04] disabled:opacity-40 transition-colors min-h-[44px] min-w-[44px]"
            title="Drop this idea"
          >
            <X size={11} />
          </button>
        </div>
      </div>
    </article>
  )
}

function TransformMenu({
  busy, onPick,
}: {
  busy: null | string
  onPick: (f: TransformFormat) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        disabled={busy !== null}
        className="flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium border border-violet-500/25 text-violet-200 hover:bg-violet-500/10 disabled:opacity-40 transition-colors min-h-[44px]"
        title="Generate a derivative for a specific channel"
      >
        <Wand2 size={11} /> Transform
      </button>
      {open && (
        <div
          className="absolute z-30 mt-1 right-0 w-44 rounded-lg border border-white/10 bg-[#0c0c0e] shadow-xl overflow-hidden"
          onMouseLeave={() => setOpen(false)}
        >
          {TRANSFORM_OPTIONS.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onPick(opt) }}
              disabled={busy !== null}
              className="w-full text-left px-3 py-2.5 text-[12px] text-white/85 hover:bg-white/[0.04] disabled:opacity-40 min-h-[44px] inline-flex items-center"
            >
              {FORMAT_LABEL[opt]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
