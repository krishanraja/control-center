import type { LoanRecord, RateRecord } from "./schema";

/**
 * Loan maths. Runs in the browser because every input is a manual fact plus
 * today's date. A variable principal-and-interest loan re-sets its repayment
 * whenever the rate changes, so the schedule is rebuilt segment by segment.
 * When the bank has told us the actual repayment for a segment, that figure
 * wins over the formula.
 */

export interface ScheduleRow {
  /** Payment date, YYYY-MM-DD. */
  date: string;
  opening: number;
  ratePct: number;
  repayment: number;
  interest: number;
  principal: number;
  closing: number;
}

export interface LoanState {
  balance: number;
  principalPaid: number;
  interestPaid: number;
  paymentsMade: number;
  currentRatePct: number;
  currentRepayment: number;
  nextPaymentOn: string | null;
  schedule: ScheduleRow[];
}

export function monthlyRepayment(principal: number, ratePct: number, months: number): number {
  if (months <= 0) return principal;
  const r = ratePct / 100 / 12;
  if (r === 0) return principal / months;
  return principal * r / (1 - Math.pow(1 + r, -months));
}

function addMonths(iso: string, count: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

function rateOn(rates: RateRecord[], date: string, fallback: number): RateRecord | null {
  const applicable = rates.filter((rate) => rate.effectiveFrom <= date).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return applicable.at(-1) ?? (rates[0] ? { ...rates[0], ratePct: fallback } : null);
}

/**
 * Builds the schedule up to and including the last payment on or before asOf.
 * A rate change re-amortises the remaining balance over the remaining term.
 * The bank's stated repayment applies to the first rate segment only; later
 * segments use the formula unless a later rate row carries its own note.
 */
export function amortise(loan: LoanRecord, rates: RateRecord[], asOf: string): LoanState {
  const sortedRates = [...rates].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const firstRate = sortedRates[0]?.ratePct ?? 0;
  let balance = loan.principalAud;
  let paymentDate = loan.firstRepaymentOn;
  let segmentRate: number | null = null;
  let repayment = 0;
  let interestPaid = 0;
  let principalPaid = 0;
  const schedule: ScheduleRow[] = [];
  const interestOnly = loan.repaymentType === "interest_only";

  for (let index = 0; index < loan.termMonths && paymentDate <= asOf && balance > 0.005; index += 1) {
    const rate = rateOn(sortedRates, paymentDate, firstRate)?.ratePct ?? firstRate;
    if (rate !== segmentRate) {
      const remaining = loan.termMonths - index;
      const bankFigure = segmentRate === null && loan.repaymentAud != null ? loan.repaymentAud : null;
      repayment = interestOnly ? balance * rate / 100 / 12 : bankFigure ?? monthlyRepayment(balance, rate, remaining);
      segmentRate = rate;
    }
    const interest = balance * rate / 100 / 12;
    const scheduled = interestOnly ? interest : repayment;
    const payment = Math.min(scheduled, balance + interest);
    const principal = Math.max(0, payment - interest);
    const closing = Math.max(0, balance - principal);
    schedule.push({
      date: paymentDate,
      opening: round2(balance),
      ratePct: rate,
      repayment: round2(payment),
      interest: round2(interest),
      principal: round2(principal),
      closing: round2(closing),
    });
    interestPaid += interest;
    principalPaid += principal;
    balance = closing;
    paymentDate = addMonths(loan.firstRepaymentOn, index + 1);
  }

  const currentRate = rateOn(sortedRates, asOf, firstRate)?.ratePct ?? firstRate;
  return {
    balance: round2(balance),
    principalPaid: round2(principalPaid),
    interestPaid: round2(interestPaid),
    paymentsMade: schedule.length,
    currentRatePct: currentRate,
    currentRepayment: round2(schedule.at(-1)?.repayment ?? (loan.repaymentAud ?? monthlyRepayment(loan.principalAud, currentRate, loan.termMonths))),
    nextPaymentOn: balance > 0.005 ? paymentDate : null,
    schedule,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** What is left after the loan is paid off today. */
export function ownOutright(midValue: number, balance: number): number {
  return midValue - balance;
}

/** The loan as a share of what the place is worth, in percent. */
export function loanShare(balance: number, midValue: number): number | null {
  return midValue > 0 ? (balance / midValue) * 100 : null;
}

/** Interest and paydown inside a repayment made in a given month, from the schedule. */
export function splitRepayment(schedule: ScheduleRow[], occurredOn: string, amount: number): { interest: number; principal: number } {
  const month = occurredOn.slice(0, 7);
  const row = schedule.find((entry) => entry.date.slice(0, 7) === month);
  if (!row) return { interest: 0, principal: amount };
  const interest = Math.min(row.interest, amount);
  return { interest: round2(interest), principal: round2(amount - interest) };
}
