import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Link2, Search, Sparkles, Upload, X } from 'lucide-react'
import { Modal } from '../shared/Modal'
import { Working } from '../shared/Working'
import { useToast } from '../shared/Toast'
import { useHaptics } from '../../hooks/useHaptics'
import { MicButton } from '../shared/VoiceCapture'

// Start a piece from a topic, from research you already have, or from both.
//
// /api/content-ideas/research-topic has been complete and wired since
// 2026-08-13 and had no caller anywhere in src/: it could only be reached with
// curl. Every other route into the engine was either something the machine
// found on its own (inspiration sweeps, lane sourcing, pool headlines) or the
// one-line quick capture, which stores a raw sentence and lets Cleo enrich it
// later. Nothing took a topic you named and went and researched it, and
// nothing took a pile of research you already had and turned it into a piece.
//
// Both land in the same place, deliberately: the endpoint stores pasted
// material in the same meta.materials[] shape the composer and revise already
// read, so "research this for me" and "here is my own research" are the same
// piece afterwards.

interface Paste { id: string; title: string; content: string; url: string }

const BLANK = (): Paste => ({ id: Math.random().toString(36).slice(2), title: '', content: '', url: '' })

// Matches MAX_MATERIAL in the endpoint. Dropping a book silently truncated is
// worse than being told which file was too big.
const MAX_MATERIAL = 400_000

export function StartFromResearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast()
  const h = useHaptics()
  const [topic, setTopic] = useState('')
  const [angle, setAngle] = useState('')
  const [format, setFormat] = useState<'' | 'paid' | 'built'>('')
  const [pastes, setPastes] = useState<Paste[]>([])
  const [web, setWeb] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const topicRef = useRef<HTMLTextAreaElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => topicRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [open])

  // Reset between sessions, or a captured topic haunts the next one.
  useEffect(() => {
    if (open) return
    setTopic(''); setAngle(''); setFormat(''); setPastes([]); setWeb(true); setBusy(false)
  }, [open])

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const picked = Array.from(files).slice(0, 8)
    const next: Paste[] = []
    for (const f of picked) {
      // Text only. A PDF read as text is mojibake, and silently attaching it
      // would poison the research rather than fail loudly.
      if (f.size > MAX_MATERIAL) { toast(`${f.name} is too large to attach.`, 'error'); continue }
      if (!/^text\/|\/(json|markdown|csv)$/.test(f.type) && !/\.(txt|md|markdown|csv|json)$/i.test(f.name)) {
        toast(`${f.name} is not a text file. Paste the text instead.`, 'error'); continue
      }
      next.push({ ...BLANK(), title: f.name, content: (await f.text()).slice(0, MAX_MATERIAL) })
    }
    if (next.length) { h.tap(); setPastes(p => [...p, ...next].slice(0, 8)) }
  }, [h, toast])

  const submit = async () => {
    const t = topic.trim()
    if (t.length < 8) { toast('Give it a topic first, at least a sentence.', 'error'); return }
    if (busy) return
    h.heavy(); setBusy(true)
    try {
      const materials = pastes
        .filter(p => p.content.trim() || p.url.trim())
        .map(p => ({ title: p.title.trim() || undefined, content: p.content.trim() || undefined, url: p.url.trim() || undefined }))
      const r = await fetch('/api/content-ideas/research-topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: t,
          angle: angle.trim() || undefined,
          format: format || undefined,
          materials: materials.length ? materials : undefined,
          web,
        }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.hint || j.error || `HTTP ${r.status}`)
      h.success()
      const parts = [
        j.queriesRun ? `${j.queriesRun} angle${j.queriesRun === 1 ? '' : 's'} researched` : '',
        j.citations ? `${j.citations} source${j.citations === 1 ? '' : 's'}` : '',
        j.materialsAttached ? `${j.materialsAttached} of yours attached` : '',
      ].filter(Boolean)
      toast(parts.length ? `Drafted. ${parts.join(', ')}.` : 'Drafted.', 'success')
      // The endpoint reports what it could NOT find. That is the most useful
      // thing it says, so it gets its own toast rather than being appended to
      // a success line nobody finishes reading.
      if (j.gaps) toast(`Gaps: ${String(j.gaps).slice(0, 160)}`, 'info')
      onClose()
      // Straight into the composer on the piece it just made, rather than
      // back to a list to go and find it.
      if (j.idea?.id) window.location.hash = `#/content?idea=${j.idea.id}`
    } catch (e) {
      h.error()
      toast(`Could not start it: ${(e as Error).message || 'error'}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const hasMaterial = pastes.some(p => p.content.trim() || p.url.trim())

  return (
    <Modal open={open} onClose={onClose} variant="center" title="Start from research" hideTitle
      className="max-w-2xl top-[8vh] translate-y-0 p-0">
      <header className="flex items-center gap-2 px-5 pt-4 pb-2">
        <Sparkles size={14} className="text-violet-200" />
        <h2 className="text-[13px] font-semibold text-white">Start from an idea or research</h2>
        <button type="button" onClick={onClose} className="ml-auto text-white/40 hover:text-white/80" aria-label="Close">
          <X size={14} />
        </button>
      </header>

      <div
        className="px-5 pb-5 space-y-3 max-h-[76vh] overflow-y-auto"
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer?.files?.length) void addFiles(e.dataTransfer.files) }}
      >
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40">
            What is this about
          </label>
          <div className="relative">
            <textarea
              ref={topicRef}
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit() } }}
              rows={3}
              placeholder='e.g. "What happens to agency pricing when the deliverable takes an hour instead of a week"'
              className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 pr-10 text-[13px] text-white placeholder-white/30 focus:border-violet-500/40 focus:outline-none"
            />
            <div className="absolute right-2 top-2">
              <MicButton
                endpoint="/api/content-ideas/voice"
                disabled={busy}
                onJson={j => {
                  const said = typeof j.text === 'string' ? j.text.trim() : ''
                  if (said) setTopic(cur => (cur ? `${cur} ${said}` : said))
                }}
                onError={() => toast('Could not transcribe that. Type it instead.', 'error')}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40">Format</span>
          {([['', 'Decide later'], ['paid', 'Paid'], ['built', 'Built']] as const).map(([v, label]) => (
            <button
              key={v || 'none'}
              type="button"
              onClick={() => setFormat(v)}
              className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${
                format === v ? 'border-violet-500/50 bg-violet-500/15 text-violet-200' : 'border-white/10 text-white/55 hover:bg-white/[0.06]'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="text-[11px] text-white/35">
            {format === 'paid' ? 'Follows the money and how it has moved.'
              : format === 'built' ? 'Goes looking for people who shipped it.'
              : 'Shapes the research questions.'}
          </span>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40">
            Angle <span className="font-normal normal-case tracking-normal text-white/30">(optional)</span>
          </label>
          <input
            value={angle}
            onChange={e => setAngle(e.target.value)}
            placeholder="The specific line you want it to take"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[12.5px] text-white placeholder-white/30 focus:border-violet-500/40 focus:outline-none"
          />
        </div>

        {/* Your own research */}
        <div className={`rounded-lg border p-3 transition-colors ${dragging ? 'border-violet-500/50 bg-violet-500/[0.06]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
          <div className="mb-2 flex items-center gap-2">
            <FileText size={12} className="text-white/40" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40">Research you already have</span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="ml-auto flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/60 hover:bg-white/[0.06]"
            >
              <Upload size={11} /> Add files
            </button>
            <button
              type="button"
              onClick={() => setPastes(p => [...p, BLANK()].slice(0, 8))}
              className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/60 hover:bg-white/[0.06]"
            >
              Paste
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".txt,.md,.markdown,.csv,.json,text/*"
            className="hidden"
            onChange={e => { if (e.target.files?.length) void addFiles(e.target.files); e.target.value = '' }}
          />

          {pastes.length === 0 ? (
            <p className="text-[11.5px] leading-snug text-white/35">
              Drop text files here, or paste a link or an extract. Anything you add is attached to the
              piece as material, so it grounds every later rewrite rather than being read once.
            </p>
          ) : (
            <div className="space-y-2">
              {pastes.map((p, i) => (
                <div key={p.id} className="rounded-md border border-white/[0.08] bg-white/[0.02] p-2">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <input
                      value={p.title}
                      onChange={e => setPastes(list => list.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                      placeholder={`Source ${i + 1}`}
                      className="min-w-0 flex-1 bg-transparent text-[11.5px] font-semibold text-white/80 placeholder-white/25 focus:outline-none"
                    />
                    <button type="button" onClick={() => setPastes(list => list.filter((_, j) => j !== i))}
                      className="text-white/30 hover:text-rose-200" aria-label="Remove">
                      <X size={12} />
                    </button>
                  </div>
                  <div className="mb-1.5 flex items-center gap-1.5 rounded border border-white/[0.07] px-1.5">
                    <Link2 size={10} className="flex-shrink-0 text-white/30" />
                    <input
                      value={p.url}
                      onChange={e => setPastes(list => list.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                      placeholder="https://… (optional)"
                      className="min-w-0 flex-1 bg-transparent py-1 text-[11px] text-white/70 placeholder-white/25 focus:outline-none"
                    />
                  </div>
                  <textarea
                    value={p.content}
                    onChange={e => setPastes(list => list.map((x, j) => j === i ? { ...x, content: e.target.value } : x))}
                    rows={3}
                    placeholder="Paste the text"
                    className="w-full resize-none rounded border border-white/[0.07] bg-black/20 px-2 py-1.5 text-[11.5px] text-white/85 placeholder-white/25 focus:outline-none focus:border-violet-500/30"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Supplying material used to silently mean "and do not search". It is
            a choice now, because one source you want checked against the
            record is a completely different job from an ingest. */}
        <label className="flex items-start gap-2 text-[11.5px] text-white/60">
          <input type="checkbox" checked={web} onChange={e => setWeb(e.target.checked)} className="mt-0.5 accent-violet-500" />
          <span>
            <span className="font-semibold text-white/75">Search the web as well</span>
            <span className="block text-white/40">
              {hasMaterial
                ? web
                  ? 'Your material plus three research angles on the same topic.'
                  : 'Your material only. Nothing else will be looked up.'
                : 'Three research angles on the topic, shaped by the format.'}
            </span>
          </span>
        </label>

        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px] text-white/40">⌘Enter to start · Esc to close</p>
          <button
            type="button"
            onClick={submit}
            disabled={busy || topic.trim().length < 8}
            className="flex items-center gap-1.5 rounded-md border border-violet-500/30 bg-violet-500/15 px-3 py-1.5 text-[12px] font-medium text-violet-200 transition-colors hover:bg-violet-500/25 disabled:opacity-40"
          >
            {busy ? <Working size={12} /> : <Search size={12} />}
            {busy ? 'Researching…' : 'Research and draft'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
