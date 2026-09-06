import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cash on hand belongs to the member, not the browser, so it is a row in
 * compound.cash_balances under RLS. One row per date; saving the same date
 * twice replaces the figure. The Spend tab reads the latest row through the
 * spend API, and the Settings sheet writes it here with the member's own
 * session. If the write fails the caller is told, the same as view settings.
 */

export interface CashBalance {
  /** ISO date the balance was true on. */
  asOf: string;
  amountUsd: number;
}

export interface CashBalanceInput extends CashBalance {
  note?: string | null;
}

interface CashRow {
  as_of: string;
  amount_usd: number | string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkInput(input: CashBalanceInput): void {
  if (!ISO_DATE.test(input.asOf) || Number.isNaN(new Date(`${input.asOf}T00:00:00Z`).getTime())) {
    throw new Error("The date needs to be a real day, written as year, month and day.");
  }
  if (!Number.isFinite(input.amountUsd) || input.amountUsd < 0) {
    throw new Error("Cash on hand needs to be a number of dollars, zero or more.");
  }
}

export async function loadLatestBalance(client: SupabaseClient, userId: string): Promise<CashBalance | null> {
  const { data, error } = await client
    .schema("compound")
    .from("cash_balances")
    .select("as_of, amount_usd")
    .eq("user_id", userId)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle<CashRow>();

  if (error) throw new Error(`Your cash balance could not be read: ${error.message}`);
  if (!data) return null;
  const amount = typeof data.amount_usd === "number" ? data.amount_usd : Number(data.amount_usd);
  if (!Number.isFinite(amount)) return null;
  return { asOf: data.as_of, amountUsd: amount };
}

export async function saveBalance(client: SupabaseClient, userId: string, input: CashBalanceInput): Promise<void> {
  checkInput(input);
  const { error } = await client
    .schema("compound")
    .from("cash_balances")
    .upsert(
      { user_id: userId, as_of: input.asOf, amount_usd: input.amountUsd, note: input.note ?? null },
      { onConflict: "user_id,as_of" },
    );

  if (error) throw new Error(`That balance was not saved to your account: ${error.message}`);
}

/** The row that is true most recently. Ties go to the second argument, the one just saved. */
export function latestBalance(a: CashBalance | null, b: CashBalance | null): CashBalance | null {
  if (!a) return b;
  if (!b) return a;
  return b.asOf >= a.asOf ? b : a;
}
