import { z } from "zod";

/**
 * The composed property day the API returns. Validated once at the boundary so
 * the tab never renders a shape it does not understand. Optional feeds arrive
 * as empty arrays or null and the sections that need them say so.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number();

export const propertySchema = z.object({
  id: z.string(),
  slug: z.string(),
  label: z.string(),
  address: z.string(),
  suburb: z.string(),
  state: z.string(),
  postcode: z.string(),
  dwellingType: z.enum(["unit", "house", "townhouse"]),
  bedrooms: z.number(),
  bathrooms: z.number(),
  carSpaces: z.number(),
  floorNote: z.string().nullable(),
  purchasePriceAud: money,
  contractOn: isoDate.nullable(),
  settledOn: isoDate,
});

export const loanSchema = z.object({
  id: z.string(),
  lender: z.string(),
  product: z.string().nullable(),
  purpose: z.enum(["investment", "owner_occupier"]),
  principalAud: money,
  termMonths: z.number(),
  repaymentType: z.enum(["principal_and_interest", "interest_only"]),
  firstRepaymentOn: isoDate,
  repaymentAud: money.nullable(),
  offsetBalanceAud: money,
});

export const rateSchema = z.object({
  effectiveFrom: isoDate,
  ratePct: z.number(),
  source: z.string(),
  note: z.string().nullable(),
});

export const rentSchema = z.object({
  effectiveFrom: isoDate,
  amountAud: money,
  period: z.enum(["week", "fortnight", "month"]),
  managementFeePct: z.number().nullable(),
  leaseEndsOn: isoDate.nullable(),
  kind: z.string(),
  note: z.string().nullable(),
});

export const valuationSchema = z.object({
  estimatedOn: isoDate,
  method: z.string(),
  lowAud: money.nullable(),
  midAud: money,
  highAud: money.nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  inputs: z.record(z.string(), z.unknown()),
  engineVersion: z.string(),
});

export const ledgerCategory = z.enum([
  "rent_received", "management_fee", "loan_repayment", "council_rates", "body_corporate",
  "water", "insurance", "purchase_cost", "legal", "repairs", "other",
]);

export const ledgerRowSchema = z.object({
  occurredOn: isoDate,
  sheetCategory: z.string(),
  category: ledgerCategory,
  direction: z.enum(["in", "out", "gap", "milestone"]),
  amountAud: money.nullable(),
  description: z.string().nullable(),
  payee: z.string().nullable(),
  confidence: z.string().nullable(),
  sourceNote: z.string().nullable(),
  syncedAt: z.string(),
});

export const observationSchema = z.object({
  source: z.string(),
  areaKind: z.string(),
  areaCode: z.string(),
  dwellingType: z.string().nullable(),
  bedrooms: z.number().nullable(),
  metric: z.string(),
  periodStart: isoDate,
  periodEnd: isoDate,
  value: z.number(),
  unit: z.string(),
  sourceUrl: z.string().nullable(),
  sourceDate: isoDate.nullable(),
  detail: z.record(z.string(), z.unknown()),
});

export const rankingSchema = z.object({
  runOn: isoDate,
  suburb: z.string(),
  postcode: z.string(),
  score: z.number(),
  rank: z.number(),
  grossYieldPct: z.number().nullable(),
  rentGrowthPct: z.number().nullable(),
  priceGrowthPct: z.number().nullable(),
  listingCount: z.number().nullable(),
  medianSoldPriceAud: money.nullable(),
  medianWeeklyRentAud: money.nullable(),
  missing: z.array(z.string()),
  inputs: z.record(z.string(), z.unknown()),
});

export const coverageSchema = z.object({
  provider: z.string(),
  status: z.enum(["available", "carried", "failed", "not_configured"]),
  sourceDate: z.string().optional(),
  limitation: z.string().optional(),
});

export const propertyDaySchema = z.object({
  generatedAt: z.string(),
  property: propertySchema,
  loan: loanSchema.nullable(),
  rates: z.array(rateSchema),
  rents: z.array(rentSchema),
  valuations: z.array(valuationSchema),
  ledger: z.array(ledgerRowSchema),
  observations: z.array(observationSchema),
  rankings: z.array(rankingSchema),
  cashRate: z.object({ value: z.number(), periodEnd: isoDate }).nullable(),
  lastRun: z.object({
    runOn: isoDate,
    status: z.string(),
    finishedAt: z.string().nullable(),
    coverage: z.array(coverageSchema),
  }).nullable(),
});

export type PropertyDay = z.infer<typeof propertyDaySchema>;
export type PropertyRecord = z.infer<typeof propertySchema>;
export type LoanRecord = z.infer<typeof loanSchema>;
export type RateRecord = z.infer<typeof rateSchema>;
export type RentRecord = z.infer<typeof rentSchema>;
export type ValuationRecord = z.infer<typeof valuationSchema>;
export type LedgerRow = z.infer<typeof ledgerRowSchema>;
export type LedgerCategory = z.infer<typeof ledgerCategory>;
export type ObservationRecord = z.infer<typeof observationSchema>;
export type RankingRecord = z.infer<typeof rankingSchema>;
export type CoverageRecord = z.infer<typeof coverageSchema>;

export function parsePropertyDay(input: unknown): PropertyDay {
  const parsed = propertyDaySchema.safeParse(input);
  if (!parsed.success) throw new Error("The property data arrived in a shape COMPOUND does not recognise.");
  return parsed.data;
}
