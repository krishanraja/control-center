import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Pause, Play, Volume2, VolumeX } from '@/lib/icons'
import { SegmentedNav } from '../shared/SegmentedNav'
import { useHaptics } from '../../hooks/useHaptics'
import { useReducedMotion } from '../shared/motion'
import { safeVideoProxyUrl, type VideoStudioComparison, type VideoStudioProxy, type VideoStudioSeries } from '../../lib/videoStudio'
import { VideoBrandLockup } from './VideoBrandLockup'

type View = 'before' | 'after'

function proxyUrl(proxy: VideoStudioProxy | undefined): string | null {
  return safeVideoProxyUrl(proxy?.url)
}

export function VideoCompareStage({
  comparison,
  fallbackAfter,
  title,
  series,
}: {
  comparison: VideoStudioComparison
  fallbackAfter?: VideoStudioProxy
  title: string
  series: VideoStudioSeries
}) {
  const beforeUrl = proxyUrl(comparison.before)
  const afterUrl = proxyUrl(comparison.after) || proxyUrl(fallbackAfter)
  const bothAvailable = Boolean(beforeUrl && afterUrl)
  const exact = bothAvailable && comparison.alignment === 'exact'
  const [view, setView] = useState<View>(afterUrl ? 'after' : 'before')
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [failed, setFailed] = useState<Record<View, boolean>>({ before: false, after: false })
  const heldFrom = useRef<View | null>(null)
  const beforeRef = useRef<HTMLVideoElement>(null)
  const afterRef = useRef<HTMLVideoElement>(null)
  const h = useHaptics()
  const reduced = useReducedMotion()

  useEffect(() => setFailed({ before: false, after: false }), [beforeUrl, afterUrl])
  useEffect(() => {
    if (!afterUrl && beforeUrl) setView('before')
    if (!beforeUrl && afterUrl) setView('after')
  }, [afterUrl, beforeUrl])

  const synchronise = (source: HTMLVideoElement, target: HTMLVideoElement | null) => {
    if (!target || !Number.isFinite(source.currentTime)) return
    if (Math.abs(target.currentTime - source.currentTime) > 0.12) target.currentTime = source.currentTime
  }

  const choose = (next: View) => {
    const source = view === 'before' ? beforeRef.current : afterRef.current
    const target = next === 'before' ? beforeRef.current : afterRef.current
    if (!target || next === view) return
    if (exact && source) synchronise(source, target)
    else target.currentTime = 0
    source?.pause()
    setView(next)
    if (playing) void target.play().catch(() => setPlaying(false))
    h.select()
  }

  const togglePlay = () => {
    const active = view === 'before' ? beforeRef.current : afterRef.current
    if (!active) return
    if (playing) {
      beforeRef.current?.pause()
      afterRef.current?.pause()
      setPlaying(false)
    } else {
      void active.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
    h.tap()
  }

  useEffect(() => {
    const before = beforeRef.current
    const after = afterRef.current
    if (before) before.muted = muted || view !== 'before'
    if (after) after.muted = muted || view !== 'after'
  }, [muted, view])

  // Autoplay is muted and limited to the one selected proxy. Reduced-motion
  // users receive a still frame and an explicit Play control instead.
  useEffect(() => {
    const reduceNow = reduced || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduceNow) {
      beforeRef.current?.pause()
      afterRef.current?.pause()
      setPlaying(false)
      return
    }
    const video = view === 'before' ? beforeRef.current : afterRef.current
    if (!video) return
    video.muted = true
    void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    return () => video.pause()
  }, [afterUrl, beforeUrl, reduced])

  const beginPeek = (event: ReactPointerEvent) => {
    if (!exact || view !== 'after' || (event.target as Element).closest('button')) return
    heldFrom.current = view
    const after = afterRef.current
    const before = beforeRef.current
    if (after && before) synchronise(after, before)
    after?.pause()
    before?.pause()
    setView('before')
    h.impactLight()
  }

  const endPeek = () => {
    if (!heldFrom.current) return
    heldFrom.current = null
    const before = beforeRef.current
    const after = afterRef.current
    if (before && after) synchronise(before, after)
    setView('after')
    if (playing) void after?.play().catch(() => setPlaying(false))
  }

  const hasAnyPreview = Boolean(beforeUrl || afterUrl)
  const unavailable = comparison.state === 'expired' || comparison.state === 'unavailable' || !hasAnyPreview
  const activeFailed = failed[view]

  return (
    <section
      className="relative flex-1 min-h-0 overflow-hidden bg-sunk"
      aria-label="Video comparison"
      onPointerDown={beginPeek}
      onPointerUp={endPeek}
      onPointerCancel={endPeek}
      onPointerLeave={endPeek}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_48%_30%,rgb(var(--accent)/0.18),transparent_48%)]" />

      <VideoBrandLockup
        series={series}
        placement="preview"
        className="pointer-events-none absolute left-3 top-3 z-10"
      />

      {beforeUrl && (
        <video
          ref={beforeRef}
          src={beforeUrl}
          playsInline
          preload="metadata"
          loop
          muted={muted || view !== 'before'}
          aria-label={`Before edit preview for ${title}`}
          onPlay={() => { if (view === 'before') setPlaying(true) }}
          onPause={() => { if (view === 'before' && !heldFrom.current) setPlaying(false) }}
          onTimeUpdate={event => { if (exact && view === 'before') synchronise(event.currentTarget, afterRef.current) }}
          onError={() => setFailed(value => ({ ...value, before: true }))}
          className={`absolute inset-0 h-full w-full object-contain ${reduced ? 'transition-none' : 'transition-opacity duration-150'} ${view === 'before' ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        />
      )}
      {afterUrl && (
        <video
          ref={afterRef}
          src={afterUrl}
          playsInline
          preload="metadata"
          loop
          muted={muted || view !== 'after'}
          aria-label={`After edit preview for ${title}`}
          onPlay={() => { if (view === 'after') setPlaying(true) }}
          onPause={() => { if (view === 'after' && !heldFrom.current) setPlaying(false) }}
          onTimeUpdate={event => { if (exact && view === 'after') synchronise(event.currentTarget, beforeRef.current) }}
          onError={() => setFailed(value => ({ ...value, after: true }))}
          className={`absolute inset-0 h-full w-full object-contain ${reduced ? 'transition-none' : 'transition-opacity duration-150'} ${view === 'after' ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        />
      )}

      {(unavailable || activeFailed) && (
        <div className="absolute inset-0 grid place-items-center px-8 text-center" role="status">
          <div>
            <p className="text-body font-semibold text-white/80">
              {comparison.state === 'expired' ? 'This private preview expired' : activeFailed ? 'This preview could not play' : 'No preview is available yet'}
            </p>
            <p className="mt-1 text-label leading-relaxed text-white/45">
              Refresh to request a new private viewing link. Your source media has not moved.
            </p>
          </div>
        </div>
      )}

      {bothAvailable && (
        <SegmentedNav<View>
          segments={[{ id: 'before', label: 'Before' }, { id: 'after', label: 'After' }]}
          value={view}
          onChange={choose}
          label="Compare video versions"
          variant="segmented"
          testIdPrefix="video-compare"
          className="absolute bottom-4 left-1/2 z-10 w-[154px] -translate-x-1/2 rounded-full border-white/10 bg-black/65 p-1 shadow-e2 backdrop-blur-xl [&>button]:min-h-[42px] [&>button]:rounded-full"
        />
      )}

      {hasAnyPreview && (
        <div data-testid="video-preview-controls" className="absolute right-3 top-[56px] z-10 flex gap-1.5 sm:top-3">
          <button
            type="button"
            onPointerDown={() => h.press()}
            onClick={togglePlay}
            aria-label={playing ? 'Pause preview' : 'Play preview'}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-black/60 text-white/85 backdrop-blur-xl press-effect"
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            type="button"
            onPointerDown={() => h.press()}
            onClick={() => setMuted(value => !value)}
            aria-label={muted ? 'Turn preview sound on' : 'Mute preview'}
            aria-pressed={!muted}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-black/60 text-white/85 backdrop-blur-xl press-effect"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      )}

      {exact && view === 'after' && (
        <p className="absolute bottom-[68px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/[0.08] bg-black/55 px-2.5 py-1 text-micro font-medium text-white/55 backdrop-blur-lg">
          Hold the picture for Before
        </p>
      )}
      {bothAvailable && !exact && (
        <p className="absolute bottom-[68px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-300/10 bg-black/55 px-2.5 py-1 text-micro text-amber-100/70 backdrop-blur-lg">
          Separate previews. Timing is not aligned.
        </p>
      )}
    </section>
  )
}
