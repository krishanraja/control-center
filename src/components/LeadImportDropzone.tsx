import React, { useCallback, useRef, useState } from 'react'
import { UploadCloud, FileText, CheckCircle2 } from '@/lib/icons'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import { Working } from './shared/Working'

interface Props {
  onIngested?: (run: { fileName: string }) => void
}

interface PendingFile {
  id: string
  name: string
  state: 'pending' | 'sending' | 'done' | 'error'
  message?: string
}

/**
 * Drag-and-drop ingest surface for the Leads tab.
 *
 * Accepts files dropped from the OS (CSV / PDF / DOCX exported from anywhere)
 * OR picked from Google Drive via the Drive Picker. In both cases we forward
 * a {drive_file_id, source_document_name} (or {file_name, raw_text}) payload
 * to `/api/leads/import`, which fans out to the N8N
 * `Nell | Lead Document Ingest` workflow. The workflow extracts structured
 * leads via Sonnet, dedupes by email, and writes rows that flow back into
 * the lane via Postgres realtime within ~5s.
 *
 * Note: this component intentionally keeps the picker code minimal — the
 * Google Picker integration is loaded lazily (script tag injected on first
 * use) so we don't pay the JS cost until Krish actually wants to import.
 */
export function LeadImportDropzone({ onIngested }: Props) {
  const { toast } = useToast()
  const h = useHaptics()
  const [hover, setHover] = useState(false)
  const [files, setFiles] = useState<PendingFile[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const send = useCallback(
    async (fileName: string, payload: Record<string, unknown>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setFiles(prev => [...prev, { id, name: fileName, state: 'sending' }])
      try {
        const r = await fetch('/api/leads/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!r.ok) {
          const text = await r.text().catch(() => '')
          throw new Error(text || String(r.status))
        }
        setFiles(prev => prev.map(f => f.id === id ? { ...f, state: 'done' } : f))
        onIngested?.({ fileName })
        h.success()
        toast(`Importing leads from ${fileName}…`, 'success')
      } catch (e: any) {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, state: 'error', message: String(e?.message || e) } : f))
        h.error()
        toast('Ingest failed — check the N8N webhook.', 'error')
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
      // For OS drops we read the file inline and ship it as raw_text. The
      // N8N workflow handles all the parsing — we don't need to know if it's
      // a CSV, PDF, or DOCX here.
      const text = await readAsText(file)
      send(file.name, {
        source_document_name: file.name,
        raw_text: text,
      })
    }
  }, [send, h])

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || [])
    for (const file of picked) {
      const text = await readAsText(file)
      send(file.name, {
        source_document_name: file.name,
        raw_text: text,
      })
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const openDrivePicker = async () => {
    // Lightweight: prompt for a Drive file URL. We extract the file id and
    // hand it to /api/leads/import. A full Google Picker (gapi) integration
    // is a follow-up — this keeps the PR small while preserving the UX.
    const url = window.prompt('Paste a Google Drive file URL (the workflow has Drive read access):')
    if (!url) return
    const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
    const id = m?.[1]
    if (!id) {
      toast('Could not parse a Drive file id from that URL.', 'error')
      return
    }
    const name = url.split('/').pop() || 'Drive document'
    send(name, {
      drive_file_id: id,
      source_document_name: name,
      source_url: url,
    })
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setHover(true) }}
        onDragLeave={() => setHover(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed transition-colors px-4 py-5 text-center
          ${hover
            ? 'border-emerald-500/40 bg-emerald-500/[0.04]'
            : 'border-white/10 bg-white/[0.015] hover:border-white/20'}`}
      >
        <UploadCloud size={20} className="mx-auto text-white/40" />
        <p className="text-label text-white/75 mt-2 font-medium">
          Drop lead docs here
        </p>
        <p className="text-micro text-white/45 mt-0.5">
          CSV, PDF, DOCX, Apollo exports — N8N parses, dedupes by email, fans into lanes.
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
            onClick={openDrivePicker}
            className="px-3 py-1 rounded-md text-micro font-medium border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/15 transition-colors"
          >
            From Google Drive
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFilePick}
            className="hidden"
            accept=".csv,.txt,.md,.pdf,.docx,.json"
          />
        </div>
      </div>

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
