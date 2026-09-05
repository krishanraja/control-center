import { z } from "zod";

/**
 * The composed spend day the API returns. Validated once at the boundary so
 * the tab never renders a shape it does not understand. Optional feeds arrive
 * as empty arrays or null and the sections that need them say so.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const scopeSchema = z.enum(["personal", "os", "property"]);
export const sourceSchema = z.enum(["bills_sheet", "cc_invoices", "property_ledger"]);

export const spendItemSchema = z.object({
  source: sourceSchema,
  sourceRef: z.string(),
  occurredOn: isoDate,
  merchant: z.string(),
  merchantKey: z.string(),
  registryKey: z.string().nullable(),
  item: z.string().nullable(),
  category: z.string().nullable(),
  scope: scopeSchema,
  scopeReason: z.string(),
  kind: z.enum(["charge", "refund"]),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  amountUsd: z.number().nullable(),
  fxRate: z.number().nullable(),
  fxDate: isoDate.nullable(),
  fxSource: z.string().nullable(),
  evidence: z.string().nullable(),
  accountEmail: z.string().nullable(),
  confidence: z.string().nullable(),
  invoiceRef: z.string().nullable(),
  supersededByRef: z.string().nullable(),
  possibleDuplicateOfRef: z.string().nullable(),
  flags: z.array(z.string()),
  syncedAt: z.string(),
});

export const merchantSchema = z.object({
  merchantKey: z.string(),
  displayName: z.string(),
  registryKey: z.string().nullable(),
  category: z.string().nullable(),
  scopeDefault: scopeSchema,
  includedUsd: z.number().nullable(),
  overageTriggerUsd: z.number().nullable(),
  cycleUsd: z.number().nullable(),
  cycleStart: isoDate.nullable(),
  cycleEnd: isoDate.nullable(),
  topUpUrl: z.string().nullable(),
  active: z.boolean(),
  itemCount: z.number(),
  firstSeenOn: isoDate.nullable(),
  lastSeenOn: isoDate.nullable(),
});

export const overrideSchema = z.object({
  merchantKey: z.string(),
  scope: scopeSchema,
  displayName: z.string().nullable(),
  note: z.string().nullable(),
});

export const meterUnitSchema = z.object({
  provider: z.string(),
  unitKind: z.string(),
  unitKey: z.string(),
  label: z.string(),
  category: z.string().nullable(),
  usd: z.number(),
  usd7d: z.number(),
  runs: z.number(),
  failed: z.number(),
  units: z.number(),
  unitName: z.string().nullable(),
});

export const meterDaySchema = z.object({ day: isoDate, usd: z.number() });

export const cycleSchema = z.object({
  key: z.string(),
  name: z.string(),
  includedUsd: z.number(),
  overageTriggerUsd: z.number().nullable(),
  cycleUsd: z.number().nullable(),
  cycleStart: isoDate.nullable(),
  cycleEnd: isoDate.nullable(),
  state: z.enum(["within", "over_prepaid", "near_trigger", "charging_early", "unknown"]),
  overUsd: z.number(),
  headroomUsd: z.number().nullable(),
  topUpUrl: z.string().nullable(),
});

export const coverageSchema = z.object({
  provider: z.string(),
  status: z.enum(["available", "carried", "failed", "not_configured"]),
  sourceDate: z.string().optional(),
  limitation: z.string().optional(),
  latencyMs: z.number().optional(),
});

export const spendDaySchema = z.object({
  generatedAt: z.string(),
  items: z.array(spendItemSchema),
  merchants: z.array(merchantSchema),
  overrides: z.array(overrideSchema),
  meter: z.object({
    since: isoDate,
    units: z.array(meterUnitSchema),
    days: z.array(meterDaySchema),
    silent: z.array(z.string()),
  }),
  cycles: z.array(cycleSchema),
  fxAsOf: z.array(z.object({ currency: z.string(), rateOn: isoDate, perAud: z.number() })),
  lastRun: z.object({
    runOn: isoDate,
    status: z.string(),
    finishedAt: z.string().nullable(),
    coverage: z.array(coverageSchema),
    counts: z.record(z.string(), z.unknown()).nullable().optional(),
    dedupe: z.object({ exact: z.number(), tier1: z.number(), tier2: z.number() }).nullable().optional(),
    limitation: z.string().nullable().optional(),
  }).nullable(),
  /** The member's latest cash on hand, typed in through Settings. Null until one is entered. */
  cash: z.object({ asOf: isoDate, amountUsd: z.number() }).nullable(),
});

export type SpendDay = z.infer<typeof spendDaySchema>;
export type SpendItem = z.infer<typeof spendItemSchema>;
export type SpendScope = z.infer<typeof scopeSchema>;
export type SpendSource = z.infer<typeof sourceSchema>;
export type MerchantRecord = z.infer<typeof merchantSchema>;
export type MeterUnit = z.infer<typeof meterUnitSchema>;
export type MeterDay = z.infer<typeof meterDaySchema>;
export type CycleRecord = z.infer<typeof cycleSchema>;
export type SpendCash = NonNullable<SpendDay["cash"]>;

export function parseSpendDay(input: unknown): SpendDay {
  const result = spendDaySchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`The spend data has an unexpected shape at ${issue?.path.join(".") || "root"}: ${issue?.message ?? "unknown"}`);
  }
  return result.data;
}
