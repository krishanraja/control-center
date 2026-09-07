import { CHANNEL_ADAPTS, VIDEO_FORMATS } from './contentEngine'

export type ContentOutputFamily = 'article' | 'social' | 'audio' | 'video_script' | 'carousel'

export interface ContentOutputDefinition {
  key: string
  label: string
  family: ContentOutputFamily
  engine: 'channel_cut' | 'video_script' | 'studio'
}

const FAMILY_BY_CHANNEL: Record<string, ContentOutputFamily> = {
  substack: 'article',
  linkedin: 'social',
  instagram: 'social',
  youtube: 'video_script',
  podcast: 'audio',
  signal_noise: 'audio',
}

/**
 * The one output registry for an approved Content story.
 *
 * It does not ideate. It tells the existing Content spine which non-destructive
 * adaptations can be made from the approved story and which engine owns each
 * artifact. Studio entries become actionable only through ProductionBriefV1.
 */
export const CONTENT_OUTPUTS: ReadonlyArray<ContentOutputDefinition> = Object.freeze([
  ...CHANNEL_ADAPTS.map(output => ({
    key: output.value,
    label: output.label,
    family: FAMILY_BY_CHANNEL[output.value] || 'social',
    engine: 'channel_cut' as const,
  })),
  ...VIDEO_FORMATS.map(output => ({
    key: `video_${output.id}`,
    label: output.label,
    family: 'video_script' as const,
    engine: 'video_script' as const,
  })),
  { key: 'carousel_linkedin', label: 'LinkedIn carousel', family: 'carousel', engine: 'studio' },
  { key: 'carousel_instagram', label: 'Instagram carousel', family: 'carousel', engine: 'studio' },
])

const OUTPUT_BY_KEY = new Map(CONTENT_OUTPUTS.map(output => [output.key, output]))

export function contentOutputDefinition(key: string): ContentOutputDefinition | null {
  return OUTPUT_BY_KEY.get(key) || null
}

export function readableOutputBody(artifact: unknown): string | null {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return null
  const value = artifact as Record<string, unknown>
  if (typeof value.body === 'string' && value.body.trim()) return value.body
  if (typeof value.script === 'string' && value.script.trim()) return value.script
  return null
}

export function storedContentOutputs(outputs: unknown) {
  if (!outputs || typeof outputs !== 'object' || Array.isArray(outputs)) return []
  const source = outputs as Record<string, unknown>
  return CONTENT_OUTPUTS.flatMap(definition => {
    const artifact = source[definition.key]
    const body = readableOutputBody(artifact)
    return body ? [{ definition, artifact: artifact as Record<string, unknown>, body }] : []
  })
}
