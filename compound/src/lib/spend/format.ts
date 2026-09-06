/** Money words for the spend tab. Headlines round; rows keep the cents. */

export function usd2(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function usdRound(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString("en-US")}`;
}

const SYMBOL: Record<string, string> = { AUD: "A$", USD: "US$", EUR: "€", GBP: "£", NZD: "NZ$", CAD: "C$", SGD: "S$", JPY: "¥" };

/** The amount as it was charged, in its own currency. */
export function original(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return currency ? `${currency} n/a` : "no amount";
  const digits = amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!currency) return `${digits} (no currency)`;
  const symbol = SYMBOL[currency.toUpperCase()];
  return symbol ? `${symbol}${digits}` : `${currency.toUpperCase()} ${digits}`;
}

export function monthLabel(month: string): string {
  const parsed = new Date(`${month.slice(0, 7)}-01T00:00:00Z`);
  return parsed.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function shortMonth(month: string): string {
  const parsed = new Date(`${month.slice(0, 7)}-01T00:00:00Z`);
  return parsed.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
}
