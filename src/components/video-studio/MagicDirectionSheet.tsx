import { useEffect, useRef, useState } from 'react'
import { Mic, Sparkles, X } from '@/lib/icons'
import { BottomSheet } from '../mobile/BottomSheet'
import { Pressable } from '../shared/Pressable'
import { VoiceField } from '../pilot/controls'
import { useHaptics } from '../../hooks/useHaptics'
import {
  VideoStudioApiError,
  directVideoStudioEdit,
  normaliseVideoStudioTarget,
  videoStudioIdempotencyKey,
  videoStudioSubmittedAt,
  type VideoStudioReview,
} from '../../lib/videoStudio'

const RECIPES = [
  { label: 'Proof sooner', instruction: 'Bring the strongest verified proof earlier without covering the speaker.' },
  { label: 'Tighter captions', instruction: 'Tighten the captions by removing filler and duplication without adding or changing any spoken word.' },
  { label: 'Stronger ending', instruction: 'Find the strongest truthful ending and finish on it without changing the meaning.' },
  { label: 'More visual story', instruction: 'Use more relevant evidence and visual storytelling while keeping the speaker and the point easy to follow.' },
] as const

export function MagicDirectionSheet({
  open,
  onClose,
  review,
  container,
  onQueued,
  onStale,
  onRefresh,
}: {
  open: boolean
  onClose: () => void
  review: VideoStudioReview
  container?: HTMLElement
  onQueued: (instruction: string, commandId: string) => void
  onStale: (error: VideoStudioApiError) => void
  onRefresh: () => void | Promise<void>
}) {
  const [instruction, setInstruction] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // A retry of an uncertain request keeps the same key. Editing the intent
  // changes its fingerprint and earns a new key, so two different directions
  // can never collide under one idempotency identity.
  const submission = useRef<{ fingerprint: string; key: string; submittedAt: string } | null>(null)
  const inFlight = useRef(false)
  const h = useHaptics()
  const target = normaliseVideoStudioTarget(review.review_payload.target)
  const semanticHash = typeof review.review_payload.semantic_target_map_hash === 'string'
    && /^[a-f0-9]{64}$/.test(review.review_payload.semantic_target_map_hash)
    ? review.review_payload.semantic_target_map_hash
    : null
  const cleanInstruction = instruction.trim()
  const canSubmit = cleanInstruction.length >= 3 && cleanInstruction.length <= 600 && Boolean(target && semanticHash)

  useEffect(() => {
    setInstruction('')
    setChosen(null)
    setError(null)
    setErrorCode(null)
    setBusy(false)
    submission.current = null
    inFlight.current = false
  }, [review.id])

  const chooseRecipe = (label: string, value: string) => {
    setChosen(label)
    setInstruction(value)
    setError(null)
    setErrorCode(null)
  }

  const submit = async () => {
    const clean = instruction.trim()
    if (!canSubmit || !target || !semanticHash || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    const fingerprint = JSON.stringify({
      job: review.job_id,
      platform: review.platform,
      parentRevision: review.parent_revision_hash,
      parentArtifact: review.parent_artifact_hash,
      clean,
      target,
      semanticHash,
    })
    if (submission.current?.fingerprint !== fingerprint) {
      submission.current = { fingerprint, key: videoStudioIdempotencyKey(), submittedAt: videoStudioSubmittedAt() }
    }
    setError(null)
    setErrorCode(null)
    try {
      const response = await directVideoStudioEdit(review.job_id, {
        idempotency_key: submission.current.key,
        submitted_at: submission.current.submittedAt,
        source_review_id: review.id,
        platform: review.platform,
        parent_revision_hash: review.parent_revision_hash,
        parent_artifact_hash: review.parent_artifact_hash,
        instruction: clean,
        target,
        semantic_target_map_hash: semanticHash,
      })
      if (response.command.status === 'failed' || response.command.status === 'attention' || response.command.status === 'cancelled') {
        throw new VideoStudioApiError(409, {
          error: { code: `command_${response.command.status}`, message: 'The direction is saved, but the studio runner needs attention before it can continue.' },
        })
      }
      h.notifySuccess()
      onQueued(clean, response.command.id)
      onClose()
    } catch (cause) {
      const apiError = cause instanceof VideoStudioApiError
        ? cause
        : new VideoStudioApiError(0, { error: { code: 'network_error', message: 'The direction could not be queued. Your words are still here.' } })
      if (apiError.code === 'stale_parent') onStale(apiError)
      setErrorCode(apiError.code)
      setError(apiError.code === 'stale_parent'
        ? 'A newer version exists. Your direction is still here. Refresh the review before sending it.'
        : apiError.code === 'idempotency_conflict'
          ? 'That retry no longer matches the original direction. Change the wording slightly, then send it again.'
          : apiError.message)
      h.error()
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      fullHeight={false}
      ariaLabel="Direct another video change"
      container={container}
    >
      <div className="flex max-h-[calc(82dvh/var(--z,1))] flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
        <div className="flex items-center gap-2 pb-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl border border-violet-300/10 bg-violet-400/10 text-violet-200">
            <Sparkles size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-ui font-semibold text-white/90">Direct one change</h2>
            <p className="text-micro text-white/40">Bound to this exact version</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close direction sheet"
            className="grid h-11 w-11 place-items-center rounded-full text-white/50 active:bg-white/[0.08]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-3" aria-label="Direction recipes">
          {RECIPES.map(recipe => (
            <Pressable
              key={recipe.label}
              block={false}
              haptic="select"
              onPress={() => chooseRecipe(recipe.label, recipe.instruction)}
              aria-label={`Choose ${recipe.label}`}
              className={`min-h-[44px] flex-shrink-0 rounded-full border px-3.5 text-label font-semibold transition-colors ${
                chosen === recipe.label
                  ? 'border-violet-300/40 bg-violet-400/20 text-violet-100'
                  : 'border-white/10 bg-white/[0.035] text-white/65'
              }`}
            >
              {recipe.label}
            </Pressable>
          ))}
        </div>

        <VoiceField
          value={instruction}
          onChange={value => { setInstruction(value); setChosen(null); setError(null); setErrorCode(null) }}
          rows={3}
          placeholder="Say or type what should change"
          onEnter={() => { if (canSubmit) void submit() }}
        />
        <p className="mt-2 flex items-center gap-1.5 text-micro leading-relaxed text-white/38">
          <Mic size={12} /> Voice, typing and recipes create the same bounded edit instruction.
        </p>
        {!target || !semanticHash ? (
          <p className="mt-2 text-micro leading-relaxed text-amber-100/70" role="status">This review has no verified edit target. Refresh before sending a direction.</p>
        ) : cleanInstruction.length > 600 ? (
          <p className="mt-2 text-micro leading-relaxed text-amber-100/70" role="status">Keep this direction under 600 characters.</p>
        ) : null}

        {error && (
          <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] px-3 py-2" role="alert">
            <p className="text-label leading-relaxed text-amber-100">{error}</p>
            {errorCode === 'stale_parent' && (
              <button
                type="button"
                onClick={() => void onRefresh()}
                className="mt-2 min-h-[44px] text-label font-semibold text-amber-100 underline underline-offset-4"
              >
                Refresh this review
              </button>
            )}
          </div>
        )}

        <Pressable
          variant="primary"
          onPress={() => { void submit() }}
          disabled={!canSubmit || busy}
          className="btn-contrast mt-4 min-h-[50px] w-full rounded-2xl text-ui font-semibold"
        >
          Send direction
        </Pressable>
      </div>
    </BottomSheet>
  )
}
