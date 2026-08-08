import { SIGNAL_ORDER, agreementLabel } from "../../lib/agreement";
import { CHECK_NAME, EXPLAIN } from "../../lib/words";
import type { AgreementRow } from "../../types";

/**
 * Four bars, one per check, always in the same order. Green points up, red
 * points down, grey has nothing to say. The strip reads without the words
 * beside it, which is why the label is optional.
 */
export function AgreementMeter({ row, showLabel = true }: { row: AgreementRow | undefined; showLabel?: boolean }) {
  if (!row) return null;
  const label = agreementLabel(row);
  const description = SIGNAL_ORDER
    .map((key) => `${CHECK_NAME[key]} ${row.signals[key] > 0 ? "up" : row.signals[key] < 0 ? "down" : "no view"}`)
    .join(", ");

  return (
    <div className="agree">
      <div className="dots" role="img" aria-label={`${label}. ${description}.`}>
        {SIGNAL_ORDER.map((key) => (
          <i key={key} className={row.signals[key] > 0 ? "u" : row.signals[key] < 0 ? "d" : ""} />
        ))}
      </div>
      {showLabel && <span className="lab">{label}</span>}
    </div>
  );
}

/** The key. It names the four checks and says what the colours mean. */
export function AgreementKey() {
  return (
    <div className="agreekey">
      {SIGNAL_ORDER.map((key) => (
        <span key={key}><i aria-hidden="true" />{CHECK_NAME[key]}</span>
      ))}
      <span className="keynote">{EXPLAIN.checks}</span>
    </div>
  );
}
