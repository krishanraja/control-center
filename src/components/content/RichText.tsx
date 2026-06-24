import React from 'react'

// RichText — tiny dependency-free markdown renderer for draft prose. Handles
// the structures Cleo and Krish actually write: #/##/### headings, paragraphs,
// bullet / numbered lists, > quotes, --- rules, **bold**, *italic*, `code`.
// Heading sizes are em-based so the wrapper sets the base type scale.

function inline(s: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*\n]*\*|`[^`]+`)/g
  let last = 0
  let k = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    const t = m[0]
    if (t.startsWith('**')) {
      out.push(<strong key={`${keyBase}-${k++}`} className="font-semibold text-white">{t.slice(2, -2)}</strong>)
    } else if (t.startsWith('`')) {
      out.push(<code key={`${keyBase}-${k++}`} className="px-1 py-0.5 rounded bg-white/[0.08] text-[0.9em] text-violet-200">{t.slice(1, -1)}</code>)
    } else {
      out.push(<em key={`${keyBase}-${k++}`}>{t.slice(1, -1)}</em>)
    }
    last = m.index + t.length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

const STRUCTURAL = [/^#{1,3}\s+/, /^>\s?/, /^[-*]\s+/, /^\d+[.)]\s+/, /^(-{3,}|\*{3,}|_{3,})$/]

export type BlockKind = 'h' | 'p' | 'ul' | 'ol' | 'quote' | 'hr'

export interface Block {
  /** The EXACT source slice for this block — guaranteed `text.includes(raw)`.
   *  This is what powers selection-scoped revises (no rendered/source mismatch). */
  raw: string
  kind: BlockKind
  node: React.ReactElement
}

/**
 * Parse markdown into blocks, each carrying its exact source slice (`raw`) next
 * to its rendered node. The `raw` is reconstructed from the ORIGINAL (untrimmed)
 * lines, so it is always an exact substring of `text` — the property that lets a
 * tapped block be rewritten in place by /revise without the old `includes()`
 * fragility.
 */
export function splitBlocks(text: string): Block[] {
  const lines = text.split('\n')
  const blocks: Block[] = []
  let i = 0
  let key = 0
  const push = (start: number, kind: BlockKind, node: React.ReactElement) =>
    blocks.push({ raw: lines.slice(start, i).join('\n'), kind, node })

  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (!trimmed) { i++; continue }
    const start = i

    const h = /^(#{1,3})\s+(.*)/.exec(trimmed)
    if (h) {
      const lvl = h[1].length
      const cls = lvl === 1
        ? 'text-[1.45em] font-bold text-white mt-7 mb-3 leading-snug first:mt-0'
        : lvl === 2
          ? 'text-[1.25em] font-semibold text-white mt-6 mb-2.5 leading-snug first:mt-0'
          : 'text-[1.1em] font-semibold text-white/95 mt-5 mb-2 leading-snug first:mt-0'
      const node = React.createElement(`h${lvl}`, { key: key++, className: cls }, inline(h[2], `h${key}`))
      i++
      push(start, 'h', node as React.ReactElement)
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      const node = <hr key={key++} className="my-6 border-white/[0.08]" />
      i++
      push(start, 'hr', node)
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      push(start, 'quote', (
        <blockquote key={key++} className="border-l-2 border-violet-400/50 pl-4 my-4 text-white/65 italic">
          {inline(quote.join(' '), `q${key}`)}
        </blockquote>
      ))
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''))
        i++
      }
      push(start, 'ul', (
        <ul key={key++} className="list-disc pl-5 my-4 space-y-1.5 marker:text-white/35">
          {items.map((it, j) => <li key={j}>{inline(it, `u${key}-${j}`)}</li>)}
        </ul>
      ))
      continue
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''))
        i++
      }
      push(start, 'ol', (
        <ol key={key++} className="list-decimal pl-5 my-4 space-y-1.5 marker:text-white/35">
          {items.map((it, j) => <li key={j}>{inline(it, `o${key}-${j}`)}</li>)}
        </ol>
      ))
      continue
    }

    // Paragraph: consume until a blank line or a structural line.
    const para: string[] = []
    while (i < lines.length) {
      const t = lines[i].trim()
      if (!t || STRUCTURAL.some(re => re.test(t))) break
      para.push(t)
      i++
    }
    push(start, 'p', (
      <p key={key++} className="my-4 first:mt-0 last:mb-0">
        {para.map((p, j) => <React.Fragment key={j}>{j > 0 && <br />}{inline(p, `p${key}-${j}`)}</React.Fragment>)}
      </p>
    ))
  }
  return blocks
}

export function RichText({ text, className = '' }: { text: string; className?: string }) {
  return <div className={className}>{splitBlocks(text).map(b => b.node)}</div>
}

/**
 * SelectableDraft — RichText where every block is a tap target. Tapping a block
 * selects it (sets `selectedRaw` to that block's exact source slice); tapping the
 * selected block again clears it. A drag to select a phrase (desktop) is left
 * alone so native sub-paragraph selection still works. Visually identical to
 * RichText apart from the hover/selected affordance, since it renders the same
 * block nodes (cloned, so heading/paragraph first:/last: spacing is preserved).
 */
export function SelectableDraft({ text, className = '', selectedRaw, onSelectBlock }: {
  text: string
  className?: string
  selectedRaw: string
  onSelectBlock: (raw: string) => void
}) {
  const blocks = splitBlocks(text)
  return (
    <div className={className}>
      {blocks.map((b, idx) => {
        if (b.kind === 'hr') return React.cloneElement(b.node, { key: idx })
        const selected = !!selectedRaw && b.raw === selectedRaw
        const base = (b.node.props as { className?: string }).className || ''
        const tap = selected
          ? 'rounded-lg px-2 -mx-2 cursor-pointer bg-violet-500/[0.10] ring-1 ring-violet-400/40'
          : 'rounded-lg px-2 -mx-2 cursor-pointer hover:bg-white/[0.04] transition-colors'
        return React.cloneElement(b.node, {
          key: idx,
          className: `${base} ${tap}`,
          role: 'button',
          tabIndex: 0,
          'aria-pressed': selected,
          onClick: () => {
            // Leave a real drag-selection (a phrase) to the native path.
            if (typeof window !== 'undefined' && (window.getSelection()?.toString() || '').trim()) return
            onSelectBlock(selected ? '' : b.raw)
          },
        } as React.HTMLAttributes<HTMLElement> & { key: number })
      })}
    </div>
  )
}
