/** Number formatting. Every displayed number keeps its units visible. */

export function pct1(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function plain1(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(1)}%`;
}

export function tone(value: number | null | undefined): "up" | "dn" | "mut" {
  if (value == null || !Number.isFinite(value) || value === 0) return "mut";
  return value > 0 ? "up" : "dn";
}

export function aud(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `A$${Math.round(value).toLocaleString("en-AU")}`;
}

export function usd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const size = Math.abs(value);
  if (size >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (size >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (size >= 1e6) return `$${Math.round(value / 1e6)}M`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function ratio(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

/**
 * "2026-08-06" reads as "Thursday 6 August 2026". Formatted in UTC because a
 * bare date parses as UTC midnight and would slip a day west of Greenwich.
 */
export function longDate(iso: string): string {
  const parsed = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Bar width as a share of the largest magnitude in a comparison set. */
export function barWidth(value: number, peak: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(peak) || peak === 0) return "0%";
  const share = Math.min(100, Math.max(2, (Math.abs(value) / Math.abs(peak)) * 100));
  return `${share.toFixed(0)}%`;
}
