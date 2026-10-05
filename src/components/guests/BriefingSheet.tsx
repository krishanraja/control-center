import React from 'react'
import { SlideOver } from '../shared/SlideOver'

// The speaker briefing, read in Control Center.
//
// Ruling (Krish, 2026-10-05): agents report to Control Center and never write
// a Google Doc into his Drive. The briefing used to be a Doc the card linked
// out to; it is now `guests.briefing_md` and it opens here, beside the guest.
//
// The renderer is deliberately small. The briefing comes from one prompt in
// `api/guests/[id]/briefing.ts` with six fixed sections, so the shapes that
// can appear are known: `## heading`, `**bold**`, `- bullet`, `1. numbered`,
// and paragraphs. A full markdown library would be a dependency carried for
// one panel, and would render shapes this document never contains.

interface Props {
  open: boolean
  onClose: () => void
  name: string
  markdown: string
}

// **bold** inside a line. Nothing else is inline-formatted in this document.
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={`${keyPrefix}-${i}`} className="font-semibold text-ink">{part.slice(2, -2)}</strong>
      : <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>,
  )
}

export function renderBriefing(markdown: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  // A list is collected across lines so it renders as one <ul>/<ol> rather
  // than a paragraph per item.
  let list: { ordered: boolean; items: string[] } | null = null

  const flush = (key: string) => {
    if (!list) return
    const { ordered, items } = list
    const cls = 'space-y-1.5 pl-5 text-label text-ink-muted leading-relaxed'
    out.push(
      ordered
        ? <ol key={key} className={`list-decimal ${cls}`}>{items.map((t, i) => <li key={i}>{inline(t, `${key}-${i}`)}</li>)}</ol>
        : <ul key={key} className={`list-disc ${cls}`}>{items.map((t, i) => <li key={i}>{inline(t, `${key}-${i}`)}</li>)}</ul>,
    )
    list = null
  }

  markdown.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd()
    const key = `b-${i}`

    if (!line.trim()) { flush(`${key}-l`); return }

    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) {
      flush(`${key}-l`)
      out.push(
        <h3 key={key} className="text-micro uppercase tracking-[0.14em] text-violet-300/85 pt-3 first:pt-0">
          {heading[1].replace(/\*\*/g, '')}
        </h3>,
      )
      return
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      if (!list || list.ordered) { flush(`${key}-l`); list = { ordered: false, items: [] } }
      list.items.push(bullet[1])
      return
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)
    if (numbered) {
      if (!list || !list.ordered) { flush(`${key}-l`); list = { ordered: true, items: [] } }
      list.items.push(numbered[1])
      return
    }

    flush(`${key}-l`)
    out.push(
      <p key={key} className="text-label text-ink-muted leading-relaxed">{inline(line, key)}</p>,
    )
  })

  flush('b-tail')
  return out
}

export function BriefingSheet({ open, onClose, name, markdown }: Props) {
  return (
    <SlideOver open={open} onClose={onClose} ariaLabel={`Speaker briefing for ${name}`} label="Speaker briefing">
      <div className="space-y-2.5">
        <p className="text-body font-semibold text-ink">{name}</p>
        {markdown.trim()
          ? renderBriefing(markdown)
          : <p className="text-label text-ink-faint">This briefing is empty. Press Regenerate on the card.</p>}
      </div>
    </SlideOver>
  )
}
