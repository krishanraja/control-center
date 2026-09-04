import { FLAGS, type SpendItemInput } from "../types.ts";

/**
 * Two inboxes are read by two parsers, so the same receipt can arrive twice.
 * The sheet is canonical. A Control Center invoice that matches a sheet row is
 * superseded (kept, hidden from totals, linked to the row that won). Matching
 * is tiered because Gmail message ids are per mailbox: an exact id only
 * matches when both parsers read the same mailbox.
 */

/** Amount-and-date matches supersede as well as flag. Flip off if the dry run shows it misfiring. */
export const FUZZY_SUPERSEDES = true;

const TIER1_DAYS = 3;
const TIER1_AMOUNT = 0.01;
const TIER2_DAYS = 10;
const TIER2_PCT = 0.02;

export function extractGmailId(source: string | null | undefined): string | null {
  const text = (source ?? "").trim();
  if (!text) return null;
  if (/^[0-9a-f]{16}$/i.test(text)) return text.toLowerCase();
  const gmail = text.match(/#(?:all|inbox|sent|starred|imp|search\/[^/]+|label\/[^/]+)\/([0-9a-f]{16})(?:$|[?&#/])/i);
  if (gmail) return gmail[1].toLowerCase();
  return null;
}

function dayDiff(a: string, b: string): number {
  return Math.abs((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

function addFlag(item: SpendItemInput, flag: string): void {
  if (!item.flags.includes(flag)) item.flags.push(flag);
}

function refOf(item: SpendItemInput): string {
  return `${item.source}:${item.source_ref}`;
}

function supersede(cc: SpendItemInput, sheet: SpendItemInput, byAmount: boolean): void {
  cc.superseded_by_ref = refOf(sheet);
  if (byAmount) addFlag(cc, FLAGS.matchedByAmount);
}

export interface DedupeStats {
  exact: number;
  tier1: number;
  tier2: number;
  pairs: Array<{ tier: 1 | 2; sheet: string; inbox: string; merchant: string; amount: number | null; days: number }>;
}

/** Mutates the items in place and returns what it did, so the run log can show the pairs. */
export function dedupeItems(items: SpendItemInput[]): DedupeStats {
  const stats: DedupeStats = { exact: 0, tier1: 0, tier2: 0, pairs: [] };
  const sheet = items.filter((item) => item.source === "bills_sheet" && !item.hidden);
  const inbox = items.filter((item) => item.source === "cc_invoices" && !item.hidden);
  const claimed = new Set<string>();

  const sheetByMessage = new Map<string, SpendItemInput>();
  for (const row of sheet) if (row.message_id) sheetByMessage.set(row.message_id, row);

  for (const cc of inbox) {
    const match = sheetByMessage.get(cc.source_ref) ?? (cc.message_id ? sheetByMessage.get(cc.message_id) : undefined);
    if (match) {
      supersede(cc, match, false);
      claimed.add(refOf(match));
      stats.exact += 1;
    }
  }

  // Tier 1: same merchant, same currency, same amount to the cent, within three days. One to one, closest date first.
  const candidates: Array<{ cc: SpendItemInput; row: SpendItemInput; days: number }> = [];
  for (const cc of inbox) {
    if (cc.superseded_by_ref || cc.amount == null) continue;
    for (const row of sheet) {
      if (row.amount == null || row.merchant_key !== cc.merchant_key || (row.currency ?? "") !== (cc.currency ?? "")) continue;
      if (Math.abs(row.amount - cc.amount) > TIER1_AMOUNT) continue;
      const days = dayDiff(row.occurred_on, cc.occurred_on);
      if (days <= TIER1_DAYS) candidates.push({ cc, row, days });
    }
  }
  candidates.sort((a, b) => a.days - b.days);
  const ccClaimed = new Set<string>();
  for (const pair of candidates) {
    if (ccClaimed.has(refOf(pair.cc)) || claimed.has(refOf(pair.row))) continue;
    ccClaimed.add(refOf(pair.cc));
    claimed.add(refOf(pair.row));
    stats.tier1 += 1;
    stats.pairs.push({ tier: 1, sheet: pair.row.source_ref, inbox: pair.cc.source_ref, merchant: pair.cc.merchant_key, amount: pair.cc.amount, days: pair.days });
    if (FUZZY_SUPERSEDES) supersede(pair.cc, pair.row, true);
    else {
      addFlag(pair.cc, FLAGS.possibleDuplicate);
      pair.cc.possible_duplicate_of_ref = refOf(pair.row);
    }
  }

  // Tier 2: same merchant across sources, amount within two percent and ten days. Both stay and count; both are marked.
  for (const cc of inbox) {
    if (cc.superseded_by_ref || cc.amount == null) continue;
    for (const row of sheet) {
      if (row.amount == null || row.merchant_key !== cc.merchant_key || claimed.has(refOf(row))) continue;
      const scale = Math.max(row.amount, cc.amount, 0.01);
      if (Math.abs(row.amount - cc.amount) / scale > TIER2_PCT) continue;
      const days = dayDiff(row.occurred_on, cc.occurred_on);
      if (days > TIER2_DAYS) continue;
      addFlag(cc, FLAGS.possibleDuplicate);
      addFlag(row, FLAGS.possibleDuplicate);
      cc.possible_duplicate_of_ref = refOf(row);
      row.possible_duplicate_of_ref = refOf(cc);
      stats.tier2 += 1;
      stats.pairs.push({ tier: 2, sheet: row.source_ref, inbox: cc.source_ref, merchant: cc.merchant_key, amount: cc.amount, days });
      break;
    }
  }

  return stats;
}
