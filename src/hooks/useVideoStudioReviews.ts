import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getVideoStudioActiveJob,
  getVideoStudioCommand,
  getVideoStudioRecoveryCommand,
  getVideoStudioReview,
  listVideoStudioReviews,
  VideoStudioApiError,
  type VideoStudioActiveJob,
  type VideoStudioCommandReadback,
  type VideoStudioPlatform,
  type VideoStudioReview,
  type VideoStudioReviewListItem,
} from '../lib/videoStudio'

const QUEUE_REFRESH_MS = 30_000
const ACTIVE_REVIEW_REFRESH_MS = 8_000
const COMMAND_REFRESH_MS = 4_000

export function useVideoStudioReviews(enabled = true) {
  const [reviews, setReviews] = useState<VideoStudioReviewListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const alive = useRef(true)
  const generation = useRef(0)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const requestGeneration = ++generation.current
    try {
      const next = await listVideoStudioReviews(signal)
      if (!alive.current || requestGeneration !== generation.current) return
      setReviews(next)
      setError(null)
    } catch (cause) {
      if (!alive.current || signal?.aborted || requestGeneration !== generation.current) return
      setError(cause instanceof Error ? cause : new Error('video_review_queue_failed'))
    } finally {
      if (alive.current && !signal?.aborted && requestGeneration === generation.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) { setLoading(false); return }
    alive.current = true
    const controller = new AbortController()
    void refresh(controller.signal)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, QUEUE_REFRESH_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive.current = false
      generation.current += 1
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, refresh])

  return { reviews, loading, error, refresh }
}

export function useVideoStudioReview(id: string, keepPolling = false) {
  const [review, setReview] = useState<VideoStudioReview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const alive = useRef(true)
  const generation = useRef(0)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const requestGeneration = ++generation.current
    try {
      const next = await getVideoStudioReview(id, signal)
      if (!alive.current || requestGeneration !== generation.current) return false
      setReview(next)
      setError(null)
      return true
    } catch (cause) {
      if (!alive.current || signal?.aborted || requestGeneration !== generation.current) return false
      if (cause instanceof VideoStudioApiError && cause.code === 'malformed_response') setReview(null)
      setError(cause instanceof Error ? cause : new Error('video_review_failed'))
      return false
    } finally {
      if (alive.current && !signal?.aborted && requestGeneration === generation.current) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    alive.current = true
    setLoading(true)
    setReview(null)
    setError(null)
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => {
      alive.current = false
      generation.current += 1
      controller.abort()
    }
  }, [refresh])

  const active = keepPolling || Boolean(review
    && (review.preview.state === 'processing'
      || review.runner_state === 'queued'
      || review.runner_state === 'working'
      || review.prepare_command?.status === 'queued'
      || review.prepare_command?.status === 'leased'
      || review.decision_command?.status === 'queued'
      || review.decision_command?.status === 'leased'
      || review.recovery.binding_command?.status === 'queued'
      || review.recovery.binding_command?.status === 'leased'))

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, ACTIVE_REVIEW_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [active, refresh])

  return { review, loading, error, refresh, setReview }
}

export function useVideoStudioActiveJob(
  jobId: string | null,
  platform: VideoStudioPlatform | null,
  enabled: boolean,
) {
  const [job, setJob] = useState<VideoStudioActiveJob | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)
  const alive = useRef(true)
  const generation = useRef(0)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!jobId || !platform || !enabled) return false
    const requestGeneration = ++generation.current
    try {
      const next = await getVideoStudioActiveJob(jobId, platform, signal)
      if (!alive.current || requestGeneration !== generation.current) return false
      setJob(next)
      setError(null)
      return true
    } catch (cause) {
      if (!alive.current || signal?.aborted || requestGeneration !== generation.current) return false
      setError(cause instanceof Error ? cause : new Error('video_active_job_failed'))
      return false
    } finally {
      if (alive.current && !signal?.aborted && requestGeneration === generation.current) setLoading(false)
    }
  }, [enabled, jobId, platform])

  useEffect(() => {
    if (!enabled || !jobId || !platform) {
      setJob(null)
      setError(null)
      setLoading(false)
      return
    }
    alive.current = true
    setLoading(true)
    const controller = new AbortController()
    void refresh(controller.signal)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, ACTIVE_REVIEW_REFRESH_MS)
    return () => {
      alive.current = false
      generation.current += 1
      controller.abort()
      window.clearInterval(timer)
    }
  }, [enabled, jobId, platform, refresh])

  return { job, loading, error, refresh }
}

export function useVideoStudioCommand(
  commandId: string | null,
  jobId: string | null,
  platform: VideoStudioPlatform | null,
  sourceReviewId: string | null,
  parentRevisionHash: string | null,
  parentArtifactHash: string | null,
) {
  const [command, setCommand] = useState<VideoStudioCommandReadback | null>(null)
  const [loading, setLoading] = useState(Boolean(commandId))
  const [error, setError] = useState<Error | null>(null)
  const alive = useRef(true)
  const generation = useRef(0)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!commandId || !jobId || !platform || !sourceReviewId || !parentRevisionHash || !parentArtifactHash) return false
    const requestGeneration = ++generation.current
    try {
      const next = await getVideoStudioCommand(
        commandId,
        jobId,
        platform,
        sourceReviewId,
        parentRevisionHash,
        parentArtifactHash,
        signal,
      )
      if (!alive.current || requestGeneration !== generation.current) return false
      setCommand(next)
      setError(null)
      return true
    } catch (cause) {
      if (!alive.current || signal?.aborted || requestGeneration !== generation.current) return false
      setError(cause instanceof Error ? cause : new Error('video_command_readback_failed'))
      return false
    } finally {
      if (alive.current && !signal?.aborted && requestGeneration === generation.current) setLoading(false)
    }
  }, [commandId, jobId, parentArtifactHash, parentRevisionHash, platform, sourceReviewId])

  useEffect(() => {
    if (!commandId || !jobId || !platform || !sourceReviewId || !parentRevisionHash || !parentArtifactHash) {
      setCommand(null)
      setError(null)
      setLoading(false)
      return
    }
    alive.current = true
    setCommand(null)
    setError(null)
    setLoading(true)
    const controller = new AbortController()
    void refresh(controller.signal)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, COMMAND_REFRESH_MS)
    return () => {
      alive.current = false
      generation.current += 1
      controller.abort()
      window.clearInterval(timer)
    }
  }, [commandId, jobId, parentArtifactHash, parentRevisionHash, platform, refresh, sourceReviewId])

  return { command, loading, error, refresh }
}

export function useVideoStudioRecoveryCommand(
  commandId: string | null,
  jobId: string | null,
  platform: VideoStudioPlatform | null,
  sourceReviewId: string | null,
  parentRevisionHash: string | null,
  parentArtifactHash: string | null,
  expectedRecoveryReviewId: string | null,
) {
  const [command, setCommand] = useState<VideoStudioCommandReadback | null>(null)
  const [loading, setLoading] = useState(Boolean(commandId))
  const [error, setError] = useState<Error | null>(null)
  const alive = useRef(true)
  const generation = useRef(0)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!commandId || !jobId || !platform || !sourceReviewId || !parentRevisionHash
      || !parentArtifactHash || !expectedRecoveryReviewId) return false
    const requestGeneration = ++generation.current
    try {
      const next = await getVideoStudioRecoveryCommand(
        commandId,
        jobId,
        platform,
        sourceReviewId,
        parentRevisionHash,
        parentArtifactHash,
        expectedRecoveryReviewId,
        signal,
      )
      if (!alive.current || requestGeneration !== generation.current) return false
      setCommand(next)
      setError(null)
      return true
    } catch (cause) {
      if (!alive.current || signal?.aborted || requestGeneration !== generation.current) return false
      setError(cause instanceof Error ? cause : new Error('video_recovery_command_readback_failed'))
      return false
    } finally {
      if (alive.current && !signal?.aborted && requestGeneration === generation.current) setLoading(false)
    }
  }, [commandId, expectedRecoveryReviewId, jobId, parentArtifactHash, parentRevisionHash, platform, sourceReviewId])

  useEffect(() => {
    if (!commandId || !jobId || !platform || !sourceReviewId || !parentRevisionHash
      || !parentArtifactHash || !expectedRecoveryReviewId) {
      setCommand(null)
      setError(null)
      setLoading(false)
      return
    }
    alive.current = true
    setCommand(null)
    setError(null)
    setLoading(true)
    const controller = new AbortController()
    void refresh(controller.signal)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, COMMAND_REFRESH_MS)
    return () => {
      alive.current = false
      generation.current += 1
      controller.abort()
      window.clearInterval(timer)
    }
  }, [commandId, expectedRecoveryReviewId, jobId, parentArtifactHash, parentRevisionHash, platform, refresh, sourceReviewId])

  return { command, loading, error, refresh }
}
