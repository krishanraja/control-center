import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Tailwind class composer. Vendored from Relume, and the first one this repo has
// had: until now every component built its className with template literals and
// array-joins, so a caller could never reliably override a base class (the last
// conflicting utility in the string won, not the one the caller passed).
// twMerge resolves those conflicts by utility group, which is what makes the
// `className` prop on the ui/ primitives actually mean something.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
