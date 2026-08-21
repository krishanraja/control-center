import React from 'react'
import { PRODUCT_LABEL, PRODUCT_TONE, type ProductSlug } from '../../lib/growth'

/**
 * The small shared parts of the Growth tab. Kept in one file so the four
 * sections read as one instrument: same chip, same control sizing, same
 * honest-empty-state voice.
 */

export const INPUT_CLS =
  'w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-label text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-violet-400/50'

export const SELECT_CLS =
  'rounded-lg border bg-white/[0.03] px-2 py-1 text-label focus:outline-none focus:ring-1 focus:ring-violet-400/50 cursor-pointer'

export const BTN_GHOST =
  'rounded-lg px-2.5 py-1 text-label font-medium text-white/60 border border-white/10 hover:bg-white/[0.06] hover:text-white/85 transition-colors'

export const BTN_PRIMARY =
  'btn-contrast rounded-lg px-3 py-1.5 text-label font-semibold disabled:opacity-40'

export function ProductChip({ slug }: { slug: ProductSlug }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-micro font-semibold whitespace-nowrap ${PRODUCT_TONE[slug] || 'text-white/60 border-white/10'}`}>
      {PRODUCT_LABEL[slug] || slug}
    </span>
  )
}

export function Chip({ children, tone = 'text-white/60 border-white/10' }: { children: React.ReactNode; tone?: string }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-micro font-medium whitespace-nowrap ${tone}`}>
      {children}
    </span>
  )
}

/** Section title plus the one line that says what this surface is for. */
export function SectionHead({ title, sub, action }: { title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <h2 className="text-ui font-semibold text-white tracking-tight">{title}</h2>
        <p className="text-label text-white/45 mt-0.5 leading-snug">{sub}</p>
      </div>
      {action ? <div className="flex-shrink-0">{action}</div> : null}
    </div>
  )
}

/**
 * Honest empty state. No fake rows, no sample data: it says what is missing,
 * who writes it, and what will make it appear.
 */
export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-5 text-label text-white/50 leading-relaxed max-w-2xl">
      {children}
    </div>
  )
}

/** A labelled form field for the two add-forms. */
export function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="block text-micro uppercase tracking-[0.14em] text-white/40 font-semibold mb-1">{label}</span>
      {children}
    </label>
  )
}
