/**
 * Pure composition of the property day from PostgREST rows. No I/O, so it is
 * tested directly. Column names are the database's; keys are the browser's.
 */

function number(value) {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function required(value) {
  const parsed = number(value);
  return parsed == null ? 0 : parsed;
}

export function composePropertyDay(rows) {
  const property = rows.property;
  if (!property) return null;
  const loan = rows.loans?.[0] ?? null;
  return {
    generatedAt: new Date().toISOString(),
    property: {
      id: property.id,
      slug: property.slug,
      label: property.label,
      address: property.address,
      suburb: property.suburb,
      state: property.state,
      postcode: property.postcode,
      dwellingType: property.dwelling_type,
      bedrooms: required(property.bedrooms),
      bathrooms: required(property.bathrooms),
      carSpaces: required(property.car_spaces),
      floorNote: property.floor_note ?? null,
      purchasePriceAud: required(property.purchase_price_aud),
      contractOn: property.contract_on ?? null,
      settledOn: property.settled_on,
    },
    loan: loan
      ? {
        id: loan.id,
        lender: loan.lender,
        product: loan.product ?? null,
        purpose: loan.purpose,
        principalAud: required(loan.principal_aud),
        termMonths: required(loan.term_months),
        repaymentType: loan.repayment_type,
        firstRepaymentOn: loan.first_repayment_on,
        repaymentAud: number(loan.repayment_aud),
        offsetBalanceAud: required(loan.offset_balance_aud),
      }
      : null,
    rates: (rows.rates ?? []).map((rate) => ({
      effectiveFrom: rate.effective_from,
      ratePct: required(rate.rate_pct),
      source: rate.source,
      note: rate.note ?? null,
    })),
    rents: (rows.rents ?? []).map((rent) => ({
      effectiveFrom: rent.effective_from,
      amountAud: required(rent.amount_aud),
      period: rent.period,
      managementFeePct: number(rent.management_fee_pct),
      leaseEndsOn: rent.lease_ends_on ?? null,
      kind: rent.kind,
      note: rent.note ?? null,
    })),
    valuations: (rows.valuations ?? []).map((row) => ({
      estimatedOn: row.estimated_on,
      method: row.method,
      lowAud: number(row.low_aud),
      midAud: required(row.mid_aud),
      highAud: number(row.high_aud),
      confidence: row.confidence,
      inputs: row.inputs ?? {},
      engineVersion: row.engine_version,
    })),
    ledger: (rows.ledger ?? []).map((row) => ({
      occurredOn: row.occurred_on,
      sheetCategory: row.sheet_category,
      category: row.category,
      direction: row.direction,
      amountAud: number(row.amount_aud),
      description: row.description ?? null,
      payee: row.payee ?? null,
      confidence: row.confidence ?? null,
      sourceNote: row.source_note ?? null,
      syncedAt: row.synced_at,
    })),
    observations: (rows.observations ?? []).map((row) => ({
      source: row.source,
      areaKind: row.area_kind,
      areaCode: row.area_code,
      dwellingType: row.dwelling_type ?? null,
      bedrooms: number(row.bedrooms),
      metric: row.metric,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      value: required(row.value),
      unit: row.unit,
      sourceUrl: row.source_url ?? null,
      sourceDate: row.source_date ?? null,
      detail: row.detail ?? {},
    })),
    rankings: (rows.rankings ?? []).map((row) => ({
      runOn: row.run_on,
      suburb: row.suburb,
      postcode: row.postcode,
      score: required(row.score),
      rank: required(row.rank),
      grossYieldPct: number(row.gross_yield_pct),
      rentGrowthPct: number(row.rent_growth_pct),
      priceGrowthPct: number(row.price_growth_pct),
      listingCount: number(row.listing_count),
      medianSoldPriceAud: number(row.median_sold_price_aud),
      medianWeeklyRentAud: number(row.median_weekly_rent_aud),
      missing: Array.isArray(row.missing) ? row.missing : [],
      inputs: row.inputs ?? {},
    })),
    cashRate: rows.cashRate ? { value: required(rows.cashRate.value), periodEnd: rows.cashRate.period_end } : null,
    lastRun: rows.run
      ? {
        runOn: rows.run.run_on,
        status: rows.run.status,
        finishedAt: rows.run.finished_at ?? null,
        coverage: Array.isArray(rows.run.provider_results?.coverage) ? rows.run.provider_results.coverage : [],
      }
      : null,
  };
}

/** The PostgREST queries for one property, in the order the route runs them. */
export function propertyQueries(property) {
  const id = property.id;
  return {
    loans: `property_loans?select=*&property_id=eq.${id}&active=is.true&order=first_repayment_on.desc&limit=1`,
    rates: `property_loan_rates?select=effective_from,rate_pct,source,note&order=effective_from.asc&limit=200`,
    rents: `property_rents?select=effective_from,amount_aud,period,management_fee_pct,lease_ends_on,kind,note&property_id=eq.${id}&order=effective_from.asc&limit=200`,
    valuations: `property_valuations?select=estimated_on,method,low_aud,mid_aud,high_aud,confidence,inputs,engine_version&property_id=eq.${id}&order=estimated_on.asc&limit=400`,
    ledger: `property_ledger?select=occurred_on,sheet_category,category,direction,amount_aud,description,payee,confidence,source_note,synced_at&property_id=eq.${id}&order=occurred_on.asc&limit=2000`,
    observations: `property_market_observations?select=source,area_kind,area_code,dwelling_type,bedrooms,metric,period_start,period_end,value,unit,source_url,source_date,detail&or=(area_code.eq.${property.postcode},area_kind.eq.building,area_kind.eq.national,area_kind.eq.suburb,area_kind.eq.postcode)&order=period_end.asc&limit=4000`,
    latestRanking: `property_suburb_rankings?select=run_on&order=run_on.desc&limit=1`,
    cashRate: `property_market_observations?select=value,period_end&metric=eq.cash_rate_pct&order=period_end.desc&limit=1`,
    run: `property_runs?select=run_on,status,finished_at,provider_results&status=in.(complete,partial)&order=run_on.desc,started_at.desc&limit=1`,
  };
}
