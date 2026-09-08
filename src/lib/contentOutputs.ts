import { CHANNEL_ADAPTS, VIDEO_FORMATS } from './contentEngine'

export type ContentOutputFamily = 'article' | 'social' | 'audio' | 'video_script' | 'video' | 'carousel'

export type StudioSeries = 'money_of_ai' | 'built_with_ai'
export type StudioEditorialFormat = 'money_trace' | 'artifact' | 'verdict' | 'cold_open_cutdown' | 'builder_conversation' | 'build_itself' | 'third_why' | 'first_version'
export const STUDIO_FORMATS_BY_SERIES: Record<StudioSeries, ReadonlyArray<{ value: StudioEditorialFormat; label: string }>> = {
  money_of_ai: [
    { value: 'money_trace', label: 'Money Trace' },
    { value: 'artifact', label: 'The Artifact' },
    { value: 'verdict', label: 'Verdict' },
    { value: 'cold_open_cutdown', label: 'Cold-open cutdown' },
  ],
  built_with_ai: [
    { value: 'builder_conversation', label: 'Builder conversation' },
    { value: 'build_itself', label: 'The Build Itself' },
    { value: 'third_why', label: 'The Third Why' },
    { value: 'first_version', label: 'First Version' },
  ],
}

export function studioFormatLabel(format: StudioEditorialFormat): string {
  return Object.values(STUDIO_FORMATS_BY_SERIES).flat().find(option => option.value === format)?.label || format.replace(/_/g, ' ')
}

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
  { key: 'studio_video', label: 'Video production', family: 'video', engine: 'studio' },
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

export interface StoredProductionBrief {
  brief_id: string
  content_revision_hash: string
  production_kinds: Array<'video' | 'carousel'>
  source_mode: 'extract' | 'solo' | 'short_native' | 'written'
  editorial_format: StudioEditorialFormat | null
  created_at: string | null
  status: string
  /** The Studio job the runner created from this brief, once it has. */
  job_id: string | null
  /** The runner's safe failure code, when the claim did not end in a job. */
  safe_code: string | null
}

/** What the runner has done with a brief, in words. Statuses come from
 *  api/video-studio/_productionBriefQueue.ts. */
export function productionBriefStatusLabel(status: string): string {
  switch (status) {
    case 'ready_for_studio': return 'Waiting for the studio computer to claim it'
    case 'leased': return 'Claimed by the studio computer'
    case 'imported': return 'Imported into the studio'
    case 'awaiting_source_bundle': return 'Imported. Needs a recording before a job can start'
    case 'failed': return 'The studio computer could not import it'
    default: return status.replace(/_/g, ' ')
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function hasExactProductionApproval(meta: unknown): boolean {
  const approval = record(record(meta)?.production_approval)
  return approval?.schema_version === 1
    && approval.approved_by === 'Krish'
    && typeof approval.approved_at === 'string'
    && typeof approval.content_revision_hash === 'string'
    && /^[a-f0-9]{64}$/.test(approval.content_revision_hash)
}

export function storedProductionBriefs(outputs: unknown): StoredProductionBrief[] {
  const productionBriefs = record(record(outputs)?.production_briefs)
  if (!productionBriefs) return []
  return Object.values(productionBriefs).flatMap((entry) => {
    const wrapper = record(entry)
    const brief = record(wrapper?.brief)
    const kinds = Array.isArray(brief?.production_kinds)
      ? brief.production_kinds.filter((kind): kind is 'video' | 'carousel' => kind === 'video' || kind === 'carousel')
      : []
    const sourceMode = brief?.source_mode
    const editorialFormat = brief?.editorial_format
    if (typeof brief?.brief_id !== 'string'
      || typeof brief.content_revision_hash !== 'string'
      || !kinds.length
      || !['extract', 'solo', 'short_native', 'written'].includes(String(sourceMode))
      || (editorialFormat !== undefined && !Object.values(STUDIO_FORMATS_BY_SERIES).flat().some(option => option.value === editorialFormat))) return []
    return [{
      brief_id: brief.brief_id,
      content_revision_hash: brief.content_revision_hash,
      production_kinds: kinds,
      source_mode: sourceMode as StoredProductionBrief['source_mode'],
      editorial_format: typeof editorialFormat === 'string' ? editorialFormat as StudioEditorialFormat : null,
      created_at: typeof wrapper?.created_at === 'string' ? wrapper.created_at : null,
      status: typeof wrapper?.status === 'string' ? wrapper.status : 'ready_for_studio',
      job_id: typeof wrapper?.job_id === 'string' ? wrapper.job_id : null,
      safe_code: typeof wrapper?.safe_code === 'string' ? wrapper.safe_code : null,
    }]
  }).sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
}
