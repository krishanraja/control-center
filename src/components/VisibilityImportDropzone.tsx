import React, { useCallback, useRef, useState } from 'react'
import { UploadCloud, FileText, CheckCircle2, Clipboard, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import type { VisibilityTargetType } from '../hooks/useVisibilityTargets'
import { Working } from './shared/Working'

interface Props {
  onIngested?: (count: number) => void
}

interface ImportRow {
  title: string
  type?: VisibilityTargetType
  event_url?: string
  cfp_url?: string
  deadline_at?: string
  location?: string
  format?: string
}

interface PendingFile {
  id: string
  name: string
  state: 'pending' | 'sending' | 'done' | 'error'
  count?: number
  message?: string
}

const VALID_TYPES: VisibilityTargetType[] = ['cfp', 'conference', 'podcast', 'newsletter', 'guest_appearance', 'other']

/**
 * Outbound visibility import. Drop a CSV, drop a TSV, or paste rows like:
 *   Title | type | event_url | cfp_url | deadline
 * Rows are inserted into visibility_targets with status='sourced'. Nova's
 * scheduled sweeper picks them up for deep enrichment on the next pass.
 *
 * Doing the parse + insert client-side (rather than via an n8n webhook) keeps
 * the import path live even when the n8n cloud plan is throttled.
 */
export function VisibilityImportDropzone({ onIngested }: Props = {}) {
  const { toast } = useToast()
  const h = useHaptics()
  const [hover, setHover] = useState(false)
  const [files, setFiles] = useState<PendingFile[]>([])
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const ingestRows = useCallback(async (sourceName: string, rows: ImportRow[]) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setFiles(prev => [...prev, { id, name: sourceName, state: 'sending', count: rows.length }])
    try {
      if (rows.length === 0) throw new Error('No rows parsed')
      const records = rows.map(r => ({
        title: r.title,
        type: VALID_TYPES.includes((r.type || 'other') as VisibilityTargetType) ? r.type : 'other',
        event_url: r.event_url || null,
        cfp_url: r.cfp_url || null,
        deadline_at: r.deadline_at || null,
        location: r.location || null,
        format: r.format || null,
        status: 'sourced',
        source: 'manual_import',
        origin: 'user',
      }))
      const { error } = await supabase.from('visibility_targets').insert(records)
      if (error) throw new Error(error.message)
      setFiles(prev => prev.map(f => f.id === id ? { ...f, state: 'done' } : f))
      onIngested?.(rows.length)
      h.success()
      toast(`Imported ${rows.length} visibility targets`, 'success')
    } catch (e: any) {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, state: 'error', message: String(e?.message || e) } : f))
      h.error()
      toast(`Import failed: ${e?.message || e}`, 'error')
    }
  }, [onIngested, toast, h])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setHover(false)
    const dropped = Array.from(e.dataTransfer.files || [])
    for (const file of dropped) {
      const text = await file.text()
      const rows = parseRows(text)
      await ingestRows(file.name, rows)
    }
  }, [ingestRows])

  const handleFilePick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || [])
    for (const file of picked) {
      const text = await file.text()
      const rows = parseRows(text)
      await ingestRows(file.name, rows)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [ingestRows])

  const handlePasteSubmit = useCallback(async () => {
    if (!pasteText.trim()) return
    const rows = parseRows(pasteText)
    await ingestRows('Pasted rows', rows)
    setPasteText('')
    setPasteOpen(false)
  }, [pasteText, ingestRows])

  return (
    <div className="space-y-2">
      <div
        onDragOver={e => { e.preventDefault(); setHover(true) }}
        onDragLeave={() => setHover(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
          hover ? 'border-violet-400/60 bg-violet-500/[0.05]' : 'border-white/15 bg-white/[0.015] hover:border-white/25'
        }`}
      >
        <UploadCloud size={20} className="text-white/40 mx-auto mb-1.5" />
        <p className="text-[12px] text-white/75">
          Drop a CSV or TSV of opportunities,
          {' '}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-violet-300 hover:text-violet-200 underline-offset-2 hover:underline"
          >
            pick a file
          </button>
          ,{' '}or{' '}
          <button
            type="button"
            onClick={() => setPasteOpen(o => !o)}
            className="text-violet-300 hover:text-violet-200 underline-offset-2 hover:underline inline-flex items-center gap-1"
          >
            <Clipboard size={11} /> paste rows
          </button>
        </p>
        <p className="text-[10px] text-white/35 mt-1">
          Columns: title | type | event_url | cfp_url | deadline
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.txt"
          multiple
          onChange={handleFilePick}
          className="hidden"
        />
      </div>

      {pasteOpen && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2">
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            rows={5}
            placeholder={`SXSW\tconference\thttps://sxsw.com\nWeb Summit\tconference\thttps://websummit.com`}
            className="w-full bg-black/30 border border-white/[0.08] rounded-md p-2 text-[12px] text-white/85 font-mono resize-y focus:border-violet-400/50 outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePasteSubmit}
              disabled={!pasteText.trim()}
              className="px-3 py-1.5 rounded-md bg-violet-500/20 border border-violet-400/40 text-violet-100 text-[12px] disabled:opacity-50"
            >
              Import
            </button>
            <button
              type="button"
              onClick={() => { setPasteText(''); setPasteOpen(false) }}
              className="text-[12px] text-white/55 hover:text-white/85"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map(f => (
            <li
              key={f.id}
              className="flex items-center gap-2 text-[11px] px-2 py-1 rounded bg-white/[0.02] border border-white/[0.04]"
            >
              <FileText size={11} className="text-white/40" />
              <span className="flex-1 truncate text-white/75">{f.name}</span>
              {f.count != null && <span className="text-white/40 tabular-nums">{f.count} rows</span>}
              {f.state === 'sending' && <Working size={11} className="text-accent" />}
              {f.state === 'done' && <CheckCircle2 size={11} className="text-emerald-300" />}
              {f.state === 'error' && (
                <span title={f.message} className="inline-flex items-center gap-1 text-rose-300">
                  <AlertCircle size={11} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function parseRows(text: string): ImportRow[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const out: ImportRow[] = []
  for (const line of lines) {
    if (/^\s*title\b/i.test(line)) continue
    const cols = line.includes('\t') ? line.split('\t') : line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    const clean = cols.map(c => c.trim().replace(/^"|"$/g, ''))
    if (clean.length === 0 || !clean[0]) continue
    out.push({
      title: clean[0],
      type: clean[1] as VisibilityTargetType | undefined,
      event_url: clean[2] || undefined,
      cfp_url: clean[3] || undefined,
      deadline_at: parseDate(clean[4]),
      location: clean[5] || undefined,
      format: clean[6] || undefined,
    })
  }
  return out
}

function parseDate(raw?: string): string | undefined {
  if (!raw) return undefined
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
