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

export function RichText({ text, className = '' }: { text: string; className?: string }) {
  const lines = text.split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  let key = 0
  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (!trimmed) { i++; continue }

    const h = /^(#{1,3})\s+(.*)/.exec(trimmed)
    if (h) {
      const lvl = h[1].length
      const cls = lvl === 1
        ? 'text-[1.45em] font-bold text-white mt-7 mb-3 leading-snug first:mt-0'
        : lvl === 2
          ? 'text-[1.25em] font-semibold text-white mt-6 mb-2.5 leading-snug first:mt-0'
          : 'text-[1.1em] font-semibold text-white/95 mt-5 mb-2 leading-snug first:mt-0'
      blocks.push(React.createElement(`h${lvl}`, { key: key++, className: cls }, inline(h[2], `h${key}`)))
      i++; continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<hr key={key++} className="my-6 border-white/[0.08]" />)
      i++; continue
    }

    if (/^>\s?/.test(trimmed)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      blocks.push(
        <blockquote key={key++} className="border-l-2 border-violet-400/50 pl-4 my-4 text-white/65 italic">
          {inline(quote.join(' '), `q${key}`)}
        </blockquote>
      )
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={key++} className="list-disc pl-5 my-4 space-y-1.5 marker:text-white/35">
          {items.map((it, j) => <li key={j}>{inline(it, `u${key}-${j}`)}</li>)}
        </ul>
      )
      continue
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''))
        i++
      }
      blocks.push(
        <ol key={key++} className="list-decimal pl-5 my-4 space-y-1.5 marker:text-white/35">
          {items.map((it, j) => <li key={j}>{inline(it, `o${key}-${j}`)}</li>)}
        </ol>
      )
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
    blocks.push(
      <p key={key++} className="my-4 first:mt-0 last:mb-0">
        {para.map((p, j) => <React.Fragment key={j}>{j > 0 && <br />}{inline(p, `p${key}-${j}`)}</React.Fragment>)}
      </p>
    )
  }
  return <div className={className}>{blocks}</div>
}
