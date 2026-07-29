import React, { useCallback, useRef, useState } from 'react'
import { Mail, FileText, Loader2, CheckCircle2 } from 'lucide-react'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'

interface Props {
  onImported?: (summary: { processed: number; paid: number; free: number }) => void
}

interface PendingFile {
  id: string
  name: string
  state: 'sending' | 'done' | 'error'
  message?: string
}

const PUBLICATIONS = [
  { source: 'mindmaker_live', label: 'Mindmaker Live' },
  { source: 'tech0nomic', label: 'Techonomic' },
] as const

/**
 * Substack subscriber import for the Leads tab.
 *
 * Substack has no API, so the supported path is a manual CSV export. Pick the
 * publication, drop the export, and it lands in the shared audience_contacts
 * table tagged with that source: free subscribers become leads, paid
 * subscribers become Subscriptions (never both). Forwards to
 * /api/audience/import-substack.
 */
export function SubstackImportDropzone({ onImported }: Props) {
  const { toast } = useToast()
  const h = useHaptics()
  const [hover, setHover] = useState(false)
  const [files, setFiles] = useState<PendingFile[]>([])
  const [source, setSource] = useState<typeof PUBLICATIONS[number]['source']>('mindmaker_live')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const send = useCallback(async (fileName: string, csv: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setFiles(prev => [...prev, { id, name: fileName, state: 'sending' }])
    try {
      const r = await fetch('/api/audience/import-substack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, source }),
      })
      const payload = await r.json().catch(() => ({}))
      if (!r.ok || !payload.ok) throw new Error(payload?.error || String(r.status))
      setFiles(prev => prev.map(f => f.id === id ? { ...f, state: 'done', message: `${payload.paid} paid · ${payload.free} free` } : f))
      onImported?.(payload)
      h.success()
      toast(`Imported ${payload.processed} Substack subscribers (${payload.paid} paid, ${payload.free} free).`, 'success')
    } catch (e: any) {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, state: 'error', message: String(e?.message || e) } : f))
      h.error()
      toast('Substack import failed — check the CSV.', 'error')
    }
  }, [onImported, toast, h, source])

  const handleFiles = useCallback(async (list: File[]) => {
    for (const file of list) {
      const text = await file.text().catch(() => '')
      if (text.trim()) send(file.name, text)
    }
  }, [send])

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setHover(true) }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => { e.preventDefault(); setHover(false); h.heavy(); handleFiles(Array.from(e.dataTransfer.files || [])) }}
        className={`rounded-xl border-2 border-dashed transition-colors px-4 py-5 text-center
          ${hover ? 'border-teal-500/40 bg-teal-500/[0.04]' : 'border-white/10 bg-white/[0.015] hover:border-white/20'}`}
      >
        <Mail size={20} className="mx-auto text-teal-300/70" />
        <p className="text-[12px] text-white/75 mt-2 font-medium">Drop a Substack subscriber export</p>
        <p className="text-[11px] text-white/45 mt-0.5">
          Subscribers → ⋯ → Export. Free become leads, paid become Subscriptions.
        </p>
        <div className="flex items-center justify-center gap-1 mt-2" role="radiogroup" aria-label="Publication">
          {PUBLICATIONS.map(p => (
            <button
              key={p.source}
              type="button"
              role="radio"
              aria-checked={source === p.source}
              onClick={(e) => { e.stopPropagation(); setSource(p.source) }}
              className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition-colors
                ${source === p.source
                  ? 'border-teal-500/40 bg-teal-500/15 text-teal-200'
                  : 'border-white/10 text-white/45 hover:text-white/70'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1 rounded-md text-[11px] font-medium border border-teal-500/30 text-teal-200 hover:bg-teal-500/15 transition-colors"
          >
            Pick CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={(e) => { handleFiles(Array.from(e.target.files || [])); if (fileInputRef.current) fileInputRef.current.value = '' }}
            className="hidden"
          />
        </div>
      </div>

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.slice(-4).map(f => (
            <li key={f.id} className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[11px]">
              <FileText size={11} className="text-white/40 flex-shrink-0" />
              <span className="flex-1 min-w-0 truncate text-white/75">{f.name}</span>
              {f.state === 'sending' && <span className="flex items-center gap-1 text-white/55"><Loader2 size={11} className="animate-spin" />Importing…</span>}
              {f.state === 'done' && <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 size={11} />{f.message || 'Done'}</span>}
              {f.state === 'error' && <span className="text-rose-300" title={f.message}>Failed</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
