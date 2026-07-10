import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Markdown } from 'tiptap-markdown'
import { contentV2Api } from '../../hooks/useContentV2'
import { FACTORY_FANOUT, type WeeklyBriefRow } from '../../lib/contentV2'

// The weekly brief editor (R8; mockup set 1 mock 2 + set 2 pin 12).
// Full-screen overlay, deep-linked #/content?brief=<week>. The canvas is a
// TipTap rich-text editor whose CANONICAL format stays markdown (tiptap-markdown
// serializes on save), so the factory/Google Docs contract is unchanged.
// Desktop: edit + toolbar + versions + magic row + fan-out push.
// Mobile (narrow): read-mode + magic row + Tell Cleo dictation + big actions;
// careful writing stays on the desktop by design (R13).

const MAGIC: Array<{ mode: string; label: string }> = [
  { mode: 'tighten', label: 'Tighten' },
  { mode: 'sharper_open', label: 'Sharper open' },
  { mode: 'harder_ending', label: 'Harder ending' },
  { mode: 'more_data', label: 'More data' },
]

type SpeechRecognitionLike = {
  lang: string; interimResults: boolean; maxAlternatives: number
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null; onerror: (() => void) | null
  start: () => void; stop: () => void
}

function getSpeech(): SpeechRecognitionLike | null {
  const w = window as unknown as Record<string, unknown>
  const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined
  return Ctor ? new Ctor() : null
}

export function BriefEditor({ week, narrow, onClose }: { week: string; narrow: boolean; onClose: () => void }) {
  const [brief, setBrief] = useState<WeeklyBriefRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<{ label: string; md: string } | null>(null)
  const [magicBusy, setMagicBusy] = useState<string | null>(null)
  const [showVersions, setShowVersions] = useState(false)
  const [fanout, setFanout] = useState<Set<string>>(new Set(FACTORY_FANOUT.filter(f => f.defaultOn).map(f => f.channel)))
  const [pushing, setPushing] = useState(false)
  const [pushed, setPushed] = useState<Array<{ channel: string; doc_url: string | null }> | null>(null)
  const [listening, setListening] = useState(false)
  const [cleoNote, setCleoNote] = useState('')
  const speechRef = useRef<SpeechRecognitionLike | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Markdown.configure({ html: false, linkify: true }),
    ],
    editable: !narrow,
    content: '',
    onUpdate: () => setDirty(true),
  })

  const load = useCallback(async () => {
    try {
      const r = await contentV2Api<{ brief: WeeklyBriefRow }>(`/api/briefs/${week}`)
      setBrief(r.brief)
    } catch (e) {
      setError(String((e as Error).message || e))
    }
  }, [week])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (editor && brief && !dirty) {
      editor.commands.setContent(brief.body_md || '')
    }
    // Load the canvas whenever a fresh brief arrives and there are no local edits.
  }, [editor, brief]) // eslint-disable-line react-hooks/exhaustive-deps

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
      if (dirty) { body.body_md = currentMd(); body.source = 'krish' }
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

  const keepPreview = useCallback(async () => {
    if (!preview) return
    await contentV2Api(`/api/briefs/${week}`, { method: 'PATCH', body: JSON.stringify({ body_md: preview.md, source: 'cleo' }) })
    setPreview(null)
    setDirty(false)
    await load()
  }, [preview, week, load])

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
    if (listening) { speechRef.current?.stop(); return }
    const rec = getSpeech()
    if (!rec) { setCleoNote(''); setPreview(null); setError('Dictation is not available in this browser; type the note instead.'); return }
    speechRef.current = rec
    rec.lang = 'en-GB'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      const said = e.results[0]?.[0]?.transcript || ''
      setCleoNote(said)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    setListening(true)
    rec.start()
  }, [listening])

  const editingClosed = brief ? !['ready', 'in_review', 'approved'].includes(brief.status) : false
  const versions = useMemo(() => (brief?.versions || []).slice().reverse(), [brief])

  return (
    <div className="fixed inset-0 z-50 bg-base flex flex-col" style={{ height: 'calc(100dvh / var(--z, 1))' }}>
      {/* header */}
      <header className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/[0.07] flex-shrink-0">
        <button onClick={onClose} className="text-white/50 hover:text-white text-[13px]">← Back</button>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-300/80">Weekly brief · {week}</div>
          <div className="text-[14px] font-bold text-white truncate">{brief?.title || 'Loading...'}</div>
        </div>
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
              {saving ? 'Saving...' : dirty ? 'Save' : 'Saved'}
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

      {/* magic row + preview */}
      {brief && !editingClosed ? (
        <div className="px-4 sm:px-6 py-3 border-t border-white/[0.07] flex-shrink-0">
          <div className="flex gap-1.5 flex-wrap items-center">
            {MAGIC.map(m => (
              <button
                key={m.mode}
                onClick={() => runMagic(m.mode, m.label)}
                disabled={magicBusy !== null}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-white/70 hover:bg-white/[0.09] disabled:opacity-40"
              >
                {magicBusy === m.mode ? 'Working...' : m.label}
              </button>
            ))}
            <button
              onClick={dictate}
              disabled={magicBusy !== null}
              className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold disabled:opacity-40 ${
                listening ? 'border-red-400/40 bg-red-400/15 text-red-300' : 'border-sky-400/30 bg-sky-400/10 text-sky-300 hover:bg-sky-400/20'
              }`}
            >
              {listening ? 'Listening... tap to stop' : '🎙 Tell Cleo'}
            </button>
            {cleoNote ? (
              <span className="flex items-center gap-2 text-[11.5px] text-white/55 bg-white/[0.04] rounded-full px-3 py-1.5">
                “{cleoNote.slice(0, 80)}”
                <button
                  onClick={() => { runMagic('instruction', 'Tell Cleo', cleoNote); setCleoNote('') }}
                  className="text-sky-300 font-semibold"
                >
                  Apply
                </button>
                <button onClick={() => setCleoNote('')} className="text-white/35">×</button>
              </span>
            ) : null}
          </div>
          {preview ? (
            <div className="mt-3 rounded-xl border border-dashed border-sky-400/35 bg-sky-400/[0.05] p-3.5">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-sky-300 mb-1.5">Preview · {preview.label}</div>
              <div className="text-[12.5px] text-white/70 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">{preview.md.slice(0, 1500)}</div>
              <div className="flex gap-2 mt-3">
                <button onClick={keepPreview} className="rounded-lg bg-emerald-400 text-emerald-950 px-4 py-2 text-[12px] font-bold">Keep it</button>
                <button onClick={() => setPreview(null)} className="rounded-lg bg-white/[0.06] text-white/70 px-4 py-2 text-[12px] font-semibold">Undo</button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* fan-out bar */}
      {brief ? (
        <footer className="px-4 sm:px-6 py-3.5 border-t border-white/[0.07] flex-shrink-0 bg-base">
          {pushed ? (
            <div className="text-[12.5px] text-emerald-300">
              Pushed {pushed.length} format{pushed.length === 1 ? '' : 's'} to Google Docs.{' '}
              {pushed.filter(p => p.doc_url).map(p => (
                <a key={p.channel} href={p.doc_url!} target="_blank" rel="noreferrer" className="underline mr-2">{p.channel}</a>
              ))}
              <span className="text-white/40">Cleo confirms on Telegram. You are done for the week.</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/40">Publish as</span>
              {FACTORY_FANOUT.map(f => {
                const on = fanout.has(f.channel)
                return (
                  <label key={f.channel} className="flex items-center gap-1.5 text-[12px] text-white/70 cursor-pointer select-none">
                    <span
                      onClick={() => setFanout(prev => {
                        const next = new Set(prev)
                        if (next.has(f.channel)) next.delete(f.channel); else next.add(f.channel)
                        return next
                      })}
                      className={`w-4 h-4 rounded border inline-flex items-center justify-center text-[10px] ${on ? 'bg-emerald-400 border-emerald-400 text-emerald-950 font-bold' : 'border-white/25'}`}
                    >
                      {on ? '✓' : ''}
                    </span>
                    {f.label}
                  </label>
                )
              })}
              <button
                onClick={push}
                disabled={pushing || fanout.size === 0 || !brief.body_md}
                className="ml-auto rounded-lg bg-emerald-400 text-emerald-950 px-4 py-2.5 text-[12.5px] font-bold disabled:opacity-40"
              >
                {pushing ? 'Pushing...' : `Push ${fanout.size} format${fanout.size === 1 ? '' : 's'} to Google Docs`}
              </button>
            </div>
          )}
        </footer>
      ) : null}
    </div>
  )
}
