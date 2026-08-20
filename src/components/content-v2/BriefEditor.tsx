import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { contentV2Api } from '../../hooks/useContentV2'
import { useDictation } from '../../hooks/useDictation'
import { FACTORY_FANOUT, type WeeklyBriefRow } from '../../lib/contentV2'
import { renderBrief, toEndnotes } from '../../lib/citations'
import { diffSections, mergeSections, wordDiff, type SectionDiff } from '../../lib/briefDiff'
import { useToast } from '../shared/Toast'
import { RejectReasonBar } from '../shared/RejectReasonBar'
import { reasonsFor } from '../../lib/triageReasons'
import { useLikelyReasons } from '../../hooks/useLikelyReasons'
import { supabase } from '../../lib/supabase'
import { Modal } from '../shared/Modal'
import { Skeleton } from '../shared/Skeleton'

interface StandingNote { id: string; text: string; at: string }

// The weekly brief editor (R8; mockup set 1 mock 2 + set 2 pin 12).
// Full-screen overlay, deep-linked #/content?brief=<week>. The canvas is a
// TipTap rich-text editor whose CANONICAL format stays markdown (tiptap-markdown
// serializes on save), so the factory/Google Docs contract is unchanged.
// Desktop: edit + toolbar + versions + magic row + fan-out push.
// Mobile (narrow): read-mode + magic row + Tell Cleo dictation + big actions;
// careful writing stays on the desktop by design (R13).

// One stable extension set, shared by every editor instance. Two hard-won
// rules live here. StarterKit bundles Link since tiptap v3, so registering
// extension-link on top of it created a DUPLICATE 'link' mark. And the array
// must NOT be rebuilt per render: @tiptap/react compares extensions by
// identity on every render and a fresh array forces a setOptions churn.
const EXTENSIONS = [
  StarterKit.configure({ link: { openOnClick: false } }),
  Markdown.configure({ html: false, linkify: true }),
]

// Each mode names its own work while it runs. These four shared the string
// "Working…", which is the one label Pending.tsx's doctrine comment forbids by
// name: it says nothing the disabled button had not already said, and with four
// buttons side by side it does not even say WHICH one you pressed.
const MAGIC: Array<{ mode: string; label: string; busy: string }> = [
  { mode: 'tighten', label: 'Tighten', busy: 'Tightening…' },
  { mode: 'sharper_open', label: 'Sharper claim', busy: 'Sharpening…' },
  { mode: 'harder_ending', label: 'Harder ending', busy: 'Rewriting the ending…' },
  { mode: 'more_data', label: 'More data', busy: 'Finding data…' },
]

// Reading preferences that the surface should remember between visits, so the
// system meets Krish where he left it instead of resetting every open.
const CITATIONS_KEY = 'brief:citations'
const FANOUT_KEY = 'brief:fanout'

function readCitationsPref(): boolean {
  try { return localStorage.getItem(CITATIONS_KEY) !== 'off' } catch { return true }
}
function writeCitationsPref(on: boolean): void {
  try { localStorage.setItem(CITATIONS_KEY, on ? 'on' : 'off') } catch { /* noop */ }
}
function readFanoutPref(): Set<string> {
  try {
    const raw = localStorage.getItem(FANOUT_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as unknown
      if (Array.isArray(arr)) {
        const valid = new Set(FACTORY_FANOUT.map(f => f.channel))
        return new Set(arr.filter((c): c is string => typeof c === 'string' && valid.has(c)))
      }
    }
  } catch { /* fall through to defaults */ }
  return new Set(FACTORY_FANOUT.filter(f => f.defaultOn).map(f => f.channel))
}
function writeFanoutPref(channels: Set<string>): void {
  try { localStorage.setItem(FANOUT_KEY, JSON.stringify([...channels])) } catch { /* noop */ }
}

export function BriefEditor({ week, narrow, onClose }: { week: string; narrow: boolean; onClose: () => void }) {
  const [brief, setBrief] = useState<WeeklyBriefRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<{ label: string; md: string } | null>(null)
  const [magicBusy, setMagicBusy] = useState<string | null>(null)
  const [showVersions, setShowVersions] = useState(false)
  const [fanout, setFanout] = useState<Set<string>>(readFanoutPref)
  // The fan-out list is five checkboxes that wrap to three rows on a phone, for a
  // choice that persists between weeks and rarely changes. On narrow it collapses
  // to the one line that says which formats are selected, and opens on tap.
  const [fanoutOpen, setFanoutOpen] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushed, setPushed] = useState<Array<{ channel: string; doc_url: string | null }> | null>(null)
  const [cleoNote, setCleoNote] = useState('')
  const [citations, setCitations] = useState<boolean>(readCitationsPref)
  const [notes, setNotes] = useState<StandingNote[]>([])
  const [notesOpen, setNotesOpen] = useState(false)
  // Binning the brief from inside it. Open the brief, read it, decide it is not
  // worth the week, say why in one tap. Back leaves it waiting; this rules on it.
  const [binning, setBinning] = useState(false)
  const [binBusy, setBinBusy] = useState(false)
  // The predictor is keyed by decision, and this surface only knows its week,
  // so resolve the brief's own card. Absent (already ruled on) just means no
  // predicted chips, which is a shortcut lost and nothing else.
  const [decisionId, setDecisionId] = useState<string | null>(null)
  // Section keys REJECTED in the current preview (default is keep-all); tracked
  // as the exclusion set so a fresh preview starts with everything accepted.
  const [rejected, setRejected] = useState<Set<string>>(new Set())
  // The endnote-form (citations-on) markdown is the source of truth for saving.
  // Hiding citations is a lossy reading view, so we never re-derive from it —
  // we always render the display FROM this buffer.
  const canonicalRef = useRef<string>('')
  const { listening, supported, toggle } = useDictation(setCleoNote)
  const { toast } = useToast()

  // The brief's markdown is handed to the editor AT CREATION, not injected
  // afterwards: the deps array recreates the editor when the brief arrives, so
  // tiptap-markdown parses the content on the editor's own construction path.
  // The old shape (create empty, setContent from an effect) raced the view
  // mount and intermittently produced a blank canvas: the brief opened empty
  // on phones from the day this shipped.
  const editor = useEditor({
    extensions: EXTENSIONS,
    editable: !narrow,
    content: brief ? renderBrief(toEndnotes(brief.body_md || ''), citations) : '',
    onUpdate: ({ editor }) => {
      setDirty(true)
      const storage = editor.storage as { markdown?: { getMarkdown: () => string } }
      const md = storage.markdown?.getMarkdown()
      // Edits only happen with citations on, so the buffer stays canonical.
      if (md != null) canonicalRef.current = toEndnotes(md)
    },
  }, [brief?.id])

  const editingClosed = brief ? !['ready', 'in_review', 'approved'].includes(brief.status) : false

  const load = useCallback(async () => {
    try {
      const r = await contentV2Api<{ brief: WeeklyBriefRow }>(`/api/briefs/${week}`)
      setBrief(r.brief)
    } catch (e) {
      setError(String((e as Error).message || e))
    }
  }, [week])

  useEffect(() => { load() }, [load])

  // Standing "Tell Cleo" preferences the engine folds into every draft.
  useEffect(() => {
    contentV2Api<{ notes: StandingNote[] }>('/api/briefs/notes')
      .then(r => setNotes(r.notes || []))
      .catch(() => { /* notes are a nicety; ignore fetch failures */ })
  }, [])

  // A) Canonicalize a fresh brief into the endnote buffer. Legacy briefs stored
  //    with inline citations are migrated to citations-at-the-end on open; the
  //    upgrade only persists if Krish actually edits and saves.
  useEffect(() => {
    if (brief && !dirty) {
      canonicalRef.current = toEndnotes(brief.body_md || '')
    }
    // dirty is read, not depended on: a keystroke must never reload.
  }, [brief])

  // B) Re-render the display from the canonical buffer when the citations
  //    toggle or editability flips. Initial content arrives at editor creation
  //    (see useEditor above); this only handles the user-triggered flips, when
  //    the view is definitely mounted. Never runs on a keystroke (canonicalRef
  //    stays in sync via onUpdate), so edits are safe.
  useEffect(() => {
    // isDestroyed guards the recreation cycle: when the brief arrives, the
    // editor is rebuilt and this effect fires once more against the torn-down
    // instance from the previous render's closure.
    if (!editor || editor.isDestroyed || !brief) return
    editor.setEditable(!narrow && citations && !editingClosed)
    // emitUpdate false, because this is a programmatic re-render, not an edit. In
    // tiptap v3 setContent emits update by default, which flipped dirty and
    // re-canonicalized from the serializer on every pass.
    editor.commands.setContent(renderBrief(canonicalRef.current, citations), { emitUpdate: false })
  }, [editor, brief, citations, narrow, editingClosed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const currentMd = useCallback((): string => {
    const storage = editor?.storage as { markdown?: { getMarkdown: () => string } } | undefined
    return storage?.markdown?.getMarkdown() || brief?.body_md || ''
  }, [editor, brief])

  const save = useCallback(async (statusChange?: string) => {
    if (!brief) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {}
      // Persist the canonical endnote form, never the (lossy) citations-off view.
      if (dirty) { body.body_md = canonicalRef.current || currentMd(); body.source = 'krish' }
      if (statusChange) body.status = statusChange
      if (Object.keys(body).length) {
        await contentV2Api(`/api/briefs/${week}`, { method: 'PATCH', body: JSON.stringify(body) })
      }
      setDirty(false)
      await load()
    } catch (e) {
      setError(String((e as Error).message || e))
    } finally {
      setSaving(false)
    }
  }, [brief, dirty, currentMd, week, load])

  const runMagic = useCallback(async (mode: string, label: string, instruction?: string) => {
    setMagicBusy(mode)
    setPreview(null)
    setRejected(new Set())
    try {
      // Persist local edits first so the revise runs against what is on screen.
      if (dirty) await save()
      const selection = editor && !editor.state.selection.empty
        ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, '\n')
        : undefined
      const r = await contentV2Api<{ preview: string }>(`/api/briefs/${week}/revise`, {
        method: 'POST',
        body: JSON.stringify({ mode: instruction ? undefined : mode, instruction, selection }),
      })
      setPreview({ label, md: r.preview })
    } catch (e) {
      setError(String((e as Error).message || e))
    } finally {
      setMagicBusy(null)
    }
  }, [dirty, save, editor, week])

  // The revision, diffed against the current draft by section. A fresh preview
  // starts with every change accepted; `rejected` tracks the ones toggled off.
  const previewDiffs = useMemo<SectionDiff[]>(
    () => (preview ? diffSections(canonicalRef.current, toEndnotes(preview.md)) : []),
    [preview],
  )
  const changedDiffs = useMemo(() => previewDiffs.filter(d => d.status !== 'same'), [previewDiffs])
  const acceptedKeys = useMemo(
    () => new Set(changedDiffs.filter(d => !rejected.has(d.key)).map(d => d.key)),
    [changedDiffs, rejected],
  )

  const toggleSection = useCallback((key: string) => {
    setRejected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }, [])

  const keepPreview = useCallback(async () => {
    if (!preview || acceptedKeys.size === 0) return
    // Apply only the accepted section changes, in canonical endnote form so
    // citations stay at the end.
    const merged = toEndnotes(mergeSections(previewDiffs, acceptedKeys))
    await contentV2Api(`/api/briefs/${week}`, { method: 'PATCH', body: JSON.stringify({ body_md: merged, source: 'cleo' }) })
    setPreview(null)
    setDirty(false)
    await load()
  }, [preview, acceptedKeys, previewDiffs, week, load])

  const restore = useCallback(async (v: number) => {
    await contentV2Api(`/api/briefs/${week}`, { method: 'PATCH', body: JSON.stringify({ restore_version: v }) })
    setDirty(false)
    setShowVersions(false)
    await load()
  }, [week, load])

  const push = useCallback(async () => {
    if (!brief || fanout.size === 0) return
    setPushing(true)
    try {
      if (dirty) await save()
      if (!['approved', 'pushed'].includes(brief.status)) {
        await contentV2Api(`/api/briefs/${week}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) })
      }
      const r = await contentV2Api<{ results: Array<{ channel: string; ok: boolean; doc_url: string | null }> }>(
        `/api/briefs/${week}/push`,
        { method: 'POST', body: JSON.stringify({ channels: [...fanout] }) },
      )
      setPushed(r.results.filter(x => x.ok))
      await load()
    } catch (e) {
      setError(String((e as Error).message || e))
    } finally {
      setPushing(false)
    }
  }, [brief, fanout, dirty, save, week, load])

  const dictate = useCallback(() => {
    if (!supported) { setCleoNote(''); setPreview(null); setError('Dictation is not available in this browser; type the note instead.'); return }
    toggle()
  }, [supported, toggle])

  const toggleCitations = useCallback(() => {
    setCitations(prev => { const next = !prev; writeCitationsPref(next); return next })
  }, [])

  // Persist a Cleo instruction as a standing preference (future briefs honor it)
  // and apply it once now so the effect is visible immediately.
  const rememberNote = useCallback(async (text: string) => {
    const clean = text.trim()
    if (!clean) return
    try {
      const r = await contentV2Api<{ notes: StandingNote[] }>('/api/briefs/notes', {
        method: 'POST', body: JSON.stringify({ text: clean }),
      })
      setNotes(r.notes || [])
      toast('Cleo will remember that for every brief.', 'success')
    } catch (e) {
      toast(String((e as Error).message || e), 'error')
    }
  }, [toast])

  const forgetNote = useCallback(async (id: string) => {
    try {
      const r = await contentV2Api<{ notes: StandingNote[] }>('/api/briefs/notes', {
        method: 'DELETE', body: JSON.stringify({ id }),
      })
      setNotes(r.notes || [])
    } catch (e) {
      toast(String((e as Error).message || e), 'error')
    }
  }, [toast])

  const toggleFanout = useCallback((channel: string) => {
    setFanout(prev => {
      const next = new Set(prev)
      if (next.has(channel)) next.delete(channel); else next.add(channel)
      writeFanoutPref(next)
      return next
    })
  }, [])

  const versions = useMemo(() => (brief?.versions || []).slice().reverse(), [brief])
  const fanoutSummary = useMemo(
    () => FACTORY_FANOUT.filter(f => fanout.has(f.channel)).map(f => f.short).join(', '),
    [fanout],
  )

  useEffect(() => {
    let alive = true
    supabase.from('content_decisions').select('id')
      .eq('week', week).eq('kind', 'brief_review').eq('status', 'pending').limit(1)
      .then(({ data }) => { if (alive) setDecisionId(data?.[0]?.id || null) })
    return () => { alive = false }
  }, [week])

  const likely = useLikelyReasons(binning ? decisionId : null)

  const bin = useCallback(async (reasonCode?: string, reasonText?: string) => {
    setBinBusy(true)
    try {
      await contentV2Api(`/api/briefs/${week}`, {
        method: 'PATCH',
        body: JSON.stringify({ bin: true, reason_code: reasonCode, reason_text: reasonText }),
      })
      setBinning(false)
      toast('Binned. Cleo will hear why.', 'success')
      onClose()
    } catch (e) {
      toast(String((e as Error).message || e), 'error')
    } finally {
      setBinBusy(false)
    }
  }, [week, toast, onClose])

  return (
    <Modal
      open
      onClose={onClose}
      variant="full"
      title="Brief editor"
      hideTitle
      className="flex flex-col bg-base"
    >
      {/* header */}
      <header className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/[0.07] flex-shrink-0">
        <button onClick={onClose} className="text-white/50 hover:text-white text-[13px]">← Back</button>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-300/80">Weekly brief · {week}</div>
          <div className="text-[14px] font-bold text-white truncate">
            {brief?.title ?? <Skeleton h={13} w={180} r={4} className="my-[3px]" />}
          </div>
        </div>
        {brief ? (
          <button
            onClick={toggleCitations}
            aria-pressed={citations}
            title={citations ? 'Sources shown at the end — tap to hide' : 'Sources hidden — tap to show at the end'}
            className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
              citations
                ? 'border-sky-400/30 bg-sky-400/10 text-sky-300'
                : 'border-white/15 text-white/45 hover:text-white/80 hover:border-white/25'
            }`}
          >
            {citations ? 'Citations on' : 'Citations off'}
          </button>
        ) : null}
        {!narrow && brief ? (
          <>
            <button
              onClick={() => setShowVersions(s => !s)}
              className="text-[11.5px] text-white/50 hover:text-white/85 tabular-nums"
            >
              v{brief.versions?.length || 1} · history
            </button>
            <button
              onClick={() => save()}
              disabled={!dirty || saving || editingClosed}
              className="btn-contrast rounded-lg px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-40"
            >
              {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
            </button>
          </>
        ) : null}
      </header>

      {error ? (
        <div className="mx-4 sm:mx-6 mt-3 rounded-lg bg-red-400/10 border border-red-400/25 text-red-300 text-[12px] px-3 py-2 flex justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="opacity-70">×</button>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 flex">
        {/* canvas */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {/* toolbar (desktop only) */}
          {!narrow && editor ? (
            <div className="sticky top-0 z-10 flex items-center gap-0.5 px-4 sm:px-6 py-2 bg-base/95 backdrop-blur border-b border-white/[0.05] flex-wrap">
              {([
                ['B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold')],
                ['I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic')],
                ['H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 })],
                ['H3', () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 })],
                ['" quote', () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote')],
                ['• list', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList')],
                ['1. list', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList')],
              ] as Array<[string, () => void, boolean]>).map(([label, fn, active]) => (
                <button
                  key={label}
                  onMouseDown={e => { e.preventDefault(); fn() }}
                  disabled={editingClosed}
                  className={`px-2.5 py-1.5 rounded-md text-[12px] font-mono font-semibold disabled:opacity-30 ${active ? 'bg-white/15 text-white' : 'text-white/55 hover:bg-white/[0.07]'}`}
                >
                  {label}
                </button>
              ))}
              <span className="w-px h-4 bg-white/10 mx-1.5" />
              <button
                onMouseDown={e => {
                  e.preventDefault()
                  const url = window.prompt('Link URL')
                  if (url) editor.chain().focus().setLink({ href: url }).run()
                }}
                disabled={editingClosed}
                className="px-2.5 py-1.5 rounded-md text-[12px] font-mono font-semibold text-white/55 hover:bg-white/[0.07] disabled:opacity-30"
              >
                link
              </button>
            </div>
          ) : null}

          <div className={`px-4 sm:px-8 py-6 max-w-3xl mx-auto ${narrow ? 'select-text' : ''}`}>
            {editingClosed ? (
              <div className="mb-4 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 text-[12px] px-3 py-2">
                This brief is {brief?.status}; editing is closed.
              </div>
            ) : !narrow && !citations ? (
              <div className="mb-4 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white/45 text-[12px] px-3 py-2">
                Reading view — sources are hidden. Turn <span className="text-sky-300/90 font-semibold">Citations on</span> to edit.
              </div>
            ) : null}
            <EditorContent
              editor={editor}
              className="brief-canvas prose prose-invert prose-sm max-w-none
                [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[50vh]
                [&_.ProseMirror_h1]:text-[22px] [&_.ProseMirror_h2]:text-[17px] [&_.ProseMirror_h3]:text-[14.5px]
                [&_.ProseMirror_a]:text-sky-300"
            />
          </div>
        </div>

        {/* version rail (desktop) */}
        {!narrow && showVersions && brief ? (
          <aside className="w-72 flex-shrink-0 border-l border-white/[0.07] overflow-y-auto p-4">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40 mb-3">History</h4>
            {versions.map(v => (
              <div key={v.v} className="rounded-lg border border-white/[0.06] p-3 mb-2">
                <div className="flex justify-between items-baseline text-[11px]">
                  <span className="font-semibold text-white/75">v{v.v} · {v.source}{v.restored_from ? ` (from v${v.restored_from})` : ''}</span>
                  <span className="text-white/35">{new Date(v.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {v.v !== (brief.versions?.length || 1) && v.body_md ? (
                  <button onClick={() => restore(v.v)} className="mt-2 text-[11px] text-sky-300 hover:text-sky-200 font-semibold">Restore this version</button>
                ) : null}
              </div>
            ))}
          </aside>
        ) : null}
      </div>

      {/* The action deck: edit tools, the revision preview, and the ship controls
          in ONE bordered block. It used to be two stacked blocks, each with its
          own border and vertical padding, and on a phone the fan-out checkboxes
          wrapped to three rows with "Bin this brief" alone on a fourth. That cost
          roughly a third of the screen before a word of the brief was visible.
          The preview now sits directly between the chips that produced it and the
          button that ships it, which is where the verdict belongs. */}
      {brief ? (
        <footer
          className="px-4 sm:px-6 pt-2.5 border-t border-white/[0.07] flex-shrink-0 bg-base"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        >
        {!editingClosed ? (
          <div className="flex gap-1.5 flex-wrap items-center">
            {MAGIC.map(m => (
              <button
                key={m.mode}
                onClick={() => runMagic(m.mode, m.label)}
                disabled={magicBusy !== null}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-semibold text-white/70 hover:bg-white/[0.09] disabled:opacity-40"
              >
                {magicBusy === m.mode ? m.busy : m.label}
              </button>
            ))}
            <button
              onClick={dictate}
              disabled={magicBusy !== null}
              title={listening ? 'Stop dictating' : 'Dictate an instruction for Cleo'}
              className={`rounded-full border px-2.5 py-1.5 text-[11.5px] font-semibold disabled:opacity-40 ${
                listening ? 'border-red-400/40 bg-red-400/15 text-red-300' : 'border-sky-400/30 bg-sky-400/10 text-sky-300 hover:bg-sky-400/20'
              }`}
            >
              {listening ? (narrow ? 'Tap to stop' : 'Listening... tap to stop') : (narrow ? '🎙 Cleo' : '🎙 Tell Cleo')}
            </button>
            {notes.length > 0 ? (
              <span className="relative">
                <button
                  onClick={() => setNotesOpen(o => !o)}
                  title={`${notes.length} standing note${notes.length === 1 ? '' : 's'} Cleo applies to every brief`}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11.5px] font-semibold text-white/55 hover:text-white/85 hover:bg-white/[0.07]"
                >
                  💭 {narrow ? notes.length : `Cleo remembers · ${notes.length}`}
                </button>
                {notesOpen ? (
                  <div className="absolute bottom-full mb-2 left-0 z-20 w-72 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-base shadow-xl p-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40 px-1 pb-1.5">
                      Standing notes · every brief
                    </div>
                    {notes.map(n => (
                      <div key={n.id} className="flex items-start gap-2 rounded-lg px-1.5 py-1.5 hover:bg-white/[0.04]">
                        <span className="text-[12px] text-white/70 leading-snug flex-1">{n.text}</span>
                        <button
                          onClick={() => forgetNote(n.id)}
                          aria-label="Forget this note"
                          className="text-white/30 hover:text-red-300 text-[13px] leading-none flex-shrink-0"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </span>
            ) : null}
            {cleoNote ? (
              <span className="flex items-center gap-2 text-[11.5px] text-white/55 bg-white/[0.04] rounded-full px-3 py-1.5">
                “{cleoNote.slice(0, 80)}”
                <button
                  onClick={() => { runMagic('instruction', 'Tell Cleo', cleoNote); setCleoNote('') }}
                  className="text-sky-300 font-semibold"
                >
                  Apply once
                </button>
                <button
                  onClick={() => { rememberNote(cleoNote); runMagic('instruction', 'Tell Cleo', cleoNote); setCleoNote('') }}
                  className="text-emerald-300 font-semibold"
                  title="Apply now and honor this on every future brief"
                >
                  Remember
                </button>
                <button onClick={() => setCleoNote('')} className="text-white/35">×</button>
              </span>
            ) : null}
          </div>
        ) : null}

          {preview ? (
            <div className="mt-2.5 rounded-xl border border-dashed border-sky-400/35 bg-sky-400/[0.05] p-3.5">
              <div className="flex items-center justify-between mb-2 gap-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-sky-300">Preview · {preview.label}</div>
                <div className="text-[10.5px] text-white/40 tabular-nums">
                  {changedDiffs.length === 0
                    ? 'no changes'
                    : `${acceptedKeys.size}/${changedDiffs.length} kept`}
                </div>
              </div>
              {changedDiffs.length === 0 ? (
                <div className="text-[12px] text-white/50">This revision came back identical to the current draft.</div>
              ) : (
                <div className="max-h-56 overflow-y-auto flex flex-col gap-2 pr-1">
                  {changedDiffs.map(d => {
                    const kept = !rejected.has(d.key)
                    const before = d.before.replace(/^#{1,6}\s+.*\n?/, '')
                    const after = d.after.replace(/^#{1,6}\s+.*\n?/, '')
                    return (
                      <div key={d.key} className={`rounded-lg border p-2.5 transition-opacity ${kept ? 'border-sky-400/25 bg-white/[0.02]' : 'border-white/[0.06] opacity-55'}`}>
                        <label className="flex items-center gap-2 cursor-pointer select-none mb-1.5">
                          <span
                            onClick={() => toggleSection(d.key)}
                            className={`w-4 h-4 rounded border inline-flex items-center justify-center text-[10px] flex-shrink-0 ${kept ? 'bg-emerald-400 border-emerald-400 text-emerald-950 font-bold' : 'border-white/25'}`}
                          >
                            {kept ? '✓' : ''}
                          </span>
                          <span className="text-[11px] font-semibold text-white/70">
                            {d.heading || 'Intro'} <span className="text-white/35 font-normal">· {d.status}</span>
                          </span>
                        </label>
                        <div className="text-[12px] leading-relaxed whitespace-pre-wrap break-words">
                          {wordDiff(before, after).map((op, i) => (
                            <span
                              key={i}
                              className={
                                op.type === 'add' ? 'bg-emerald-400/20 text-emerald-200 rounded px-0.5'
                                : op.type === 'del' ? 'bg-red-400/15 text-red-300/70 line-through rounded px-0.5'
                                : 'text-white/55'
                              }
                            >
                              {op.text}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="flex gap-2 mt-3 items-center">
                <button
                  onClick={keepPreview}
                  disabled={acceptedKeys.size === 0}
                  className="rounded-lg bg-emerald-400 text-emerald-950 px-4 py-2 text-[12px] font-bold disabled:opacity-40"
                >
                  {changedDiffs.length <= 1 ? 'Keep it' : `Keep ${acceptedKeys.size} of ${changedDiffs.length}`}
                </button>
                <button onClick={() => setPreview(null)} className="rounded-lg bg-white/[0.06] text-white/70 px-4 py-2 text-[12px] font-semibold">Discard</button>
                {changedDiffs.length > 1 && rejected.size > 0 ? (
                  <button onClick={() => setRejected(new Set())} className="text-[11px] text-white/40 hover:text-white/70 ml-auto">Keep all</button>
                ) : null}
              </div>
            </div>
          ) : null}

          {pushed ? (
            <div className="text-[12.5px] text-emerald-300 mt-2.5">
              Pushed {pushed.length} format{pushed.length === 1 ? '' : 's'} to Google Docs.{' '}
              {pushed.filter(p => p.doc_url).map(p => (
                <a key={p.channel} href={p.doc_url!} target="_blank" rel="noreferrer" className="underline mr-2">{p.channel}</a>
              ))}
              <span className="text-white/40">Cleo confirms on Telegram. You are done for the week.</span>
            </div>
          ) : binning ? (
            // The verdict is asked for where the verdict gets made, replacing
            // the ship controls rather than floating over them.
            <div className="mt-2.5">
              <RejectReasonBar
                title="Why bin this brief?"
                reasons={reasonsFor('content_decisions')}
                onChoose={bin}
                onCancel={() => setBinning(false)}
                cancelLabel="Keep it"
                likely={likely}
              />
            </div>
          ) : (
            <>
            {/* Where it goes. Wide shows the whole list inline; narrow shows the
                selection as one line and opens the list on tap, because the
                choice persists between weeks and almost never changes. */}
            {!narrow || fanoutOpen ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/40">Publish as</span>
                {FACTORY_FANOUT.map(f => {
                  const on = fanout.has(f.channel)
                  return (
                    <label key={f.channel} className="flex items-center gap-1.5 text-[12px] text-white/70 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleFanout(f.channel)}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden
                        className={`w-4 h-4 rounded border inline-flex items-center justify-center text-[10px] peer-focus-visible:ring-1 peer-focus-visible:ring-emerald-300/70 ${on ? 'bg-emerald-400 border-emerald-400 text-emerald-950 font-bold' : 'border-white/25'}`}
                      >
                        {on ? '✓' : ''}
                      </span>
                      {f.label}
                    </label>
                  )
                })}
                {narrow ? (
                  <button onClick={() => setFanoutOpen(false)} className="text-[11px] font-semibold text-sky-300 ml-auto">Done</button>
                ) : null}
              </div>
            ) : (
              <button
                onClick={() => setFanoutOpen(true)}
                className="flex w-full items-baseline gap-2 mt-2.5 text-left"
              >
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/40 flex-shrink-0">Publish as</span>
                <span className={`text-[12px] truncate flex-1 ${fanout.size ? 'text-white/70' : 'text-amber-300/80'}`}>
                  {fanoutSummary || 'nothing selected'}
                </span>
                <span className="text-[11px] font-semibold text-sky-300 flex-shrink-0">Change</span>
              </button>
            )}
            {/* Both verdicts on one row. Ship it or bin it, reachable from the
                same place, with the destructive one deliberately quieter and
                held well away from the thumb path to the push button. */}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setBinning(true)}
                disabled={binBusy}
                className="rounded-lg border border-rose-400/25 bg-rose-500/[0.06] text-rose-300/85 hover:bg-rose-500/[0.12] px-3 py-2 text-[11.5px] font-semibold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-300/60"
              >
                {narrow ? 'Bin' : 'Bin this brief'}
              </button>
              <button
                onClick={push}
                disabled={pushing || fanout.size === 0 || !brief.body_md}
                className="ml-auto rounded-lg bg-emerald-400 text-emerald-950 px-4 py-2.5 text-[12.5px] font-bold disabled:opacity-40"
              >
                {pushing
                  ? 'Pushing…'
                  : narrow
                    ? `Push ${fanout.size} to Docs`
                    : `Push ${fanout.size} format${fanout.size === 1 ? '' : 's'} to Google Docs`}
              </button>
            </div>
            </>
          )}
        </footer>
      ) : null}
    </Modal>
  )
}
