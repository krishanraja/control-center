import React, { useCallback, useRef, useState } from 'react'
import { UploadCloud, FileText, CheckCircle2, Clipboard } from '@/lib/icons'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import { Working } from './shared/Working'

interface Props {
  onIngested?: (run: { source: string }) => void
}

interface PendingFile {
  id: string
  name: string
  state: 'pending' | 'sending' | 'done' | 'error'
  message?: string
}

/**
 * Guest import surface. Mirrors LeadImportDropzone in behavior so Krish gets
 * the same flexible-format ingest he has for leads: drop a CSV, drop a doc,
 * or paste raw rows into the textarea. The n8n workflow extracts core fields
 * (name + at least one contact channel) regardless of input format.
 */
export function GuestImportDropzone({ onIngested }: Props) {
  const { toast } = useToast()
  const h = useHaptics()
  const [hover, setHover] = useState(false)
  const [files, setFiles] = useState<PendingFile[]>([])
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const send = useCallback(
    async (sourceName: string, payload: Record<string, unknown>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setFiles(prev => [...prev, { id, name: sourceName, state: 'sending' }])
      try {
        const r = await fetch('/api/guests/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!r.ok) {
          const text = await r.text().catch(() => '')
          throw new Error(text || String(r.status))
        }
        setFiles(prev => prev.map(f => f.id === id ? { ...f, state: 'done' } : f))
        onIngested?.({ source: sourceName })
        h.success()
        toast(`Importing guests from ${sourceName}…`, 'success')
      } catch (e: any) {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, state: 'error', message: String(e?.message || e) } : f))
        h.error()
        toast('Ingest failed , check the N8N webhook.', 'error')
      }
    },
    [onIngested, toast, h],
  )

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setHover(false)
    h.heavy()
    const dropped = Array.from(e.dataTransfer.files || [])
    for (const file of dropped) {
      const text = await readAsText(file)
      send(file.name, { source_document_name: file.name, raw_text: text })
    }
  }, [send, h])

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || [])
    for (const file of picked) {
      const text = await readAsText(file)
      send(file.name, { source_document_name: file.name, raw_text: text })
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const submitPaste = () => {
    const trimmed = pasteText.trim()
    if (!trimmed) {
      toast('Paste something first.', 'error')
      return
    }
    const name = `pasted ${new Date().toLocaleTimeString()}`
    send(name, { source_document_name: name, raw_text: trimmed })
    setPasteText('')
    setPasteOpen(false)
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setHover(true) }}
        onDragLeave={() => setHover(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed transition-colors px-4 py-5 text-center
          ${hover
            ? 'border-violet-500/40 bg-violet-500/[0.04]'
            : 'border-white/10 bg-white/[0.015] hover:border-white/20'}`}
      >
        <UploadCloud size={20} className="mx-auto text-white/40" />
        <p className="text-label text-white/75 mt-2 font-medium">
          Drop a guest list or paste rows
        </p>
        <p className="text-micro text-white/45 mt-0.5">
          CSV, TSV, doc, sheet export , any format with name + a contact channel.
        </p>
        <div className="flex items-center justify-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1 rounded-md text-micro font-medium border border-white/10 text-white/80 hover:bg-white/[0.06] transition-colors"
          >
            Pick file
          </button>
          <button
            type="button"
            onClick={() => setPasteOpen(o => !o)}
            className="px-3 py-1 rounded-md text-micro font-medium border border-violet-500/30 text-violet-200 hover:bg-violet-500/15 transition-colors flex items-center gap-1"
          >
            <Clipboard size={11} />
            Paste rows
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFilePick}
            className="hidden"
            accept=".csv,.tsv,.txt,.md,.json"
          />
        </div>
      </div>

      {pasteOpen && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            placeholder="Paste rows here, in any format. Include at least name + one contact channel (email, LinkedIn, Twitter)."
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-label text-white/85 placeholder:text-white/30 focus:outline-none focus:border-violet-500/40 font-mono"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setPasteOpen(false); setPasteText('') }}
              className="px-3 py-1 rounded-md text-micro font-medium text-white/55 hover:bg-white/[0.06]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitPaste}
              className="px-3 py-1 rounded-md text-micro font-medium border border-violet-500/30 text-violet-200 hover:bg-violet-500/15"
            >
              Import
            </button>
          </div>
        </div>
      )}

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.slice(-4).map(f => (
            <li
              key={f.id}
              className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-micro"
            >
              <FileText size={11} className="text-white/40 flex-shrink-0" />
              <span className="flex-1 min-w-0 truncate text-white/75">{f.name}</span>
              {f.state === 'sending' && (
                <span className="flex items-center gap-1 text-white/55">
                  <Working size={11} />
                  Importing…
                </span>
              )}
              {f.state === 'done' && (
                <span className="flex items-center gap-1 text-emerald-300">
                  <CheckCircle2 size={11} />
                  Queued
                </span>
              )}
              {f.state === 'error' && (
                <span className="text-rose-300" title={f.message}>
                  Failed
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

async function readAsText(file: File): Promise<string> {
  try {
    return await file.text()
  } catch {
    return ''
  }
}
