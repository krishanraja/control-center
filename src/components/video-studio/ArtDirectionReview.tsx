import { useState } from 'react'
import type { VideoStudioArtDirection } from '../../lib/videoStudio'

export function ArtDirectionReview({
  direction,
  onDirect,
}: {
  direction: VideoStudioArtDirection
  onDirect: (instruction: string) => void
}) {
  const [openBeat, setOpenBeat] = useState<string | null>(direction.beats[0]?.beat_id || null)

  return (
    <section className="mt-3" aria-labelledby="art-direction-title" data-testid="art-direction-review">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="art-direction-title" className="text-micro font-semibold uppercase tracking-[0.14em] text-white/46">Visual choreography</h2>
        <span className="text-micro text-white/30">Library v{direction.registry_version}</span>
      </div>
      <div className="mt-2 grid gap-1.5">
        {direction.beats.map(beat => {
          const open = openBeat === beat.beat_id
          const activeName = beat.primary?.name || beat.invention?.name || 'Direction needed'
          return (
            <article key={beat.beat_id} className={`overflow-hidden rounded-xl border ${beat.invention ? 'border-amber-300/25 bg-amber-300/[0.045]' : 'border-white/[0.07] bg-white/[0.02]'}`}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenBeat(current => current === beat.beat_id ? null : beat.beat_id)}
                className="grid min-h-[48px] w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-300/50"
              >
                <span className="min-w-0">
                  <span className="block break-words text-micro font-semibold text-white/38">{beat.beat_label}</span>
                  <span className="mt-0.5 block break-words text-label font-semibold text-white/84">{activeName}</span>
                </span>
                <span className="text-micro text-white/40">{open ? 'Close' : 'View'}</span>
              </button>
              {open && (
                <div className="border-t border-white/[0.06] px-3 pb-3 pt-2.5">
                  {beat.primary ? (
                    <>
                      <p className="break-words text-label leading-relaxed text-white/58">{beat.primary.rationale}</p>
                      {beat.primary.experimental && <p className="mt-1 text-micro font-semibold text-amber-200/80">Experimental treatment</p>}
                    </>
                  ) : beat.invention ? (
                    <div data-testid="art-direction-invention">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-micro font-semibold text-amber-100">Sharp alternative</span>
                        <span className="text-micro text-white/38">Styleframes + animatic required</span>
                      </div>
                      <p className="mt-2 break-words text-label leading-relaxed text-white/58">{beat.invention.gap}</p>
                      <p className="mt-1 break-words text-label leading-relaxed text-white/78">{beat.invention.mechanism}</p>
                    </div>
                  ) : null}

                  {beat.supporting.length > 0 && (
                    <div className="mt-3">
                      <p className="text-micro font-semibold text-white/35">Also in this beat</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {beat.supporting.map(device => (
                          <span key={device.technique_id} className="max-w-full break-words rounded-full border border-white/[0.08] bg-white/[0.025] px-2.5 py-1 text-micro text-white/58">
                            {device.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {beat.alternatives.length > 0 && (
                    <div className="mt-3">
                      <p className="text-micro font-semibold text-white/35">Alternatives</p>
                      <div className="mt-1.5 grid gap-1.5">
                        {beat.alternatives.map(alternative => (
                          <button
                            key={alternative.technique_id}
                            type="button"
                            onClick={() => onDirect(`On ${beat.beat_label}, replace the current visual device with ${alternative.name}. Preserve truth, rights, spoken wording, protected presenter space and the approved narrative beat.`)}
                            className="min-h-[44px] rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50"
                          >
                            <span className="block break-words text-label font-semibold text-white/72">Try {alternative.name}</span>
                            <span className="mt-0.5 block break-words text-micro leading-relaxed text-white/38">{alternative.rationale}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => onDirect(`Simplify ${beat.beat_label}. Use the minimum visual treatment that preserves proof, comprehension, face safety, caption safety and the approved narrative beat.`)}
                    className="mt-2 min-h-[44px] w-full rounded-lg px-3 text-left text-label font-semibold text-violet-200/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50"
                  >
                    Simplify this beat
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
