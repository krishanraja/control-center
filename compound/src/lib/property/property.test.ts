import { describe, expect, it } from "vitest";
import demo from "../../demo/property.json";
import { summariseLedger } from "./ledger";
import { amortise, loanShare, monthlyRepayment, ownOutright, splitRepayment } from "./loan";
import { currentRent, grossRentReturn, nextReview, rentBand, rentGap, reviewAdvice, weeklyRent } from "./rent";
import { parsePropertyDay, type LoanRecord, type RateRecord } from "./schema";

const loan: LoanRecord = {
  id: "l",
  lender: "Bank",
  product: null,
  purpose: "investment",
  principalAud: 480000,
  termMonths: 360,
  repaymentType: "principal_and_interest",
  firstRepaymentOn: "2024-12-13",
  repaymentAud: 3034.12,
  offsetBalanceAud: 0,
};
const rates: RateRecord[] = [{ effectiveFrom: "2024-12-13", ratePct: 6.5, source: "settlement", note: null }];

describe("loan maths", () => {
  it("computes a repayment close to the bank's figure", () => {
    expect(Math.abs(monthlyRepayment(480000, 6.5, 360) - 3034.12)).toBeLessThan(2);
  });

  it("amortises with the bank's stated repayment and lands near the expected balance", () => {
    const state = amortise(loan, rates, "2026-09-04");
    expect(state.paymentsMade).toBe(21);
    expect(state.balance).toBeGreaterThan(469_000);
    expect(state.balance).toBeLessThan(471_000);
    expect(state.schedule[0].repayment).toBe(3034.12);
    expect(state.nextPaymentOn).toBe("2026-09-13");
    expect(ownOutright(680000, state.balance)).toBeCloseTo(680000 - state.balance, 2);
    expect(loanShare(state.balance, 680000)).toBeCloseTo(state.balance / 6800, 3);
  });

  it("re-amortises over the remaining term when the rate changes", () => {
    const changed = amortise(loan, [...rates, { effectiveFrom: "2025-12-01", ratePct: 5.5, source: "bank_notice", note: null }], "2026-03-01");
    const steady = amortise(loan, rates, "2026-03-01");
    const afterChange = changed.schedule.find((row) => row.date >= "2025-12-01");
    expect(afterChange?.ratePct).toBe(5.5);
    expect(afterChange && afterChange.repayment < 3034.12).toBe(true);
    expect(changed.interestPaid).toBeLessThan(steady.interestPaid);
  });

  it("uses the formula when no bank figure exists and handles interest only", () => {
    const noFigure = amortise({ ...loan, repaymentAud: null }, rates, "2025-01-01");
    expect(Math.abs(noFigure.schedule[0].repayment - 3033.8)).toBeLessThan(0.5);
    const io = amortise({ ...loan, repaymentType: "interest_only" }, rates, "2025-06-01");
    expect(io.balance).toBe(480000);
    expect(io.schedule[0].principal).toBe(0);
  });

  it("splits a repayment into interest and paydown by month", () => {
    const state = amortise(loan, rates, "2026-09-04");
    const split = splitRepayment(state.schedule, "2025-03-08", 3034.12);
    expect(split.interest + split.principal).toBeCloseTo(3034.12, 2);
    expect(split.interest).toBeGreaterThan(2500);
  });
});

describe("rent guidance", () => {
  const rents = [
    { effectiveFrom: "2025-02-14", amountAud: 540, period: "week" as const, managementFeePct: 8.1, leaseEndsOn: null, kind: "initial", note: null },
    { effectiveFrom: "2025-10-31", amountAud: 1220, period: "fortnight" as const, managementFeePct: 8.1, leaseEndsOn: null, kind: "increase", note: null },
  ];

  it("normalises a fortnight to a week and finds the current rent", () => {
    const current = currentRent(rents, "2026-09-04");
    expect(current?.effectiveFrom).toBe("2025-10-31");
    expect(weeklyRent(current!)).toBe(610);
    expect(grossRentReturn(610, 600000)).toBeCloseTo(5.29, 2);
  });

  it("reads the gap against the area and words the advice", () => {
    const band = rentBand([
      { source: "rta", areaKind: "postcode", areaCode: "4101", dwellingType: "unit", bedrooms: 2, metric: "median_weekly_rent", periodStart: "2026-04-01", periodEnd: "2026-06-30", value: 580, unit: "AUD/week", sourceUrl: null, sourceDate: null, detail: {} },
    ], "4101", 2);
    const gap = rentGap(610, band);
    expect(gap?.gapWeekly).toBe(-30);
    expect(reviewAdvice(gap)).toMatch(/above the area figure/);
    expect(reviewAdvice(rentGap(560, band))).toMatch(/a little under/);
    expect(reviewAdvice(rentGap(500, band))).toMatch(/under the area figure by about A\$80/);
    expect(reviewAdvice(null)).toMatch(/No market rent figure/);
  });

  it("dates the next allowed increase twelve months on with two months notice", () => {
    const review = nextReview(rents, "2026-09-04");
    expect(review.earliestIncreaseOn).toBe("2026-10-31");
    expect(review.noticeBy).toBe("2026-08-31");
  });
});

describe("ledger summary", () => {
  const day = parsePropertyDay(demo);

  it("parses the demo fixture", () => {
    expect(day.property.postcode).toBe("4101");
    expect(day.ledger.length).toBeGreaterThan(100);
    expect(day.rankings).toHaveLength(13);
  });

  it("splits loan repayments and totals categories", () => {
    const state = amortise(day.loan!, day.rates, day.generatedAt.slice(0, 10));
    const summary = summariseLedger(day.ledger, state.schedule, day.generatedAt.slice(0, 10));
    expect(summary.rentReceived).toBeGreaterThan(0);
    expect(summary.interestPaid + summary.principalPaid).toBeCloseTo(summary.loanRepayments, 0);
    expect(summary.netOutOfPocket).toBeGreaterThan(0);
    expect(summary.netCostExcludingPaydown).toBeLessThan(summary.netOutOfPocket);
    expect(summary.gaps).toHaveLength(1);
    expect(summary.fastestRising?.category).toBe("body_corporate");
    expect(summary.byCategory[0].total).toBeGreaterThanOrEqual(summary.byCategory[1].total);
    expect(summary.cumulative.at(-1)?.net).toBeCloseTo(-summary.netOutOfPocket, 2);
  });

  it("degrades a missing optional band to nulls rather than throwing", () => {
    const band = rentBand([], "4101", 2);
    expect(band.areaMedian).toBeNull();
    expect(rentGap(610, band)).toBeNull();
  });
});
