import React, { useCallback, useRef, useState } from 'react'
import { UploadCloud, FileText, CheckCircle2 } from '@/lib/icons'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import type { ConsentTier } from '../hooks/useRealtimeContacts'

interface Props {
  onIngested?: (result: { inserted: number; duplicates: number }) => void
}

interface PendingFile {
  id: string
  name: string
  state: 'sending' | 'done' | 'error'
  message?: string
}

import { VENTURE_OPTIONS } from '../lib/ventureOptions'
import { Working } from './shared/Working'

const TIER_OPTIONS: Array<{ value: ConsentTier; label: string; hint: string }> = [
  { value: 'permissioned', label: 'Permissioned', hint: 'Owned list — e.g. Substack subscribers' },
  { value: 'warm', label: 'Warm', hint: 'Known to us / replied / met' },
  { value: 'customer', label: 'Customer', hint: 'Paying or past customer' },
  { value: 'cold_engaged', label: 'Cold · engaged', hint: 'Engaged but no consent' },
  { value: 'cold_scraped', label: 'Cold · scraped', hint: 'Scraped, no relationship' },
]

/**
 * Relationship Engine import surface.
 *
 * Mirrors LeadImportDropzone but front-loads PROVENANCE capture: every import
 * must declare which venture + campaign it came from and the consent tier,
 * because that's how the engine knows how it's allowed to speak to these
 * people. Drag-drop a CSV (or paste a Drive URL), pick provenance, submit to
 * `/api/contacts/import` which dedupes by email/linkedin and inserts only new.
 */
export function ContactImportDropzone({ onIngested }: Props) {
  const { toast } = useToast()
  const h = useHaptics()
  const [hover, setHover] = useState(false)
  const [files, setFiles] = useState<PendingFile[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Provenance form state — required before any import is allowed.
  const [originVenture, setOriginVenture] = useState<string>('mindmaker')
  const [originCampaign, setOriginCampaign] = useState<string>('')
  const [consentTier, setConsentTier] = useState<ConsentTier>('permissioned')

  const provenanceReady = !!originVenture && originCampaign.trim().length > 0

  const send = useCallback(
    async (sourceName: string, payload: Record<string, unknown>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setFiles(prev => [...prev, { id, name: sourceName, state: 'sending' }])
      try {
        const r = await fetch('/api/contacts/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_document_name: sourceName,
            origin_venture: originVenture,
            origin_campaign: originCampaign.trim(),
            consent_tier: consentTier,
            ...payload,
          }),
        })
        const data = await r.json().catch(() => ({}))
        if (!r.ok || data?.ok === false) {
          throw new Error(data?.error || `HTTP ${r.status}`)
        }
        const inserted = Number(data.inserted ?? 0)
        const duplicates = Number(data.duplicates ?? 0)
        setFiles(prev => prev.map(f =>
          f.id === id
            ? { ...f, state: 'done', message: `${inserted} new · ${duplicates} dup` }
            : f,
        ))
        onIngested?.({ inserted, duplicates })
        h.success()
        toast(`${inserted} new added, ${duplicates} duplicates skipped.`, 'success')
      } catch (e: any) {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, state: 'error', message: String(e?.message || e) } : f))
        h.error()
        toast(`Import failed — ${e?.message || 'try again'}`, 'error')
      }
    },
    [onIngested, toast, h, originVenture, originCampaign, consentTier],
  )

  const guardProvenance = (): boolean => {
    if (provenanceReady) return true
    toast('Set the origin venture + campaign before importing.', 'error')
    return false
  }

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setHover(false)
    if (!provenanceReady) {
      toast('Set the origin venture + campaign before importing.', 'error')
      return
    }
    h.heavy()
    const dropped = Array.from(e.dataTransfer.files || [])
    for (const file of dropped) {
      const text = await readAsText(file)
      send(file.name, { raw_text: text })
    }
  }, [send, h, provenanceReady, toast])

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!guardProvenance()) { if (fileInputRef.current) fileInputRef.current.value = ''; return }
    const picked = Array.from(e.target.files || [])
    for (const file of picked) {
      const text = await readAsText(file)
      send(file.name, { raw_text: text })
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const openDrivePicker = () => {
    if (!guardProvenance()) return
    const url = window.prompt('Paste a Google Drive file URL:')
    if (!url) return
    const name = url.split('/').pop() || 'Drive document'
    send(name, { drive_url: url })
  }

  return (
    <div className="space-y-3">
      {/* Provenance capture — the whole point. */}
      <div className="rounded-xl border border-violet-400/25 bg-violet-500/[0.04] p-3 space-y-2.5">
        <p className="text-micro font-semibold uppercase tracking-[0.14em] text-violet-200/80">
          Where did these come from?
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-micro text-white/45">Origin venture</span>
            <select
              value={originVenture}
              onChange={(e) => setOriginVenture(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/10 bg-base px-2 py-1.5 text-label text-white/85 focus:border-violet-400/50 focus:outline-none"
            >
              {VENTURE_OPTIONS.map(v => (
                <option key={v.slug} value={v.slug}>{v.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-micro text-white/45">Consent tier</span>
            <select
              value={consentTier}
              onChange={(e) => setConsentTier(e.target.value as ConsentTier)}
              className="mt-1 w-full rounded-md border border-white/10 bg-base px-2 py-1.5 text-label text-white/85 focus:border-violet-400/50 focus:outline-none"
            >
              {TIER_OPTIONS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-micro text-white/45">Origin campaign / list name</span>
          <input
            type="text"
            value={originCampaign}
            onChange={(e) => setOriginCampaign(e.target.value)}
            placeholder="e.g. Substack subscribers"
            className="mt-1 w-full rounded-md border border-white/10 bg-base px-2 py-1.5 text-label text-white/85 placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none"
          />
        </label>
        <p className="text-micro text-white/40">
          {TIER_OPTIONS.find(t => t.value === consentTier)?.hint}
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setHover(true) }}
        onDragLeave={() => setHover(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed transition-colors px-4 py-5 text-center
          ${hover
            ? 'border-emerald-500/40 bg-emerald-500/[0.04]'
            : 'border-white/10 bg-white/[0.015] hover:border-white/20'}
          ${provenanceReady ? '' : 'opacity-60'}`}
      >
        <UploadCloud size={20} className="mx-auto text-white/40" />
        <p className="text-label text-white/75 mt-2 font-medium">
          Drop a contact CSV here
        </p>
        <p className="text-micro text-white/45 mt-0.5">
          Maps name / email / linkedin / company / title. Dedupes by email + LinkedIn; only new rows are added.
        </p>
        <div className="flex items-center justify-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => { if (guardProvenance()) fileInputRef.current?.click() }}
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
            accept=".csv,.txt,.tsv"
          />
        </div>
        {!provenanceReady && (
          <p className="text-micro text-amber-300/80 mt-2">
            Set venture + campaign above to enable import.
          </p>
        )}
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
                  {f.message}
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
