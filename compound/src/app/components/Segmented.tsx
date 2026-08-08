import { useSplit } from "../DeviceProvider";

export interface Choice {
  id: string;
  name: string;
  /** A shorter name for the phone track, where widths are equal and tight. */
  short?: string;
  count?: number;
}

/**
 * One choice out of a short list.
 *
 * A phone gets a segmented control: a single tinted track, equal segments, one
 * horizontal scroll if the names run long. Nothing wraps onto a second row and
 * jumps the content down the screen. A desktop gets filter pills, which wrap
 * happily because there is width to wrap into and a hover state to explain
 * that they are pressable.
 */
export function Segmented({
  label,
  choices,
  value,
  onChange,
  wrap = false,
  size,
}: {
  label: string;
  choices: readonly Choice[];
  value: string;
  onChange: (id: string) => void;
  /** Long names that will not fit one phone row go two across instead. */
  wrap?: boolean;
  /** "sm" shrinks the labels for a secondary, lower-emphasis control. */
  size?: "sm";
}) {
  const split = useSplit();
  const className = ["seg", wrap && !split ? "two" : "", size === "sm" ? "sm" : ""].filter(Boolean).join(" ");
  return (
    <div className={className} role="group" aria-label={label}>
      {choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          className={value === choice.id ? "on" : ""}
          aria-pressed={value === choice.id}
          onClick={() => onChange(choice.id)}
        >
          {!split && choice.short ? choice.short : choice.name}
          {choice.count != null && <span className="count">{split ? choice.count : `(${choice.count})`}</span>}
        </button>
      ))}
    </div>
  );
}
