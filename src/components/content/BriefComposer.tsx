import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, History, Mic, StickyNote, Wand2, X } from '@/lib/icons'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { contentV2Api } from '../../hooks/useContentV2'
import { useDictation } from '../../hooks/useDictation'
import { FACTORY_FANOUT, type WeeklyBriefRow } from '../../lib/contentV2'
import { editGroups, type EditItem } from '../../lib/contentEngine'
import { renderBrief, toEndnotes } from '../../lib/citations'
import { diffSections, mergeSections, wordDiff, type SectionDiff } from '../../lib/briefDiff'
import { useToast } from '../shared/Toast'
import { RejectReasonBar } from '../shared/RejectReasonBar'
import { reasonsFor } from '../../lib/triageReasons'
import { useLikelyReasons } from '../../hooks/useLikelyReasons'
import { supabase } from '../../lib/supabase'
import { Skeleton } from '../shared/Skeleton'
import { ComposerShell, ComposerRail, MetaDot, type ComposerTab } from './ComposerShell'
import { EditPalette, busyKey } from './EditPalette'
import { BottomSheet } from '../mobile/BottomSheet'
import { streamText } from '../../lib/streamText'

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

type BriefTab = 'refine' | 'history'

const BRIEF_TABS: ComposerTab<BriefTab>[] = [
  { id: 'refine', label: 'Refine', icon: <Wand2 size={14} /> },
  { id: 'history', label: 'History', icon: <History size={14} /> },
]

// Format adapts and channel cuts are left out on purpose: the brief is the
// master that gets fanned out to Paid and Built at push, so "turn this into a
// Paid piece" is not a question it can answer, and a channel cut writes to a
// piece's transformed_outputs, which a brief does not have. Deep research runs
// against a content piece for the same reason.
const BRIEF_GROUPS = editGroups({
  includeFormatAdapts: false,
  includeChannelCuts: false,
  includeDeepen: false,
})

export function BriefComposer({ week, narrow, onClose }: { week: string; narrow: boolean; onClose: () => void }) {
  const [brief, setBrief] = useState<WeeklyBriefRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<{ label: string; md: string } | null>(null)
  const [magicBusy, setMagicBusy] = useState<string | null>(null)
  // The revision as it arrives, shown while it is being written. Separate from
  // `preview` on purpose: see runMagic.
  const [magicStream, setMagicStream] = useState('')
  const [tab, setTab] = useState<BriefTab>('refine')
  // In state, not derived from canonicalRef: a ref does not re-render, so the
  // count would freeze after the first keystroke (dirty only flips once).
  const [words, setWords] = useState(0)
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
  // The passage the user has highlighted, if any. Short highlights are ignored
  // rather than scoped: below a handful of words the words are not distinctive
  // enough to locate safely, and scoping the wrong sentence is worse than
  // scoping nothing. api/_selection.ts applies the same floor server-side.
  const [selection, setSelection] = useState('')
  const [showEdits, setShowEdits] = useState(false)
  // Portal host for the edits sheet: an element INSIDE the composer shell
  // (fixed z-[90], its own zoom context), so the sheet paints above the shell.
  // Portaled to the default zoom root it would land in the tab tree behind
  // this overlay and be invisible.
  const [sheetHost, setSheetHost] = useState<HTMLElement | null>(null)
  const scoped = selection.replace(/[^a-zA-Z0-9]/g, '').length >= 8
  const { listening, supported, toggle } = useDictation(setCleoNote)
  const { toast } = useToast()
  // Mirror of `citations` that onUpdate can read without a stale closure. The
  // canonical buffer may only ever be rebuilt from a citations-ON rendering:
  // the citations-off view is lossy (sources stripped), and canonicalizing
  // from it once destroyed the Sources list for good — which is exactly what
  // made the toggle work a single time and then never again.
  const citationsRef = useRef(citations)
  citationsRef.current = citations

  const editingClosed = brief ? !['ready', 'in_review', 'approved'].includes(brief.status) : false
  // One expression for editability, used at editor creation AND by the effect
  // below. They used to disagree (`!narrow` here, the full expression there),
  // and react re-applies creation options on re-render, so the two fought.
  const canEdit = !narrow && citations && !editingClosed

  // The brief's markdown is handed to the editor AT CREATION, not injected
  // afterwards: the deps array recreates the editor when the brief arrives, so
  // tiptap-markdown parses the content on the editor's own construction path.
  // The old shape (create empty, setContent from an effect) raced the view
  // mount and intermittently produced a blank canvas: the brief opened empty
  // on phones from the day this shipped.
  const editor = useEditor({
    extensions: EXTENSIONS,
    editable: canEdit,
    content: brief ? renderBrief(toEndnotes(brief.body_md || ''), citations) : '',
    onUpdate: ({ editor }) => {
      // Edits are only possible with citations on (setEditable below), so an
      // update while they are off can only be programmatic. Canonicalizing
      // from that lossy view would strip the Sources list permanently, so it
      // is refused here as a hard rule rather than assumed away.
      if (!citationsRef.current) return
      setDirty(true)
      const storage = editor.storage as { markdown?: { getMarkdown: () => string } }
      const md = storage.markdown?.getMarkdown()
      if (md != null) canonicalRef.current = toEndnotes(md)
      setWords(editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ').split(/\s+/).filter(Boolean).length)
    },
    // Held in React state so the chips can SAY what they are about to rewrite.
    // Before this the selection was read invisibly at click time, so a chip
    // gave no clue whether it would touch the passage or the whole brief.
    onSelectionUpdate: ({ editor }) => {
      const { from, to, empty } = editor.state.selection
      setSelection(empty ? '' : editor.state.doc.textBetween(from, to, '\n').trim())
    },
  }, [brief?.id])


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
    // emitUpdate false on BOTH calls, because this is a programmatic re-render,
    // not an edit. setContent emitting was fixed first; setEditable kept its
    // default emit, so the first citations-off flip re-canonicalized the buffer
    // from the sources-stripped view and the toggle only ever worked once.
    editor.setEditable(canEdit, false)
    editor.commands.setContent(renderBrief(canonicalRef.current, citations), { emitUpdate: false })
    setWords(editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ').split(/\s+/).filter(Boolean).length)
  }, [editor, brief, citations, canEdit])

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

  const runMagic = useCallback(async (
    mode: string,
    label: string,
    instruction?: string,
    extra?: { value?: string; hint?: string; busy?: string },
  ) => {
    setMagicBusy(extra?.busy ?? mode)
    setPreview(null)
    setRejected(new Set())
    try {
      // Read the highlight BEFORE saving. save() reloads the brief, which
      // re-renders the document and collapses the selection, so reading it
      // afterwards returned nothing and the edit silently rewrote the WHOLE
      // draft with no warning. That was the quiet half of this bug; the 409
      // was the loud half.
      const span = scoped ? selection : undefined
      // Persist local edits first so the revise runs against what is on screen.
      if (dirty) await save()
      // The revision streams, but it CANNOT stream into `preview`. That value
      // feeds diffSections, and half a document diffed against a whole one reads
      // as "everything deleted" on every chunk. So the arriving text goes to its
      // own live panel, and the diff is computed once, on the finished markdown
      // the server has already sanitised.
      setMagicStream('')
      const { data, text } = await streamText<{ preview?: string }>(
        `/api/briefs/${week}/revise`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // All four ride together; the route resolves them in order
          // (preset > hint > instruction). A MAGIC mode is a preset key and
          // wins; a palette chip's mode is not, so its hint does. `value`
          // exists so a humour register routes to the humour engine.
          body: JSON.stringify({ mode, value: extra?.value, hint: extra?.hint, instruction, selection: span }),
        },
        {
          onText: chunk => setMagicStream(s => s + chunk),
          jsonText: body => body.preview || '',
        },
      )
      setPreview({ label: span ? `${label} · selection` : label, md: data?.preview ?? text })
    } catch (e) {
      setError(String((e as Error).message || e))
    } finally {
      setMagicBusy(null)
      setMagicStream('')
    }
  }, [dirty, save, week, scoped, selection])

  // A script is not a revision: it never touches body_md, so it cannot disturb
  // an edit session and there is nothing to preview or accept. It saves against
  // the brief, keyed by duration, so several lengths coexist.
  const runVideoScript = useCallback(async (duration: string, label: string, hint?: string) => {
    setMagicBusy(`video:${duration}`)
    try {
      if (dirty) await save()
      const r = await fetch(`/api/briefs/${week}/video-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration, hint }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.hint || j.error || `HTTP ${r.status}`)
      const sc = j.script || {}
      const flagged = sc.unsupported_numbers?.length
        ? ` Check ${sc.unsupported_numbers.length} figure${sc.unsupported_numbers.length === 1 ? '' : 's'}.`
        : ''
      toast(`${label} script saved, ${sc.word_count} words against a ${sc.target_words} target.${flagged}`, 'success')
    } catch (e) {
      setError(String((e as Error).message || e))
    } finally {
      setMagicBusy(null)
    }
  }, [dirty, save, week, toast])

  // One handler for every chip, wherever it is rendered. The busy key is the
  // palette's own convention, so the spinner always lands on the chip that was
  // pressed rather than on whichever one happened to share a mode.
  const pickEdit = useCallback((it: EditItem) => {
    if (it.mode === 'video') { void runVideoScript(it.value, it.label, it.hint); return }
    void runMagic(it.mode, it.label, undefined, { value: it.value, hint: it.hint, busy: busyKey(it) })
  }, [runVideoScript, runMagic])

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
    // Back to Refine: you restore a version in order to work on it.
    setTab('refine')
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
      toast('Binned. Cleo gets told why, so it learns.', 'success')
      onClose()
    } catch (e) {
      toast(String((e as Error).message || e), 'error')
    } finally {
      setBinBusy(false)
    }
  }, [week, toast, onClose])

  return (
    <ComposerShell
      onClose={onClose}
      eyebrow={<>Weekly brief · {week}</>}
      title={
        <div className="text-ui font-bold text-white truncate">
          {brief?.title ?? <Skeleton h={13} w={180} r={4} className="my-[3px]" />}
        </div>
      }
      meta={brief ? (
        <>
          <span className="whitespace-nowrap text-micro uppercase tracking-[0.14em] text-white/35">{brief.status}</span>
          <MetaDot />
          <span className="whitespace-nowrap text-micro text-white/35 tabular-nums">{words} words</span>
          <MetaDot />
          <span className="whitespace-nowrap text-micro text-white/35">{saving ? 'saving…' : dirty ? 'unsaved' : 'saved'}</span>
        </>
      ) : null}
      actions={
        <>
          {brief ? (
            <button
              onClick={toggleCitations}
              aria-pressed={citations}
              title={citations ? 'Sources shown at the end — tap to hide' : 'Sources hidden — tap to show at the end'}
              className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-label font-semibold transition-colors ${
                citations
                  ? 'border-sky-400/30 bg-sky-400/10 text-sky-200'
                  : 'border-white/15 text-white/45 hover:text-white/80 hover:border-white/25'
              }`}
            >
              {citations ? 'Citations on' : 'Citations off'}
            </button>
          ) : null}
          {!narrow && brief ? (
            <button
              onClick={() => save()}
              disabled={!dirty || saving || editingClosed}
              className="btn-contrast rounded-lg px-3.5 py-1.5 text-label font-semibold disabled:opacity-40"
            >
              {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
            </button>
          ) : null}
        </>
      }
      banner={error ? (
        <div className="mx-4 sm:mx-6 mt-3 rounded-lg bg-red-400/10 border border-red-400/25 text-rose-200 text-label px-3 py-2 flex justify-between gap-3 flex-shrink-0">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="opacity-70 hover:opacity-100"><X size={14} /></button>
        </div>
      ) : null}
    >

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
                  className={`px-2.5 py-1.5 rounded-md text-label font-mono font-semibold disabled:opacity-30 ${active ? 'bg-white/15 text-white' : 'text-white/55 hover:bg-white/[0.07]'}`}
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
                className="px-2.5 py-1.5 rounded-md text-label font-mono font-semibold text-white/55 hover:bg-white/[0.07] disabled:opacity-30"
              >
                link
              </button>
            </div>
          ) : null}

          <div className={`px-4 sm:px-8 py-6 max-w-3xl mx-auto ${narrow ? 'select-text' : ''}`}>
            {editingClosed ? (
              <div className="mb-4 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 text-label px-3 py-2">
                This brief is {brief?.status}; editing is closed.
              </div>
            ) : !narrow && !citations ? (
              <div className="mb-4 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white/45 text-label px-3 py-2">
                Reading view. Sources are hidden. Turn <span className="text-sky-200/90 font-semibold">Citations on</span> to edit.
              </div>
            ) : null}
            {/* `prose prose-invert prose-sm` used to sit on this and did
                nothing: @tailwindcss/typography is not installed
                (tailwind.config.js plugins: []), so those classes emitted no
                rules at all. Worse, `prose-invert` is the DARK variant — the
                day it started working it would have painted light-grey body
                text onto pale paper. brief-canvas (src/index.css) styles the
                document from theme tokens instead, so it reads in both. */}
            {/* Highlight, then edit that passage. The backend has always done
                span-scoped rewrites; there was simply nothing in the UI that
                said so, so the only way to discover the feature was to select
                text, press a chip and hope. */}
            {editor && !editingClosed ? (
              <BubbleMenu
                editor={editor}
                updateDelay={120}
                shouldShow={({ state }) => {
                  const { from, to, empty } = state.selection
                  if (empty) return false
                  return state.doc.textBetween(from, to, ' ').replace(/[^a-zA-Z0-9]/g, '').length >= 8
                }}
                className="flex items-center gap-1 rounded-lg border border-white/12 bg-sunk/95 p-1 shadow-xl backdrop-blur"
              >
                {MAGIC.map(m => (
                  <button
                    key={m.mode}
                    onClick={() => runMagic(m.mode, m.label)}
                    disabled={magicBusy !== null}
                    className="rounded-md px-2 py-1 text-label font-semibold text-white/75 hover:bg-white/10 disabled:opacity-40"
                    title={`${m.label} — this passage only`}
                  >
                    {magicBusy === m.mode ? m.busy : m.label}
                  </button>
                ))}
              </BubbleMenu>
            ) : null}
            <EditorContent
              editor={editor}
              className="brief-canvas max-w-none
                [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[50vh]"
            />
          </div>
        </div>

        {/* The rail. Same component, same place, same tab strip as the piece
            composer: this is the half of CONTENT-ENGINE-V2-SPEC.md:75 that
            never shipped. Refine is the default tab because on a brief it is
            the reason you opened the rail; the piece composer defaults to
            Cleo for the same reason. */}
        {!narrow && brief ? (
          <ComposerRail<BriefTab> tabs={BRIEF_TABS} tab={tab} onTab={setTab}>
            {tab === 'refine' ? (
              <div className="space-y-3">
                <p className="text-micro leading-snug text-white/45">
                  One-click rewrites of the brief. Each is a preview you keep or discard, never
                  destructive. Highlight a passage first and the edit scopes to it.
                </p>
                {scoped ? (
                  <div className="rounded-lg border border-sky-400/25 bg-sky-400/[0.07] px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-micro text-sky-200">
                      <span className="flex-1 truncate" title={selection}>
                        Adjusting just: “{selection.replace(/\s+/g, ' ').slice(0, 54)}{selection.length > 54 ? '…' : ''}”
                      </span>
                      <button
                        onClick={() => { editor?.commands.focus(); editor?.commands.setTextSelection(editor.state.selection.to) }}
                        className="text-white/45 hover:text-white/85"
                        title="Adjust the whole brief instead"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ) : null}
                <EditPalette
                  groups={BRIEF_GROUPS}
                  busy={magicBusy}
                  disabled={editingClosed}
                  onPick={pickEdit}
                />
              </div>
            ) : (
              <div>
                {versions.map(v => (
                  <div key={v.v} className="rounded-lg border border-white/[0.06] p-3 mb-2">
                    <div className="flex justify-between items-baseline text-micro">
                      <span className="font-semibold text-white/75">v{v.v} · {v.source}{v.restored_from ? ` (from v${v.restored_from})` : ''}</span>
                      <span className="text-white/35">{new Date(v.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {v.v !== (brief.versions?.length || 1) && v.body_md ? (
                      <button onClick={() => restore(v.v)} className="mt-2 text-micro text-sky-200 hover:text-sky-200 font-semibold">Restore this version</button>
                    ) : null}
                  </div>
                ))}
                {versions.length === 0 ? (
                  <p className="text-label text-white/40">No saved versions yet.</p>
                ) : null}
              </div>
            )}
          </ComposerRail>
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
        {/* The rewrite, arriving. Sits directly above the buttons that started
            it, so the answer is at the point of action rather than somewhere
            else on the page. Reversed column keeps the newest line in view
            without a scroll listener fighting the user. */}
        {magicBusy && magicStream && (
          <div className="mb-2.5 max-h-28 overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
            <p className="text-label leading-relaxed text-white/50 whitespace-pre-wrap [direction:ltr]">
              …{magicStream.slice(-320)}
            </p>
          </div>
        )}
        {/* What the next chip will touch. The selection used to be read
            invisibly at click time, so there was no way to tell a passage
            rewrite from a whole-brief rewrite until the result came back. */}
        {!editingClosed && scoped ? (
          <div className="mb-2 flex items-center gap-2 text-micro">
            <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-1 font-semibold text-sky-200">
              Selected
            </span>
            <span className="min-w-0 flex-1 truncate text-white/45" title={selection}>
              {selection.replace(/\s+/g, ' ').slice(0, 120)}
            </span>
            <button
              onClick={() => { editor?.commands.focus(); editor?.commands.setTextSelection(editor.state.selection.to) }}
              className="flex-shrink-0 text-white/35 hover:text-white/70"
              title="Clear the selection and edit the whole brief"
            >
              ×
            </button>
          </div>
        ) : null}
        {/* On a phone there is no rail, so the full palette lives in a real
            bottom sheet: backdrop tap, swipe-down and Escape all close it, and
            the close path is never disabled. It used to be an inline panel in
            this footer whose only way out was the toggle chip — which disables
            itself while a revise runs, so for up to 90 seconds the panel could
            not be dismissed at all. Same component, same groups, same handler
            as the desktop Refine tab; only the container differs. */}
        {narrow && !editingClosed ? (
          <div ref={setSheetHost}>
          {sheetHost ? (
          <BottomSheet
            open={showEdits}
            onClose={() => setShowEdits(false)}
            fullHeight={false}
            ariaLabel="Edit options"
            container={sheetHost}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between px-4 pb-2">
                <span className="text-body font-semibold text-white/85">Edits</span>
                <button
                  type="button"
                  onClick={() => setShowEdits(false)}
                  aria-label="Close edit options"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-white/50 active:bg-white/[0.08]"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="max-h-[calc(55dvh/var(--z,1))] overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
                <EditPalette
                  groups={BRIEF_GROUPS}
                  busy={magicBusy}
                  onPick={it => { setShowEdits(false); pickEdit(it) }}
                  dense
                />
              </div>
            </div>
          </BottomSheet>
          ) : null}
          </div>
        ) : null}
        {!editingClosed ? (
          <div className="flex gap-1.5 flex-wrap items-center">
            {MAGIC.map(m => (
              <button
                key={m.mode}
                onClick={() => runMagic(m.mode, m.label)}
                disabled={magicBusy !== null}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-label font-semibold text-white/70 hover:bg-white/[0.09] disabled:opacity-40"
              >
                {magicBusy === m.mode ? m.busy : m.label}
              </button>
            ))}
            {narrow ? (
            <button
              onClick={() => setShowEdits(true)}
              title="Tone, humour, length, sharpen, analogy"
              aria-haspopup="dialog"
              aria-expanded={showEdits}
              className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-label font-semibold text-white/70 hover:bg-white/[0.09]"
            >
              More edits
            </button>
            ) : null}
            <button
              onClick={dictate}
              disabled={magicBusy !== null}
              title={listening ? 'Stop dictating' : 'Dictate an instruction for Cleo'}
              className={`rounded-full border px-2.5 py-1.5 text-label font-semibold disabled:opacity-40 ${
                listening ? 'border-red-400/40 bg-red-400/15 text-rose-200' : 'border-sky-400/30 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20'
              }`}
            >
              {listening
                ? (narrow ? 'Tap to stop' : 'Listening... tap to stop')
                : <span className="inline-flex items-center gap-1.5"><Mic size={12} /> {narrow ? 'Cleo' : 'Tell Cleo'}</span>}
            </button>
            {notes.length > 0 ? (
              <span className="relative">
                <button
                  onClick={() => setNotesOpen(o => !o)}
                  title={`${notes.length} standing note${notes.length === 1 ? '' : 's'} Cleo applies to every brief`}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-label font-semibold text-white/55 hover:text-white/85 hover:bg-white/[0.07]"
                >
                  <span className="inline-flex items-center gap-1.5"><StickyNote size={12} /> {narrow ? notes.length : `Cleo remembers · ${notes.length}`}</span>
                </button>
                {notesOpen ? (
                  <div className="absolute bottom-full mb-2 left-0 z-20 w-72 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-base shadow-xl p-2.5">
                    <div className="text-micro font-semibold uppercase tracking-[0.14em] text-white/40 px-1 pb-1.5">
                      Standing notes · every brief
                    </div>
                    {notes.map(n => (
                      <div key={n.id} className="flex items-start gap-2 rounded-lg px-1.5 py-1.5 hover:bg-white/[0.04]">
                        <span className="text-label text-white/70 leading-snug flex-1">{n.text}</span>
                        <button
                          onClick={() => forgetNote(n.id)}
                          aria-label="Forget this note"
                          className="text-white/30 hover:text-rose-200 text-body leading-none flex-shrink-0"
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
              <span className="flex items-center gap-2 text-label text-white/55 bg-white/[0.04] rounded-full px-3 py-1.5">
                “{cleoNote.slice(0, 80)}”
                <button
                  onClick={() => { runMagic('instruction', 'Tell Cleo', cleoNote); setCleoNote('') }}
                  className="text-sky-200 font-semibold"
                >
                  Apply once
                </button>
                <button
                  onClick={() => { rememberNote(cleoNote); runMagic('instruction', 'Tell Cleo', cleoNote); setCleoNote('') }}
                  className="text-emerald-200 font-semibold"
                  title="Apply now and honor this on every future brief"
                >
                  Remember
                </button>
                <button onClick={() => setCleoNote('')} aria-label="Clear the note" className="text-white/35 hover:text-white/70"><X size={13} /></button>
              </span>
            ) : null}
          </div>
        ) : null}

          {preview ? (
            <div className="mt-2.5 rounded-xl border border-dashed border-sky-400/35 bg-sky-400/[0.05] p-3.5">
              <div className="flex items-center justify-between mb-2 gap-3">
                <div className="text-micro font-semibold uppercase tracking-[0.14em] text-sky-200">Preview · {preview.label}</div>
                <div className="text-micro text-white/40 tabular-nums">
                  {changedDiffs.length === 0
                    ? 'no changes'
                    : `${acceptedKeys.size}/${changedDiffs.length} kept`}
                </div>
              </div>
              {changedDiffs.length === 0 ? (
                <div className="text-label text-white/50">This revision came back identical to the current draft.</div>
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
                            className={`w-4 h-4 rounded border inline-flex items-center justify-center text-micro flex-shrink-0 ${kept ? 'bg-emerald-400 border-emerald-400 text-emerald-950 font-bold' : 'border-white/25'}`}
                          >
                            {kept ? <Check size={11} strokeWidth={2.5} /> : ''}
                          </span>
                          <span className="text-micro font-semibold text-white/70">
                            {d.heading || 'Intro'} <span className="text-white/35 font-normal">· {d.status}</span>
                          </span>
                        </label>
                        <div className="text-label leading-relaxed whitespace-pre-wrap break-words">
                          {wordDiff(before, after).map((op, i) => (
                            <span
                              key={i}
                              className={
                                op.type === 'add' ? 'bg-emerald-400/20 text-emerald-200 rounded px-0.5'
                                : op.type === 'del' ? 'bg-red-400/15 text-rose-200/70 line-through rounded px-0.5'
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
                  className="rounded-lg bg-emerald-400 text-emerald-950 px-4 py-2 text-label font-bold disabled:opacity-40"
                >
                  {changedDiffs.length <= 1 ? 'Keep it' : `Keep ${acceptedKeys.size} of ${changedDiffs.length}`}
                </button>
                <button onClick={() => setPreview(null)} className="rounded-lg bg-white/[0.06] text-white/70 px-4 py-2 text-label font-semibold">Discard</button>
                {changedDiffs.length > 1 && rejected.size > 0 ? (
                  <button onClick={() => setRejected(new Set())} className="text-micro text-white/40 hover:text-white/70 ml-auto">Keep all</button>
                ) : null}
              </div>
            </div>
          ) : null}

          {pushed ? (
            <div className="text-label text-emerald-200 mt-2.5">
              Sent {pushed.length} format{pushed.length === 1 ? '' : 's'} to Google Docs.{' '}
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
                <span className="text-micro font-semibold uppercase tracking-[0.14em] text-white/40">Publish as</span>
                {FACTORY_FANOUT.map(f => {
                  const on = fanout.has(f.channel)
                  return (
                    <label key={f.channel} className="flex items-center gap-1.5 text-label text-white/70 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleFanout(f.channel)}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden
                        className={`w-4 h-4 rounded border inline-flex items-center justify-center text-micro peer-focus-visible:ring-1 peer-focus-visible:ring-emerald-300/70 ${on ? 'bg-emerald-400 border-emerald-400 text-emerald-950 font-bold' : 'border-white/25'}`}
                      >
                        {on ? <Check size={11} strokeWidth={2.5} /> : ''}
                      </span>
                      {f.label}
                    </label>
                  )
                })}
                {narrow ? (
                  <button onClick={() => setFanoutOpen(false)} className="text-micro font-semibold text-sky-200 ml-auto">Done</button>
                ) : null}
              </div>
            ) : (
              <button
                onClick={() => setFanoutOpen(true)}
                className="flex w-full items-baseline gap-2 mt-2.5 text-left"
              >
                <span className="text-micro font-semibold uppercase tracking-[0.14em] text-white/40 flex-shrink-0">Publish as</span>
                <span className={`text-label truncate flex-1 ${fanout.size ? 'text-white/70' : 'text-amber-200/80'}`}>
                  {fanoutSummary || 'nothing selected'}
                </span>
                <span className="text-micro font-semibold text-sky-200 flex-shrink-0">Change</span>
              </button>
            )}
            {/* Both verdicts on one row. Ship it or bin it, reachable from the
                same place, with the destructive one deliberately quieter and
                held well away from the thumb path to the push button. */}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setBinning(true)}
                disabled={binBusy}
                className="rounded-lg border border-rose-400/25 bg-rose-500/[0.06] text-rose-200/85 hover:bg-rose-500/[0.12] px-3 py-2 text-label font-semibold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-300/60"
              >
                {narrow ? 'Bin' : 'Bin this brief'}
              </button>
              <button
                onClick={push}
                disabled={pushing || fanout.size === 0 || !brief.body_md}
                className="ml-auto rounded-lg bg-emerald-400 text-emerald-950 px-4 py-2.5 text-label font-bold disabled:opacity-40"
              >
                {pushing
                  ? 'Sending…'
                  : narrow
                    ? `Send ${fanout.size} to Docs`
                    : `Send ${fanout.size} format${fanout.size === 1 ? '' : 's'} to Google Docs`}
              </button>
            </div>
            </>
          )}
        </footer>
      ) : null}
    </ComposerShell>
  )
}
