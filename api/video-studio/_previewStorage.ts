import { supabase } from '../_supabase.js'
import {
  VIDEO_STUDIO_PREVIEW_CONTENT_TYPE,
  VIDEO_STUDIO_PREVIEW_MAX_BYTES,
} from './_runnerContracts.js'

export type PreviewStoreError =
  | 'preview_store_unconfigured'
  | 'preview_store_misconfigured'
  | 'preview_store_unavailable'

export interface PreviewStoreConfig {
  bucket: string
  supabaseOrigin: string
}

export async function configuredPreviewStore(): Promise<{
  config: PreviewStoreConfig | null
  error: PreviewStoreError | null
}> {
  const bucket = process.env.VIDEO_STUDIO_PREVIEW_BUCKET || ''
  const supabaseUrl = process.env.SUPABASE_URL || ''
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(bucket)) {
    return { config: null, error: 'preview_store_unconfigured' }
  }

  let supabaseOrigin = ''
  try {
    supabaseOrigin = new URL(supabaseUrl).origin
  } catch {
    return { config: null, error: 'preview_store_unconfigured' }
  }

  const result = await supabase.storage.getBucket(bucket)
  if (result.error || !result.data) return { config: null, error: 'preview_store_unavailable' }
  const allowedMimeTypes = result.data.allowed_mime_types || []
  const sizeLimit = result.data.file_size_limit
  if (
    result.data.public
    || allowedMimeTypes.length !== 1
    || allowedMimeTypes[0] !== VIDEO_STUDIO_PREVIEW_CONTENT_TYPE
    || !Number.isSafeInteger(sizeLimit)
    || Number(sizeLimit) !== VIDEO_STUDIO_PREVIEW_MAX_BYTES
  ) {
    return { config: null, error: 'preview_store_misconfigured' }
  }
  return { config: { bucket, supabaseOrigin }, error: null }
}

export function isSignedPreviewUrlAllowed(url: string, expectedOrigin: string): boolean {
  try {
    return new URL(url).origin === expectedOrigin
  } catch {
    return false
  }
}

export function normalizedStorageMd5Etag(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const unquoted = trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed
  return /^[a-f0-9]{32}$/i.test(unquoted) ? unquoted.toLowerCase() : null
}

export async function verifyStoredPreview(
  bucket: string,
  objectKey: string,
  byteSize: number,
  expectedMd5: string,
): Promise<'verified' | 'missing' | 'mismatch' | 'integrity_unavailable' | 'unavailable'> {
  const result = await supabase.storage.from(bucket).info(objectKey)
  if (result.error || !result.data) {
    const status = Number(result.error && 'status' in result.error ? result.error.status : 0)
    return status === 400 || status === 404 ? 'missing' : 'unavailable'
  }
  const info = result.data as typeof result.data & { etag?: unknown }
  const storedSize = info.size ?? info.metadata?.size
  const storedType = info.contentType ?? info.metadata?.mimetype
  const storedMd5 = normalizedStorageMd5Etag(info.etag)
  if (!storedMd5) return 'integrity_unavailable'
  return storedSize === byteSize
    && storedType === VIDEO_STUDIO_PREVIEW_CONTENT_TYPE
    && storedMd5 === expectedMd5
    ? 'verified'
    : 'mismatch'
}
