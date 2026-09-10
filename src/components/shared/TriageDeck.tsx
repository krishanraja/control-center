import { useSwipeTriage } from '../../hooks/useSwipeTriage'
import { SwipeDeck } from './SwipeDeck'
import { reasonsFor } from '../../lib/triageReasons'
import type { TriageConfig } from '../../lib/triageConfig'

/**
 * TriageDeck — the narrow half of the pair, and the piece that was missing.
 *
 * `SwipeCockpit` takes a `TriageConfig` and spends a desktop's landscape on
 * rails around the shared `SwipeDeck`. There was no equivalent for a phone, so
 * every narrow surface wired `useSwipeTriage` to `SwipeDeck` by hand and
 * restated the config it already had: `MobileGuests` carries accept/reject
 * handlers and card bodies that are the same logic and the same toasts as
 * `buildGuestsTriageConfig`, which it never imports.
 *
 * One config, two shells. A surface picks the shell by viewport and nothing
 * else, so the two device classes cannot drift in what a verdict does or what
 * a card says.
 */
export function TriageDeck<T>({ config, onExit }: { config: TriageConfig<T>; onExit?: () => void }) {
  const triage = useSwipeTriage<T>({
    items: config.items,
    getId: config.getId,
    loading: config.loading,
    onAccept: config.onAccept,
    onReject: config.onReject,
  })

  return (
    <SwipeDeck<T>
      narrow
      deck={triage.deck}
      getId={config.getId}
      renderBody={config.renderBody}
      ariaLabel={config.ariaLabel}
      // The config already names the surface for its reason chips, and the same
      // key answers "why is this here", so the badge comes for free.
      why={t => ({ table: config.reasonsTable, row: t as Record<string, unknown> })}
      onAccept={triage.accept}
      onReject={triage.reject}
      leftLabel={config.leftLabel}
      rightLabel={config.rightLabel}
      rightIntent={config.rightIntent}
      pending={triage.pending}
      reasonChips={() => reasonsFor(config.reasonsTable)}
      onChooseReason={triage.chooseReason}
      onCancelPending={triage.cancelPending}
      remaining={triage.remaining}
      triagedCount={triage.triagedCount}
      onExit={onExit}
      title={config.title}
    />
  )
}
