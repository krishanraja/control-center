import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const roots = [
  'src/components/content',
  'src/components/content-v2',
  'src/components/video-studio',
]

const files = roots.flatMap((root) => {
  const visit = (directory: string): string[] => readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? visit(path) : /\.tsx?$/.test(path) ? [path] : []
  })
  return visit(root)
})

const forbidden = [
  { pattern: /(?:^|[\s'"`])truncate(?:[\s'"`]|$)/m, label: 'Tailwind truncate' },
  { pattern: /line-clamp-(?:\d+|\[[^\]]+\])/, label: 'line clamp' },
  { pattern: /text-overflow\s*:/, label: 'CSS text overflow' },
  { pattern: /textOverflow\s*:/, label: 'inline text overflow' },
]

const failures: string[] = []
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) failures.push(`${file}: ${rule.label}`)
  }
}

if (failures.length) {
  console.error('Editorial text integrity failed. Full user-facing text must wrap or move behind a deliberate disclosure.')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Editorial text integrity: ${files.length} Content and Studio component files contain no truncation or line clamps.`)
