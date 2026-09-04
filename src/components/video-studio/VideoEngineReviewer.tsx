import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  Mic,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from '@/lib/icons'
import {
  useVideoStudioActiveJob,
  useVideoStudioCommand,
  useVideoStudioRecoveryCommand,
  useVideoStudioReview,
} from '../../hooks/useVideoStudioReviews'
import {
  VIDEO_GATE_LABEL,
  VideoStudioApiError,
  decideVideoStudioReview,
  recoverVideoStudioDecisionCommand,
  takeVideoStudioReturnFocus,
  returnVideoStudioToParent,
  videoStudioIdempotencyKey,
  videoStudioReviewIsWellFormed,
  videoStudioSubmittedAt,
  type VideoStudioComparison,
  type VideoStudioReview,
} from '../../lib/videoStudio'
import { useHaptics } from '../../hooks/useHaptics'
import { Eyebrow } from '../shared/Eyebrow'
import { Pressable } from '../shared/Pressable'
import { Skeleton } from '../shared/Skeleton'
import { MagicDirectionSheet } from './MagicDirectionSheet'
import { VideoBrandLockup } from './VideoBrandLockup'
import { VideoCompareStage } from './VideoCompareStage'

const GATE_KEYS = ['truth', 'rights', 'confidentiality', 'transcript_fidelity', 'naming'] as const
type BlockingGateKey = typeof GATE_KEYS[number]
type BlockingGateStatus = 'passed' | 'blocked' | 'pending'
type LearningConfirmation = {
  action: 'confirm' | 'correct' | 'observe_only'
  correction?: string
}

type LocalRecoveryBridge = {
  commandId: string
  recoveryReviewId: string
  status: 'queued' | 'leased' | 'succeeded' | 'failed' | 'attention' | 'cancelled'
}

const GATE_LABEL: Record<BlockingGateKey, string> = {
  truth: 'Truth',
  rights: 'Rights',
  confidentiality: 'Confidentiality',
  transcript_fidelity: 'Transcript fidelity',
  naming: 'Naming',
}

const MODE_LABEL: Record<VideoStudioReview['mode'], string> = {
  extract: 'Extracted',
  solo: 'Solo',
  short_native: 'Short native',
}

const PLATFORM_LABEL: Record<VideoStudioReview['platform'], string> = {
  youtube_shorts: 'YouTube Shorts',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  instagram_reels: 'Instagram Reels',
}

type GateReading = {
  key: BlockingGateKey
  label: string
  status: BlockingGateStatus
  detail: string | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function textValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function reviewCopy(review: VideoStudioReview) {
  const payload = asRecord(review.review_payload)
  return {
    direction: textValue(payload.direction),
    title: textValue(payload.change_title, review.safe_title),
    summary: textValue(payload.change_summary, review.safe_summary),
    range: textValue(payload.range_label),
    changes: Array.isArray(payload.changes)
      ? payload.changes.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).slice(0, 4)
      : [],
    editorialNote: textValue(
      payload.editorial_note,
      'The engine stopped before inventing an editorial answer. Choose the route or direct the next change.',
    ),
  }
}

function blockingGates(review: VideoStudioReview): GateReading[] {
  const payload = asRecord(review.review_payload)
  const rawGates = asRecord(payload.blocking_gates)
  return GATE_KEYS.map(key => {
    const raw = asRecord(rawGates[key])
    const status: BlockingGateStatus = raw.status === 'passed' || raw.status === 'blocked' || raw.status === 'pending'
      ? raw.status
      : 'pending'
    return {
      key,
      label: GATE_LABEL[key],
      status,
      detail: textValue(raw.detail) || null,
    }
  })
}

function runnerCopy(review: VideoStudioReview) {
  switch (review.runner_state) {
    case 'idle': return { label: 'Runner ready', dot: 'bg-emerald-300', tone: 'border-emerald-300/15 text-emerald-100/80' }
    case 'working': return { label: 'Editing now', dot: 'bg-violet-300 animate-pulse', tone: 'border-violet-300/15 text-violet-100/80' }
    case 'queued': return { label: 'Waiting safely', dot: 'bg-amber-300', tone: 'border-amber-300/15 text-amber-100/80' }
    case 'attention': return { label: 'Needs attention', dot: 'bg-rose-300', tone: 'border-rose-300/15 text-rose-100/80' }
    case 'offline': return { label: 'Studio computer off', dot: 'bg-amber-300', tone: 'border-amber-300/15 text-amber-100/80' }
    default: return { label: 'Runner state unknown', dot: 'bg-rose-300', tone: 'border-rose-300/15 text-rose-100/80' }
  }
}

function hasHash(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function actionLabel(review: VideoStudioReview): string {
  if (review.gate === 'story') return 'Use this angle'
  if (review.gate === 'treatment') return 'Use this treatment'
  if (review.gate === 'learning') return 'Use this learning'
  return 'Use this version'
}

function waitingCopy(review: VideoStudioReview, locallyQueued: boolean, openingChild: boolean) {
  if (openingChild) {
    return {
      title: 'Opening the prepared review',
      body: 'The runner returned an exact child review. Control Center is opening that immutable result now.',
    }
  }
  if (review.runner_state === 'offline') {
    return {
      title: 'Waiting for studio computer',
      body: `${locallyQueued ? 'Your direction is' : 'The saved direction is'} queued safely. It will start when the Windows runner reconnects.`,
    }
  }
  if (review.runner_state === 'attention') {
    return {
      title: 'The runner needs attention',
      body: 'Your direction is safe, but the studio computer needs a human check before it can continue.',
    }
  }
  return {
    title: locallyQueued ? 'Direction queued safely' : 'Saved direction is being prepared',
    body: review.runner_state === 'working'
      ? 'The studio computer is rendering the real candidate now.'
      : 'The direction is saved and waiting for the runner. No After preview exists yet.',
  }
}

const REVIEWER_FOCUSABLE = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function useReviewerDialogFocus(onClose: () => void, nestedDialogOpen: boolean, contentKey: string) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const closeRef = useRef(onClose)
  const nestedOpenRef = useRef(nestedDialogOpen)
  closeRef.current = onClose
  nestedOpenRef.current = nestedDialogOpen

  useEffect(() => {
    previousFocus.current = takeVideoStudioReturnFocus()
      || (document.activeElement instanceof HTMLElement ? document.activeElement : null)

    const focusable = () => {
      const dialog = dialogRef.current
      if (!dialog) return []
      return Array.from(dialog.querySelectorAll<HTMLElement>(REVIEWER_FOCUSABLE))
        .filter(element => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true')
    }
    const focusInside = () => {
      const dialog = dialogRef.current
      if (!dialog || nestedOpenRef.current) return
      const preferred = dialog.querySelector<HTMLElement>('[data-reviewer-initial-focus]')
      ;(preferred || focusable()[0] || dialog).focus({ preventScroll: true })
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (nestedOpenRef.current) return
      const dialog = dialogRef.current
      if (!dialog) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) {
        event.preventDefault()
        dialog.focus({ preventScroll: true })
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    const onFocusIn = (event: FocusEvent) => {
      const dialog = dialogRef.current
      if (!nestedOpenRef.current && dialog && !dialog.contains(event.target as Node)) focusInside()
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('focusin', onFocusIn, true)
    const frame = window.requestAnimationFrame(focusInside)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('focusin', onFocusIn, true)
      const restore = previousFocus.current
      window.requestAnimationFrame(() => {
        if (restore?.isConnected) restore.focus({ preventScroll: true })
      })
    }
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current
      if (!nestedOpenRef.current && dialog && !dialog.contains(document.activeElement)) {
        const preferred = dialog.querySelector<HTMLElement>('[data-reviewer-initial-focus]')
        ;(preferred || dialog).focus({ preventScroll: true })
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [contentKey])

  return dialogRef
}

function LoadingReview({ onClose, dialogRef }: { onClose: () => void; dialogRef: React.RefObject<HTMLDivElement> }) {
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-review-loading-title"
      tabIndex={-1}
      data-testid="video-review-overlay"
      className="fixed left-0 top-0 z-[110] flex h-[calc(100dvh/var(--z,1))] w-[calc(100vw/var(--z,1))] flex-col bg-base text-white"
      aria-busy="true"
    >
      <h1 id="video-review-loading-title" className="sr-only">Loading Video Engine review</h1>
      <header className="flex h-[52px] flex-shrink-0 items-center gap-3 border-b border-white/[0.06] px-3">
        <button data-reviewer-initial-focus type="button" onClick={onClose} aria-label="Back to Content" className="grid h-11 w-11 place-items-center rounded-full text-white/60">
          <ArrowLeft size={18} />
        </button>
        <Skeleton h={10} w={96} r={5} />
      </header>
      <Skeleton h="52%" r={0} />
      <div className="space-y-3 px-4 py-5">
        <Skeleton h={10} w={122} r={5} />
        <Skeleton h={24} w="62%" r={7} />
        <Skeleton h={12} w="88%" r={6} />
        <div className="flex gap-2 pt-3"><Skeleton h={48} r={16} className="flex-1" /><Skeleton h={48} r={16} className="flex-1" /></div>
      </div>
    </div>
  )
}

export function VideoEngineReviewer({ reviewId, onClose }: { reviewId: string; onClose: () => void }) {
  const [queuedInstruction, setQueuedInstruction] = useState<string | null>(null)
  const [queuedCommandId, setQueuedCommandId] = useState<string | null>(null)
  const [localRecoveryBridge, setLocalRecoveryBridge] = useState<LocalRecoveryBridge | null>(null)
  const { review, loading, error, refresh } = useVideoStudioReview(reviewId, Boolean(queuedInstruction))
  const activeReadback = useVideoStudioActiveJob(
    review?.job_id || null,
    review?.platform || null,
    review?.status === 'approved',
  )
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetHost, setSheetHost] = useState<HTMLElement | null>(null)
  const [gatesOpen, setGatesOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [busyAction, setBusyAction] = useState(false)
  const [correctingLearning, setCorrectingLearning] = useState(false)
  const [learningCorrection, setLearningCorrection] = useState('')
  const decisionKeys = useRef<Record<string, { fingerprint: string; key: string; submittedAt: string }>>({})
  const returnKey = useRef<{ fingerprint: string; key: string; submittedAt: string } | null>(null)
  const h = useHaptics()
  const malformedResponse = error instanceof VideoStudioApiError && error.code === 'malformed_response'
  const durablePrepareInFlight = review?.status === 'pending'
    && (review.prepare_command?.status === 'queued' || review.prepare_command?.status === 'leased')
  const trackedCommandId = queuedCommandId || (durablePrepareInFlight ? review?.prepare_command?.id || null : null)
  const dialogRef = useReviewerDialogFocus(
    onClose,
    sheetOpen,
    loading ? 'loading' : review ? `${review.id}:${review.status}` : malformedResponse ? 'malformed' : 'unavailable',
  )
  const commandReadback = useVideoStudioCommand(
    trackedCommandId,
    review?.job_id || null,
    review?.platform || null,
    review?.id || null,
    review?.parent_revision_hash || null,
    review?.parent_artifact_hash || null,
  )
  const projectedRecoveryBridge = review?.recovery.binding_command || null
  const trackedRecoveryBridgeId = localRecoveryBridge?.commandId
    || ((projectedRecoveryBridge?.status === 'queued' || projectedRecoveryBridge?.status === 'leased')
      ? projectedRecoveryBridge.id
      : null)
  const expectedRecoveryReviewId = localRecoveryBridge?.recoveryReviewId
    || review?.recovery.recovery_review_id
    || null
  const recoveryCommandReadback = useVideoStudioRecoveryCommand(
    trackedRecoveryBridgeId,
    review?.job_id || null,
    review?.platform || null,
    review?.id || null,
    review?.parent_revision_hash || null,
    review?.parent_artifact_hash || null,
    expectedRecoveryReviewId,
  )

  useEffect(() => {
    setQueuedInstruction(null)
    setQueuedCommandId(null)
    setLocalRecoveryBridge(null)
    setGatesOpen(false)
    setNotice(null)
    setMutationError(null)
    setStale(false)
    setCorrectingLearning(false)
    setLearningCorrection('')
    decisionKeys.current = {}
    returnKey.current = null
  }, [reviewId])

  useEffect(() => {
    const resultReviewId = recoveryCommandReadback.command?.result_review_id
    if (recoveryCommandReadback.command?.status === 'succeeded' && resultReviewId) {
      window.location.hash = `#/content?video=${encodeURIComponent(resultReviewId)}`
    }
  }, [recoveryCommandReadback.command?.result_review_id, recoveryCommandReadback.command?.status])

  useEffect(() => {
    const resultReviewId = review?.recovery.binding_command?.result_review_id
    if (review?.recovery.binding_command?.status === 'succeeded' && resultReviewId) {
      window.location.hash = `#/content?video=${encodeURIComponent(resultReviewId)}`
    }
  }, [review?.recovery.binding_command?.result_review_id, review?.recovery.binding_command?.status])

  useEffect(() => {
    const projectedId = review?.recovery.binding_command?.id
    if (!localRecoveryBridge || !projectedId || projectedId === localRecoveryBridge.commandId) return
    setLocalRecoveryBridge(null)
    setNotice('A different recovery binding is recorded for this review. Its exact server state is now shown.')
    setMutationError(null)
  }, [localRecoveryBridge, review?.recovery.binding_command?.id])

  useEffect(() => {
    const nextReviewId = commandReadback.command?.result_review_id
    const projectedCommandId = review?.prepare_command?.id
    if (nextReviewId && (!projectedCommandId || projectedCommandId === commandReadback.command?.id)) {
      window.location.hash = `#/content?video=${encodeURIComponent(nextReviewId)}`
    }
  }, [commandReadback.command?.id, commandReadback.command?.result_review_id, review?.prepare_command?.id])

  useEffect(() => {
    const childReviewId = review?.prepare_command?.result_review_id
    if (childReviewId) window.location.hash = `#/content?video=${encodeURIComponent(childReviewId)}`
  }, [review?.prepare_command?.result_review_id])

  useEffect(() => {
    const projectedCommandId = review?.prepare_command?.id
    if (!queuedCommandId || !projectedCommandId || projectedCommandId === queuedCommandId) return
    // The server's newest prepare projection wins. Stop presenting the older
    // browser-local command without changing either immutable command record.
    setQueuedCommandId(null)
    setQueuedInstruction(null)
    setNotice('A newer saved direction exists for this review. Its exact server state is now shown.')
    setMutationError(null)
  }, [queuedCommandId, review?.prepare_command?.id])

  const idempotencyFor = (name: string, fingerprint: string) => {
    const current = decisionKeys.current[name]
    if (!current || current.fingerprint !== fingerprint) {
      decisionKeys.current[name] = { fingerprint, key: videoStudioIdempotencyKey(), submittedAt: videoStudioSubmittedAt() }
    }
    return decisionKeys.current[name]
  }

  const reportMutationError = (cause: unknown) => {
    const apiError = cause instanceof VideoStudioApiError
      ? cause
      : new VideoStudioApiError(0, { error: { code: 'network_error', message: 'That action could not be saved. Try again.' } })
    if (apiError.code === 'stale_parent') {
      setStale(true)
      setMutationError('A newer version exists. Refresh before making this call.')
    } else if (apiError.code === 'idempotency_conflict') {
      setMutationError('That retry no longer matches the first request. Refresh before trying again.')
    } else {
      setMutationError(apiError.message)
    }
    h.error()
  }

  const refreshReview = async () => {
    const refreshed = await refresh()
    if (!refreshed) {
      setMutationError('The review could not be refreshed. Your current screen and any typed direction are unchanged.')
      return
    }
    setStale(false)
    setMutationError(null)
  }

  if (loading && !review) return <LoadingReview onClose={onClose} dialogRef={dialogRef} />

  if (!review) {
    return (
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-review-unavailable-title"
        tabIndex={-1}
        data-testid="video-review-overlay"
        className="fixed left-0 top-0 z-[110] grid h-[calc(100dvh/var(--z,1))] w-[calc(100vw/var(--z,1))] place-items-center bg-base px-6 text-center text-white"
      >
        <div className="max-w-sm" data-testid={malformedResponse ? 'video-malformed-review' : undefined}>
          <AlertTriangle size={24} className="mx-auto text-amber-200" />
          <h1 id="video-review-unavailable-title" className="mt-4 text-lede font-semibold">
            {malformedResponse ? 'This review projection is incomplete' : 'This review could not be opened'}
          </h1>
          <p className="mt-2 text-label leading-relaxed text-white/50">
            {malformedResponse
              ? 'No decision is available because version, taxonomy, review, gate, or private-preview data is missing or invalid.'
              : 'No decision was made. Refresh the private review or return to Content.'}
          </p>
          <div className="mt-5 flex gap-2">
            <Pressable aria-label="Back to Content" variant="secondary" onPress={onClose}>Back to Content</Pressable>
            <Pressable variant="primary" onPress={refreshReview}>Refresh</Pressable>
          </div>
        </div>
      </div>
    )
  }

  const copy = reviewCopy(review)
  const gates = blockingGates(review)
  const malformed = !videoStudioReviewIsWellFormed(review)
  const passed = gates.filter(gate => gate.status === 'passed').length
  const blocked = gates.filter(gate => gate.status === 'blocked').length
  const pending = gates.length - passed - blocked
  const allPassed = passed === GATE_KEYS.length
  const bindingsComplete = hasHash(review.parent_revision_hash)
    && hasHash(review.parent_artifact_hash)
    && hasHash(review.revision_hash)
    && hasHash(review.artifact_hash)
  const pendingDecision = review.status === 'pending'
  const editorialRoute = review.route_state === 'requires_editorial_route'
  const prepareHasChild = Boolean(review.prepare_command?.result_review_id)
  const prepareStopped = Boolean(pendingDecision
    && review.prepare_command
    && review.prepare_command.result_review_id === null
    && (review.prepare_command.status === 'failed'
      || review.prepare_command.status === 'cancelled'
      || review.prepare_command.status === 'attention'))
  const serverWaiting = pendingDecision && !prepareStopped && review.preview.state === 'processing'
    && (review.runner_state === 'offline' || review.runner_state === 'queued' || review.runner_state === 'working' || review.runner_state === 'attention')
  const waiting = Boolean(queuedInstruction) || durablePrepareInFlight || prepareHasChild || serverWaiting
  const runner = runnerCopy(review)
  const canUse = pendingDecision && allPassed && bindingsComplete && !malformed && !editorialRoute && !waiting
  const canKeep = pendingDecision && bindingsComplete && !malformed && !waiting
  const activeVersionMatches = Boolean(activeReadback.job
    && activeReadback.job.job_id === review.job_id
    && activeReadback.job.platform === review.platform
    && activeReadback.job.active_artifact_hash === review.artifact_hash
    && (review.candidate_hash === null
      || activeReadback.job.active_candidate_hash === review.candidate_hash))
  const canReturn = review.status === 'approved'
    && !malformed
    && allPassed
    && activeVersionMatches
    && hasHash(activeReadback.job?.active_revision_hash)
    && hasHash(activeReadback.job?.active_artifact_hash)
    && hasHash(activeReadback.job?.parent_revision_hash)
    && hasHash(activeReadback.job?.parent_artifact_hash)

  const visibleComparison: VideoStudioComparison = (queuedInstruction || durablePrepareInFlight)
    ? {
        state: 'processing',
        before: review.comparison.before,
        after: { url: null, expires_at: null },
        alignment: 'unavailable',
        start_ms: null,
        end_ms: null,
      }
    : review.comparison

  const submitDecision = async (
    decision: 'use_candidate' | 'keep_current',
    learningConfirmation?: LearningConfirmation,
  ) => {
    if ((review.gate === 'learning') !== Boolean(learningConfirmation)) return
    const fingerprint = [
      review.id,
      review.revision_hash,
      review.parent_revision_hash,
      review.parent_artifact_hash,
      review.artifact_hash,
      decision,
      learningConfirmation?.action || '',
      learningConfirmation?.correction || '',
    ].join(':')
    setBusyAction(true)
    setMutationError(null)
    setStale(false)
    try {
      const submission = idempotencyFor(decision, fingerprint)
      const response = await decideVideoStudioReview(review.id, {
        idempotency_key: submission.key,
        submitted_at: submission.submittedAt,
        job_id: review.job_id,
        platform: review.platform,
        expected_command_kind: decision === 'use_candidate' && review.queues_activation
          ? 'magic_edit_activate'
          : 'review_decision_record',
        revision_hash: review.revision_hash,
        parent_revision_hash: review.parent_revision_hash,
        parent_artifact_hash: review.parent_artifact_hash,
        artifact_hash: review.artifact_hash,
        decision,
        ...(learningConfirmation ? { learning_confirmation: learningConfirmation } : {}),
      })
      const runnerNeedsAttention = response.command.status === 'failed'
        || response.command.status === 'attention'
        || response.command.status === 'cancelled'
      if (runnerNeedsAttention) {
        setNotice('The decision is saved, but the studio runner needs attention before downstream work can continue.')
      } else if (decision === 'use_candidate') {
        setNotice(response.command.kind === 'magic_edit_activate'
          ? 'Activation queued safely. This screen will change after server readback.'
          : 'The candidate decision was saved. No version activation was requested.')
      } else {
        setNotice('Decision saved. The current version remains in place.')
      }
      if (runnerNeedsAttention) h.error()
      else h.notifySuccess()
      window.setTimeout(() => void refresh(), 650)
    } catch (cause) {
      reportMutationError(cause)
    } finally {
      setBusyAction(false)
    }
  }

  const returnToParent = async () => {
    if (!activeReadback.job || !canReturn) return
    const fingerprint = [
      review.job_id,
      activeReadback.job.platform,
      activeReadback.job.active_revision_hash,
      activeReadback.job.active_artifact_hash,
      activeReadback.job.parent_revision_hash,
      activeReadback.job.parent_artifact_hash,
    ].join(':')
    if (!returnKey.current || returnKey.current.fingerprint !== fingerprint) {
      returnKey.current = { fingerprint, key: videoStudioIdempotencyKey(), submittedAt: videoStudioSubmittedAt() }
    }
    setBusyAction(true)
    setMutationError(null)
    try {
      const response = await returnVideoStudioToParent(review.job_id, {
        idempotency_key: returnKey.current.key,
        submitted_at: returnKey.current.submittedAt,
        platform: activeReadback.job.platform,
        parent_revision_hash: activeReadback.job.active_revision_hash,
        parent_artifact_hash: activeReadback.job.active_artifact_hash,
        target_parent_revision_hash: activeReadback.job.parent_revision_hash,
        target_parent_artifact_hash: activeReadback.job.parent_artifact_hash,
      })
      if (response.command.status === 'failed' || response.command.status === 'attention' || response.command.status === 'cancelled') {
        throw new VideoStudioApiError(409, {
          error: { code: `command_${response.command.status}`, message: 'Return is recorded, but the studio runner needs attention before it can activate the parent.' },
        })
      }
      setNotice('Return queued safely. The active version will change only after server readback.')
      window.setTimeout(() => void activeReadback.refresh(), 650)
    } catch (cause) {
      reportMutationError(cause)
    } finally {
      setBusyAction(false)
    }
  }

  const createFreshReview = async () => {
    const command = review.decision_command
    if (review.status === 'pending' || !command || !review.recovery.available) return
    const fingerprint = [
      review.id,
      review.job_id,
      review.platform,
      command.id,
      command.parent_revision_hash,
      command.parent_artifact_hash,
      review.recovery.current_generation,
    ].join(':')
    const submission = idempotencyFor(`recover:${command.id}`, fingerprint)
    setBusyAction(true)
    setMutationError(null)
    setStale(false)
    try {
      const response = await recoverVideoStudioDecisionCommand(command.id, {
        idempotency_key: submission.key,
        submitted_at: submission.submittedAt,
        source_review_id: review.id,
        job_id: review.job_id,
        platform: review.platform,
        recovery_generation: (review.recovery.current_generation + 1) as 1 | 2 | 3,
        parent_revision_hash: command.parent_revision_hash,
        parent_artifact_hash: command.parent_artifact_hash,
      })
      if (response.command.status === 'succeeded' && response.command.result_review_id) {
        h.notifySuccess()
        window.location.hash = `#/content?video=${encodeURIComponent(response.command.result_review_id)}`
      } else {
        setLocalRecoveryBridge({
          commandId: response.command.id,
          recoveryReviewId: response.recovery_review_id,
          status: response.command.status,
        })
        if (response.command.status === 'queued' || response.command.status === 'leased') {
          setNotice('Fresh review request saved. It will open only after the studio computer signs the exact local ledger binding.')
          h.notifySuccess()
        } else {
          setNotice('The fresh review request is saved, but its local ledger binding needs attention. The original decision and history are unchanged.')
          h.error()
        }
        window.setTimeout(() => void refresh(), 650)
      }
    } catch (cause) {
      const apiError = cause instanceof VideoStudioApiError
        ? cause
        : new VideoStudioApiError(0, { error: { code: 'network_error', message: 'The fresh review request could not be confirmed. Try the same action again.' } })
      if (apiError.code === 'stale_parent') {
        const refreshed = await refresh()
        setStale(true)
        setMutationError(refreshed
          ? 'A newer parent version exists. No recovery binding was requested; the exact review state has been refreshed.'
          : 'A newer parent version exists. No recovery binding was requested, and the exact review state could not yet be refreshed.')
        h.error()
      } else if (apiError.code === 'recovery_limit_reached') {
        setMutationError('Fresh-review recovery has reached its three-generation safety limit.')
        h.error()
      } else if (apiError.code === 'recovery_preview_expired') {
        const refreshed = await refresh()
        setMutationError(refreshed
          ? 'The private Before/After media has expired, so no fresh activation review was bound. The source review has been refreshed.'
          : 'The private Before/After media has expired, so no fresh activation review was bound. Its exact source state could not yet be refreshed.')
        h.error()
      } else if (apiError.code === 'recovery_exists') {
        const refreshed = await refresh()
        setMutationError(refreshed
          ? 'A replacement review already exists. The source review has been refreshed without changing its history.'
          : 'A replacement review already exists, but its exact source state could not yet be refreshed.')
        h.error()
      } else if (apiError.code === 'recovery_not_available' || apiError.code === 'recovery_conflict') {
        const refreshed = await refresh()
        setMutationError(refreshed
          ? 'A fresh review is no longer available from this exact command and parent. The source review has been refreshed.'
          : 'A fresh review is no longer available from this exact command and parent, and its source state could not yet be refreshed.')
        h.error()
      } else if (apiError.code === 'idempotency_conflict') {
        setMutationError('This recovery submission no longer matches its original request. Refresh before making another call.')
        h.error()
      } else {
        reportMutationError(apiError)
      }
    } finally {
      setBusyAction(false)
    }
  }

  const waitCopy = waitingCopy(review, Boolean(queuedInstruction), prepareHasChild)
  const queuedCommandNeedsAttention = commandReadback.command?.status === 'failed'
    || commandReadback.command?.status === 'attention'
    || commandReadback.command?.status === 'cancelled'
  const queuedCommandStopped = Boolean((queuedCommandNeedsAttention
    && !commandReadback.command?.result_review_id) || prepareStopped)

  const directDifferentChange = () => {
    // Clear only the local presentation state. The immutable command and its
    // terminal receipt remain in the server audit trail.
    setQueuedInstruction(null)
    setQueuedCommandId(null)
    setNotice(null)
    setMutationError(null)
    setSheetOpen(true)
  }
  const gateSummary = allPassed
    ? '5 blocking checks passed'
    : blocked
      ? `${blocked} blocking ${blocked === 1 ? 'check needs' : 'checks need'} attention`
      : `${pending} blocking ${pending === 1 ? 'check is' : 'checks are'} still pending`
  const decisionCommand = review.decision_command
  const decisionSyncWaiting = decisionCommand?.status === 'queued' || decisionCommand?.status === 'leased'
  const decisionSyncSucceeded = decisionCommand?.status === 'succeeded'
  const recoveryExhausted = review.recovery.current_generation >= review.recovery.max_generation
  const recoveryBridgeCommand = recoveryCommandReadback.command || projectedRecoveryBridge
  const recoveryBridgeStatus = recoveryBridgeCommand?.status || localRecoveryBridge?.status || null
  const recoveryBridgePresent = Boolean(recoveryBridgeCommand || localRecoveryBridge)
  const recoveryBridgeWaiting = recoveryBridgeStatus === 'queued' || recoveryBridgeStatus === 'leased'
  const recoveryBridgeOpening = recoveryBridgeStatus === 'succeeded'
    && Boolean(recoveryBridgeCommand?.result_review_id)
  const recoveryBridgeStopped = recoveryBridgeStatus === 'failed'
    || recoveryBridgeStatus === 'attention'
    || recoveryBridgeStatus === 'cancelled'
  const resolvedHealthy = recoveryBridgeOpening || (!recoveryBridgePresent && decisionSyncSucceeded)
  const resolvedWaiting = recoveryBridgeWaiting || (!recoveryBridgePresent && decisionSyncWaiting)

  const refreshRecoveryBinding = () => {
    if (trackedRecoveryBridgeId) return recoveryCommandReadback.refresh()
    return refresh()
  }

  return (
    <div
      ref={dialogRef}
      data-testid="video-review-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-review-dialog-title"
      tabIndex={-1}
      className="fixed left-0 top-0 z-[110] h-[calc(100dvh/var(--z,1))] w-[calc(100vw/var(--z,1))] overflow-y-auto overscroll-contain bg-sunk text-white"
    >
      <h1 id="video-review-dialog-title" className="sr-only">Video Engine review for {review.safe_title}</h1>
      <div ref={setSheetHost} className="mx-auto flex min-h-full w-full max-w-[520px] flex-col border-x border-white/[0.04] bg-base shadow-e3">
        <header className="sticky top-0 z-30 grid h-[90px] flex-shrink-0 grid-cols-[44px_1fr_auto] grid-rows-[44px_36px] items-center gap-x-2 border-b border-white/[0.06] bg-base/94 px-2.5 pb-2 backdrop-blur-xl sm:flex sm:h-[52px] sm:gap-2 sm:px-2.5 sm:pb-0">
          <button
            data-reviewer-initial-focus
            type="button"
            onClick={onClose}
            aria-label="Back to Content"
            className="col-start-1 row-start-1 grid h-11 w-11 flex-shrink-0 place-items-center rounded-full text-white/65 transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="col-span-3 row-start-2 min-w-0 justify-self-start sm:min-w-0 sm:flex-1">
            <VideoBrandLockup series={review.series} placement="header" />
          </div>
          <div className={`col-start-3 row-start-1 flex min-h-[32px] flex-shrink-0 items-center gap-1.5 rounded-full border bg-white/[0.025] px-2.5 text-micro font-semibold ${runner.tone}`} aria-label={`Runner state: ${runner.label}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${runner.dot}`} />
            <span className="hidden min-[480px]:inline">{runner.label}</span>
          </div>
        </header>

        {error && (
          <div className="flex items-center justify-between gap-3 border-b border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-micro text-amber-100/80" role="status">
            <span>Latest server readback failed. This screen has not claimed a newer state.</span>
            <button type="button" onClick={() => void refreshReview()} className="min-h-[32px] flex-shrink-0 font-semibold underline underline-offset-4">Retry</button>
          </div>
        )}

        <div className="flex min-h-[210px] flex-1 flex-col [@media(max-height:760px)]:min-h-[118px]">
          <VideoCompareStage
            comparison={visibleComparison}
            fallbackAfter={queuedInstruction || durablePrepareInFlight ? undefined : review.preview}
            title={copy.title}
            series={review.series}
          />
        </div>

        <section className="relative z-20 flex-shrink-0 rounded-t-[26px] border-t border-white/[0.09] bg-base px-4 pb-[calc(env(safe-area-inset-bottom,0px)+14px)] pt-2 shadow-[0_-18px_50px_rgba(0,0,0,0.34)] [@media(max-height:760px)]:rounded-t-[20px] [@media(max-height:760px)]:pb-2 [@media(max-height:760px)]:pt-1" aria-label="Magic edit decision">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/15 [@media(max-height:760px)]:mb-1" aria-hidden="true" />

          {malformed ? (
            <div data-testid="video-malformed-review" className="pb-1">
              <div className="flex items-center gap-2 text-rose-200/85">
                <AlertTriangle size={14} />
                <Eyebrow className="!text-rose-200/85">Decision blocked</Eyebrow>
              </div>
              <h1 className="mt-2 text-lede font-semibold leading-tight text-white/92">This review projection is incomplete</h1>
              <p className="mt-2 text-label leading-relaxed text-white/55">No decision is available because version, taxonomy, review, gate, or private-preview data is missing or invalid.</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Pressable variant="secondary" onPress={onClose}>Back to Content</Pressable>
                <Pressable variant="primary" onPress={refreshReview}><RefreshCw size={14} /> Refresh</Pressable>
              </div>
            </div>
          ) : waiting ? (
            <div data-testid="video-waiting-state" className="pb-1">
              <div className="flex items-center gap-2 text-violet-200/85">
                {review.runner_state === 'offline' || review.runner_state === 'attention'
                  ? <Clock size={14} />
                  : review.runner_state === 'working'
                    ? <span className="animate-pulse"><Sparkles size={14} /></span>
                    : <Sparkles size={14} />}
                <Eyebrow tone="accent">Queued safely</Eyebrow>
              </div>
              <h1 className="mt-2 text-lede font-semibold leading-tight text-white/92">{waitCopy.title}</h1>
              <p className="mt-2 text-label leading-relaxed text-white/52">{waitCopy.body}</p>
              {(commandReadback.error || queuedCommandNeedsAttention) && (
                <p className="mt-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-label leading-relaxed text-amber-100" role="alert">
                  {commandReadback.error
                    ? 'The exact edit status could not be read. The queued direction is unchanged; retry the status check.'
                    : 'The edit is saved, but the studio runner needs attention before it can produce a child review.'}
                </p>
              )}
              {queuedInstruction && (
                <p className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-label leading-relaxed text-white/62">
                  <strong className="text-white/80">Direction:</strong> “{queuedInstruction}”
                </p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Pressable variant="secondary" onPress={onClose}>Back to Content</Pressable>
                {queuedCommandStopped ? (
                  <Pressable variant="primary" onPress={directDifferentChange}>Direct a different change</Pressable>
                ) : (
                  <Pressable
                    variant="primary"
                    onPress={() => { void (trackedCommandId ? commandReadback.refresh() : refreshReview()) }}
                  ><RefreshCw size={14} /> Refresh</Pressable>
                )}
              </div>
              {queuedCommandStopped && (
                <button
                  type="button"
                  onClick={() => { void commandReadback.refresh() }}
                  className="mt-2 min-h-[36px] w-full text-micro font-semibold text-white/45 underline underline-offset-4"
                >Refresh command status</button>
              )}
            </div>
          ) : editorialRoute ? (
            <div data-testid="video-editorial-route" className="pb-1">
              <div className="flex items-center gap-2 text-amber-200/85">
                <AlertTriangle size={14} />
                <Eyebrow className="!text-amber-200/85">Editorial route required</Eyebrow>
              </div>
              <h1 className="mt-2 text-lede font-semibold leading-tight text-white/92">Needs your editorial call</h1>
              <p className="mt-2 text-label leading-relaxed text-white/55">{copy.editorialNote}</p>
              <p className="mt-2 text-micro leading-relaxed text-amber-100/70">No automatic treatment has been presented as a finished answer.</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Pressable variant="secondary" onPress={() => { void submitDecision('keep_current') }} disabled={!canKeep || busyAction}>Keep current</Pressable>
                <Pressable variant="primary" onPress={() => setSheetOpen(true)} disabled={busyAction}><Mic size={14} /> Direct it</Pressable>
              </div>
            </div>
          ) : review.status !== 'pending' ? (
            <div data-testid="video-resolved-state" className="pb-1">
              <div className={`flex items-center gap-2 ${resolvedHealthy ? 'text-emerald-200/85' : resolvedWaiting ? 'text-amber-200/85' : 'text-rose-200/85'}`}>
                {resolvedHealthy
                  ? <Check size={14} />
                  : resolvedWaiting
                    ? <Clock size={14} />
                    : <AlertTriangle size={14} />}
                <Eyebrow className={resolvedHealthy ? '!text-emerald-200/85' : resolvedWaiting ? '!text-amber-200/85' : '!text-rose-200/85'}>
                  {recoveryBridgeOpening
                    ? 'Opening fresh review'
                    : recoveryBridgeWaiting
                      ? 'Fresh review binding waiting'
                      : recoveryBridgeStopped
                        ? 'Fresh review binding needs attention'
                        : decisionSyncSucceeded
                          ? 'Ledger synced'
                          : decisionSyncWaiting
                            ? 'Ledger sync waiting'
                            : 'Ledger sync needs attention'}
                </Eyebrow>
              </div>
              <h1 className="mt-2 text-lede font-semibold leading-tight text-white/92">
                {review.status === 'approved' ? 'Candidate accepted' : 'Current version kept'}
              </h1>
              <p className={`mt-2 text-label leading-relaxed ${mutationError ? 'text-amber-100' : 'text-white/52'}`} role={mutationError ? 'alert' : 'status'}>
                {mutationError || (recoveryBridgeWaiting
                  ? 'The decision remains saved. A fresh review has been reserved, but it will stay hidden until the studio computer signs its exact local ledger binding.'
                  : recoveryBridgeOpening
                    ? 'The signed local binding is confirmed. Opening the exact fresh review now.'
                    : recoveryBridgeStopped
                      ? 'The fresh review binding needs attention. The original decision and immutable command history are unchanged; no unbound review has been opened.'
                      : decisionSyncWaiting
                  ? 'Your decision is saved, but the local production ledger is still waiting for the studio computer to sync.'
                  : decisionSyncSucceeded
                    ? review.status === 'approved'
                      ? 'The accepted candidate and its local production ledger are confirmed.'
                      : 'The decision to keep the current version is confirmed in the local production ledger.'
                    : recoveryExhausted
                        ? 'Fresh-review recovery has reached its three-generation safety limit.'
                        : review.recovery.available
                          ? 'The decision remains saved. Create a fresh review to continue from the same exact parent without changing this command.'
                          : notice || 'The decision remains saved, but this command cannot continue automatically.')}
              </p>
              {notice?.startsWith('Return queued safely.') && !mutationError && (
                <p className="mt-2 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] px-3 py-2 text-label leading-relaxed text-emerald-100/80" role="status">
                  {notice}
                </p>
              )}

              {decisionCommand && (
                <div data-testid="video-decision-sync" className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-micro text-white/48" role="status" aria-live="polite">
                  <p className="break-all leading-relaxed"><span className="font-semibold text-white/72">Command</span> {decisionCommand.id}</p>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 leading-relaxed">
                    <dt className="font-semibold text-white/58">Kind</dt><dd className="min-w-0 break-words">{decisionCommand.kind}</dd>
                    <dt className="font-semibold text-white/58">Status</dt><dd>{decisionCommand.status}</dd>
                    <dt className="font-semibold text-white/58">Safe code</dt><dd className="min-w-0 break-words">{decisionCommand.safe_code || 'none'}</dd>
                  </dl>
                </div>
              )}

              {recoveryBridgePresent && (
                <div data-testid="video-recovery-binding" className="mt-3 rounded-xl border border-violet-300/15 bg-violet-300/[0.04] px-3 py-2 text-micro text-violet-100/60" role="status" aria-live="polite">
                  <p className="break-all leading-relaxed"><span className="font-semibold text-violet-100/82">Binding command</span> {recoveryBridgeCommand?.id || localRecoveryBridge?.commandId}</p>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 leading-relaxed">
                    <dt className="font-semibold text-violet-100/68">Kind</dt><dd>review_recovery_record</dd>
                    <dt className="font-semibold text-violet-100/68">Status</dt><dd>{recoveryBridgeStatus}</dd>
                    <dt className="font-semibold text-violet-100/68">Safe code</dt><dd className="min-w-0 break-words">{recoveryBridgeCommand?.safe_code || 'none'}</dd>
                  </dl>
                  {recoveryCommandReadback.error && (
                    <p className="mt-1 text-amber-100/80" role="alert">The exact binding status could not be read. No replacement review has been opened.</p>
                  )}
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Pressable variant="secondary" onPress={onClose}>Back to Content</Pressable>
                {recoveryBridgePresent ? (
                  <Pressable variant="secondary" onPress={() => { void refreshRecoveryBinding() }} disabled={busyAction} aria-label="Refresh fresh review binding status">
                    <RefreshCw size={14} /> Refresh binding
                  </Pressable>
                ) : review.recovery.available ? (
                  <Pressable variant="primary" onPress={() => { void createFreshReview() }} disabled={busyAction} aria-label="Create fresh review">
                    <RefreshCw size={14} /> Create fresh review
                  </Pressable>
                ) : review.status === 'approved' ? (
                  <Pressable variant="secondary" onPress={() => { void returnToParent() }} disabled={!canReturn || busyAction} aria-label="Return to parent version">
                    <RotateCcw size={14} /> Return to parent
                  </Pressable>
                ) : (
                  <Pressable variant="secondary" onPress={() => { void refreshReview() }} disabled={busyAction} aria-label="Refresh decision status">
                    <RefreshCw size={14} /> Refresh status
                  </Pressable>
                )}
              </div>
              {!recoveryBridgePresent && !review.recovery.available && !canReturn && review.status === 'approved' && (
                <p className="mt-2 text-center text-micro leading-relaxed text-white/35">
                  {activeReadback.error
                    ? 'Active-version readback failed. Return remains disabled.'
                    : activeReadback.loading
                      ? 'Checking the exact active version before Return is enabled.'
                      : 'Return remains disabled until the active version matches this accepted candidate.'}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-violet-200/85">
                  <Sparkles size={14} />
                  <Eyebrow tone="accent">{VIDEO_GATE_LABEL[review.gate] || 'Review'} ready</Eyebrow>
                </div>
                <span className="text-micro text-white/35">{MODE_LABEL[review.mode] || 'Unknown mode'} · {PLATFORM_LABEL[review.platform] || 'Unknown platform'}</span>
              </div>
              <h1 className="mt-2 text-lede font-semibold leading-tight text-white/92 [@media(max-height:760px)]:mt-1">{copy.title}</h1>
              {copy.direction ? (
                <p className="mt-2 text-label leading-relaxed text-white/54 [@media(max-height:760px)]:mt-1 [@media(max-height:760px)]:line-clamp-2"><strong className="text-white/75">You asked:</strong> “{copy.direction}”</p>
              ) : copy.summary ? (
                <p className="mt-2 text-label leading-relaxed text-white/54">{copy.summary}</p>
              ) : null}

              {prepareStopped && review.prepare_command && (
                <div data-testid="video-prior-prepare" className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-label leading-relaxed text-amber-100/80" role="status" aria-live="polite">
                  <p><strong>Previous direction {review.prepare_command.status}.</strong> No child review was created, so this review and its decision choices are unchanged.</p>
                  <p className="mt-1 break-all text-micro text-amber-100/55">
                    Command {review.prepare_command.id} · {review.prepare_command.safe_code || 'no safe code'}
                  </p>
                </div>
              )}

              {(copy.range || copy.changes.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-1.5 [@media(max-height:760px)]:hidden" aria-label="Changes made">
                  {[copy.range, ...copy.changes].filter(Boolean).map((change, index) => (
                    <span key={`${change}-${index}`} className="inline-flex min-h-[28px] items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 text-micro text-white/58">
                      <span className="h-1 w-1 rounded-full bg-violet-300" />{change}
                    </span>
                  ))}
                </div>
              )}

              <button
                type="button"
                data-testid="video-gates-toggle"
                aria-expanded={gatesOpen}
                aria-controls="video-blocking-gates"
                onClick={() => { setGatesOpen(value => !value); h.select() }}
                className={`mt-3 flex min-h-[44px] w-full items-center justify-between rounded-xl border px-3 text-left text-label font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50 [@media(max-height:760px)]:mt-2 [@media(max-height:760px)]:min-h-[38px] ${allPassed ? 'border-emerald-300/15 bg-emerald-300/[0.045] text-emerald-100/80' : blocked ? 'border-rose-300/20 bg-rose-300/[0.05] text-rose-100/85' : 'border-amber-300/20 bg-amber-300/[0.05] text-amber-100/85'}`}
              >
                <span>{gateSummary}</span>
                <span className="text-micro opacity-65">{gatesOpen ? 'Hide' : 'View'}</span>
              </button>

              {gatesOpen && (
                <div id="video-blocking-gates" data-testid="video-blocking-gates" className="mt-2 rounded-xl border border-white/[0.07] bg-white/[0.018] p-2" role="list" aria-label="Blocking gate results">
                  {gates.map(gate => (
                    <div key={gate.key} role="listitem" className="flex min-h-[36px] items-start gap-2 rounded-lg px-2 py-2 text-label">
                      {gate.status === 'passed'
                        ? <Check size={14} className="mt-0.5 flex-shrink-0 text-emerald-300" />
                        : gate.status === 'blocked'
                          ? <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-rose-300" />
                          : <Clock size={14} className="mt-0.5 flex-shrink-0 text-amber-300" />}
                      <span className="min-w-0">
                        <strong className="font-semibold text-white/78">{gate.label}</strong>
                        <span className="ml-1.5 text-white/38">{gate.status === 'passed' ? 'Passed' : gate.status === 'blocked' ? 'Blocked' : 'Pending'}</span>
                        {gate.detail && <span className="mt-0.5 block leading-relaxed text-white/42">{gate.detail}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {(notice || mutationError || stale) && (
                <div className={`mt-3 rounded-xl border px-3 py-2 text-label leading-relaxed ${mutationError ? 'border-amber-300/20 bg-amber-300/[0.06] text-amber-100' : 'border-emerald-300/15 bg-emerald-300/[0.05] text-emerald-100/80'}`} role="status" aria-live="polite">
                  {mutationError || notice}
                  {stale && (
                    <button type="button" onClick={() => void refreshReview()} className="ml-2 min-h-[36px] font-semibold underline underline-offset-4">Refresh review</button>
                  )}
                </div>
              )}

              {review.gate === 'learning' ? (
                <div className="mt-3" data-testid="video-learning-confirmation">
                  <p className="mb-2 text-micro leading-relaxed text-white/45">Does this learning accurately describe what you meant?</p>
                  {correctingLearning ? (
                    <>
                      <label htmlFor="video-learning-correction" className="sr-only">Correct the inferred learning</label>
                      <textarea
                        id="video-learning-correction"
                        value={learningCorrection}
                        onChange={event => setLearningCorrection(event.target.value.slice(0, 1_600))}
                        rows={2}
                        autoFocus
                        placeholder="Write the precise learning to keep"
                        className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-[16px] leading-relaxed text-white/85 outline-none placeholder:text-white/28 focus:border-violet-300/35 focus:ring-2 focus:ring-violet-300/15"
                      />
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Pressable variant="secondary" onPress={() => setCorrectingLearning(false)} disabled={busyAction}>Cancel</Pressable>
                        <Pressable
                          variant="primary"
                          onPress={() => { void submitDecision('use_candidate', { action: 'correct', correction: learningCorrection.trim() }) }}
                          disabled={!canUse || busyAction || !learningCorrection.trim()}
                        >Use correction</Pressable>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <Pressable
                          variant="secondary"
                          onPress={() => { void submitDecision('keep_current', { action: 'observe_only' }) }}
                          disabled={!canKeep || busyAction}
                        >Observe only</Pressable>
                        <Pressable
                          variant="primary"
                          onPress={() => { void submitDecision('use_candidate', { action: 'confirm' }) }}
                          disabled={!canUse || busyAction}
                        >Confirm learning</Pressable>
                      </div>
                      <Pressable
                        variant="ghost"
                        onPress={() => setCorrectingLearning(true)}
                        disabled={!canUse || busyAction}
                        className="mt-1 min-h-[42px] w-full text-label text-violet-200/78"
                      >Correct the wording</Pressable>
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-2 [@media(max-height:760px)]:mt-2">
                  <Pressable variant="secondary" onPress={() => { void submitDecision('keep_current') }} disabled={!canKeep || busyAction}>Keep current</Pressable>
                  <Pressable variant="primary" onPress={() => { void submitDecision('use_candidate') }} disabled={!canUse || busyAction}>{actionLabel(review)}</Pressable>
                </div>
              )}
              {!allPassed && (
                <p className="mt-2 text-center text-micro leading-relaxed text-white/38">Every blocking check must pass before a candidate can be used.</p>
              )}
              {!bindingsComplete && (
                <p className="mt-2 text-center text-micro leading-relaxed text-amber-100/65">Exact version binding is incomplete. Refresh before deciding.</p>
              )}
              {prepareStopped ? (
                <Pressable
                  variant="primary"
                  onPress={directDifferentChange}
                  className="mt-2 min-h-[46px] w-full rounded-xl text-label font-semibold"
                >
                  <Mic size={14} /> Direct a new direction
                </Pressable>
              ) : (
                <Pressable
                  variant="ghost"
                  onPress={() => setSheetOpen(true)}
                  className="mt-2 min-h-[46px] w-full rounded-xl text-label font-semibold text-violet-200/80 transition-colors hover:bg-violet-300/[0.05] [@media(max-height:760px)]:hidden"
                >
                  <Mic size={14} /> Direct another change
                </Pressable>
              )}
            </>
          )}
        </section>
      </div>

      <MagicDirectionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        review={review}
        container={sheetHost || undefined}
        onQueued={(instruction, commandId) => {
          setQueuedInstruction(instruction)
          setQueuedCommandId(commandId)
          setNotice(null)
          setMutationError(null)
          window.setTimeout(() => void refresh(), 650)
        }}
        onStale={() => { setStale(true); setMutationError('A newer version exists. Refresh before sending this direction.') }}
        onRefresh={refreshReview}
      />
    </div>
  )
}
