import { SIGNAL_ORDER, agreementLabel } from "../../lib/agreement";
import type { AgreementRow } from "../../types";

/**
 * Four bars, one per independent signal, in a fixed order. Green up, red down,
 * grey no opinion. The strip is readable without the words next to it, which is
 * why the label is optional.
 */
export function AgreementMeter({ row, showLabel = true }: { row: AgreementRow | undefined; showLabel?: boolean }) {
  if (!row) return null;
  const label = agreementLabel(row);
  const description = SIGNAL_ORDER
    .map((key) => `${key} ${row.signals[key] > 0 ? "up" : row.signals[key] < 0 ? "down" : "no opinion"}`)
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

export function AgreementKey() {
  return (
    <div className="agreekey" aria-hidden="true">
      {SIGNAL_ORDER.map((key) => <span key={key}><i />{key}</span>)}
    </div>
  );
}
