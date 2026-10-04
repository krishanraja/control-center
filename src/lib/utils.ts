import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The role sizes (tailwind.config fontSize) are custom names, so stock
// twMerge cannot tell `text-body` is a size: it filed it with the colours and
// dropped it whenever `text-ink-muted` sat beside it. That is why unselected
// SegmentedNav pills rendered at the browser's 16px while the selected one was
// 13px, on every tab that used the nav (audit 2026-10-04). Registering the
// sizes puts them in the font-size group, so a colour no longer cancels them.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['micro', 'label', 'body', 'ui', 'lede', 'title', 'heading', 'display', 'hero'] }],
    },
  },
})

// Tailwind class composer. Vendored from Relume, and the first one this repo has
// had: until now every component built its className with template literals and
// array-joins, so a caller could never reliably override a base class (the last
// conflicting utility in the string won, not the one the caller passed).
// twMerge resolves those conflicts by utility group, which is what makes the
// `className` prop on the ui/ primitives actually mean something.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
