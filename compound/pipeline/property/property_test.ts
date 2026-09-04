import * as XLSX from "xlsx";
import { estimateValue } from "./engines/valuation.ts";
import { rankSuburbs, WEIGHTS } from "./engines/ranking.ts";
import { rentBand } from "./engines/rentGuidance.ts";
import { assertionClaims } from "./google.ts";
import { parseObservationRow, parseRateRow } from "./import.ts";
import { rentObservations, soldObservations, weeklyAskingRent } from "./providers/domain.ts";
import { externalRef, mapLedgerRow, mapLedgerRows, SHEET_HEADER } from "./providers/ledgerSheet.ts";
import { isoFromRbaDate, parseCashRate } from "./providers/rba.ts";
import { findWorkbookUrl, normaliseRtaRows, quarterEnd } from "./providers/rta.ts";
import type { Observation } from "./types.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function observation(partial: Partial<Observation> & Pick<Observation, "metric" | "value" | "periodEnd">): Observation {
  return {
    source: "manual",
    areaKind: "postcode",
    areaCode: "4101",
    dwellingType: "unit",
    bedrooms: 2,
    periodStart: partial.periodEnd,
    unit: "AUD",
    ...partial,
  };
}

Deno.test("ledger rows map the eight sheet columns and skip everything else", async () => {
  assert(mapLedgerRow(SHEET_HEADER, 1) === null, "the header row is not a ledger row");
  assert(mapLedgerRow(["", "", "SUMMARY", "", "112001.51"], 2) === null, "summary cells are not rows");
  const cost = mapLedgerRow(["2025-03-08", "Mortgage", "Monthly transfer", "Bank", "3034.12", "Cost", "Confirmed", "Bank alert"], 3);
  assert(cost?.category === "loan_repayment" && cost.direction === "out" && cost.amount === 3034.12, "cost row maps");
  const income = mapLedgerRow(["2025-11-14", "Rental income", "Rent, statement 25", "Letting agent", "1,220", "Income", "Confirmed", "Statement"], 4);
  assert(income?.category === "rent_received" && income.direction === "in" && income.amount === 1220, "income row maps with a thousands separator");
  const gap = mapLedgerRow(["2025-01-31", "Water", "GAP: first bill missing", "Urban Utilities", "", "Gap", "Missing", "Tracker"], 5);
  assert(gap?.direction === "gap" && gap.amount === null, "gap rows keep no amount");
  const blankCost = mapLedgerRow(["2025-01-31", "Water", "no amount", "Urban Utilities", "", "Cost", "Confirmed", ""], 6);
  assert(blankCost === null, "a cost with no amount is not imported");
});

Deno.test("identical ledger rows get distinct stable refs", async () => {
  const twice = [
    ["2025-01-31", "Water", "one", "Urban Utilities", "423", "Cost", "From tracker only", "tracker"],
    ["2025-01-31", "Water", "two", "Urban Utilities", "423", "Cost", "From tracker only", "tracker"],
  ];
  const mapped = await mapLedgerRows(twice);
  assert(mapped.length === 2, "both rows survive");
  assert(mapped[0].keyMaterial !== mapped[1].keyMaterial, "duplicates are disambiguated");
  const first = await externalRef(mapped[0].keyMaterial);
  assert(first.length === 16 && first === await externalRef(mapped[0].keyMaterial), "refs are 16 hex chars and stable");
  const reordered = await mapLedgerRows([twice[1], twice[0]]);
  assert(reordered[0].keyMaterial === mapped[0].keyMaterial, "description edits and re-sorting do not change the key");
});

Deno.test("RBA cash rate parser reads the F1 layout", () => {
  const csv = [
    "F1 INTEREST RATES AND YIELDS",
    "Title,Cash Rate Target,Change",
    "Series ID,FIRMMCRTD,FIRMMCCRT",
    "04-Jan-2011,4.75,",
    "31-Jan-2011,4.75,",
    "15-Feb-2026,3.60,-0.25",
    "27-Feb-2026,3.60,",
  ].join("\n");
  const rows = parseCashRate(csv, "2011-01-01");
  assert(rows.length === 2, "one observation per month");
  assert(rows[1].value === 3.6 && rows[1].periodEnd === "2026-02-27", "the month's last reading wins");
  assert(isoFromRbaDate("04-Sep-2026") === "2026-09-04", "RBA dates convert");
});

Deno.test("RTA workbook parser discovers the header and keeps only target postcodes", () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Residential Tenancies Authority", "", "", ""],
    ["Median weekly rents, new bonds lodged", "", "", ""],
    ["Postcode", "Dwelling type", "Bedrooms", "Quarter", "Median rent", "Number of bonds"],
    ["4101", "Flat/Unit", "2", "Jun 2026", "600", "84"],
    ["4101", "Flat/Unit", "1", "Jun 2026", "480", "60"],
    ["4000", "Flat/Unit", "2", "Jun 2026", "650", "200"],
    ["4102", "House", "3", "Jun 2026", "800", "12"],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Postcode");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const read = XLSX.read(new Uint8Array(bytes), { type: "array" });
  const sheets = read.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(read.Sheets[name], { header: 1, raw: true, defval: "" }) }));
  const rows = normaliseRtaRows(sheets, new Set(["4101", "4102"]), "2026-06-30", "https://example.test/rta.xlsx");
  assert(rows.length === 3, "three target rows");
  const twoBed = rows.find((row) => row.areaCode === "4101" && row.bedrooms === 2);
  assert(twoBed?.value === 600 && twoBed.dwellingType === "unit" && twoBed.periodEnd === "2026-06-30", "2 bed unit row parsed");
  assert(twoBed.detail?.sampleSize === 84, "bond count kept");
  assert(quarterEnd("March 2026 quarter") === "2026-03-31" && quarterEnd("Q3 2025") === "2025-09-30", "quarter labels resolve");
  assert(findWorkbookUrl('<a href="/sites/default/files/2026-07/rta-bond-statistics.xlsx">Download</a>') === "https://www.rta.qld.gov.au/sites/default/files/2026-07/rta-bond-statistics.xlsx", "relative links resolve");
});

Deno.test("Domain aggregates asking rents and sold prices without keeping raw listings", () => {
  const listings = [
    { id: 1, priceDetails: { price: 600 }, propertyDetails: { bedrooms: 2 } },
    { id: 2, priceDetails: { displayPrice: "$650 per week" } },
    { id: 3, priceDetails: { displayPrice: "Contact agent" } },
    { id: 4, priceDetails: { displayPrice: "$2,600 per month" } },
    { id: 5, priceDetails: { priceFrom: 580, priceTo: 620 } },
  ];
  assert(weeklyAskingRent(listings[1]) === 650 && weeklyAskingRent(listings[2]) === null && weeklyAskingRent(listings[3]) === null, "display prices parse or are skipped");
  const rent = rentObservations(listings, "4101", 2, "2026-09-08");
  assert(rent.find((row) => row.metric === "rent_listing_count")?.value === 5, "listing count counts every listing");
  assert(rent.find((row) => row.metric === "asking_rent_median")?.value === 600, "median of the priced listings");
  const sold = soldObservations([
    { id: 9, soldData: { soldPrice: 700000, soldDate: "2025-09-04" }, propertyDetails: { carspaces: 2, displayableAddress: "6/100 Sample St" } },
    { id: 10, soldData: { soldPrice: 650000, soldDate: "2026-02-10" } },
    { id: 11, soldData: { soldPrice: 690000, soldDate: "2026-05-01" } },
    { id: 12, priceDetails: { displayPrice: "Undisclosed" } },
  ], "4101", 2, "2026-09-08");
  assert(sold.filter((row) => row.metric === "sale_price").length === 3, "priced sales become observations");
  assert(sold.find((row) => row.metric === "median_sold_price")?.value === 690000, "median sold price");
  assert(sold[0].detail?.ref === "domain-9" && sold[0].detail?.cars === 2, "each sale carries a stable ref and car count");
});

Deno.test("value estimate blends the building sale with the postcode pool and shows its working", () => {
  const observations: Observation[] = [
    observation({ metric: "sale_price", value: 700000, periodEnd: "2025-09-04", areaKind: "building", areaCode: "demo-unit", detail: { cars: 2, address: "6/100 Sample St" } }),
    observation({ metric: "sale_price", value: 560000, periodEnd: "2025-09-10", areaKind: "building", areaCode: "demo-unit", bedrooms: 1 }),
    ...[640000, 655000, 660000, 672000, 690000, 700000, 715000, 730000].map((value, index) =>
      observation({ metric: "sale_price", value, periodEnd: `2026-0${(index % 8) + 1}-15`, detail: { ref: `s${index}` } })),
  ];
  const result = estimateValue({ postcode: "4101", bedrooms: 2, carSpaces: 1, purchasePrice: 600000, settledOn: "2024-11-14", buildingKey: "demo-unit" }, observations, "2026-10-08");
  const anchor = 700000 - 30000;
  const poolMedian = (672000 + 690000) / 2;
  const expectedMid = Math.round((0.6 * anchor + 0.4 * poolMedian) / 500) * 500;
  assert(result.mid === expectedMid, `mid blends anchor and pool: ${result.mid} vs ${expectedMid}`);
  assert(result.low < result.mid && result.high > result.mid, "band brackets the mid");
  assert(result.low >= 560000, "floor holds at the smaller unit's sale");
  assert(result.confidence === "medium", "anchor older than 12 months with a pool of 8 is medium");
  const fresh = estimateValue({ postcode: "4101", bedrooms: 2, carSpaces: 1, purchasePrice: 600000, settledOn: "2024-11-14", buildingKey: "demo-unit" }, observations, "2026-09-04");
  assert(fresh.confidence === "high", "anchor within 12 months with a pool of 8 is high");
  assert(Array.isArray(result.inputs.assumptions) && (result.inputs.assumptions as string[]).some((line) => line.includes("price index")), "missing index is stated");
  const bare = estimateValue({ postcode: "4101", bedrooms: 2, carSpaces: 1, purchasePrice: 600000, settledOn: "2024-11-14", buildingKey: "x" }, [], "2026-09-08");
  assert(bare.mid === 600000 && bare.confidence === "low", "no evidence falls back to the purchase price");
});

Deno.test("suburb ranking uses percentile ranks, names missing inputs and orders deterministically", () => {
  const targets = [{ suburb: "A", postcode: "4101" }, { suburb: "B", postcode: "4102" }, { suburb: "C", postcode: "4103" }];
  const rows: Observation[] = [];
  for (const [postcode, rent, rentOld, sold, soldOld, listings] of [["4101", 600, 560, 700000, 650000, 30], ["4102", 550, 540, 600000, 590000, 10]] as const) {
    rows.push(
      observation({ metric: "median_weekly_rent", value: rent, periodEnd: "2026-06-30", areaCode: postcode, unit: "AUD/week" }),
      observation({ metric: "median_weekly_rent", value: rentOld, periodEnd: "2025-06-30", areaCode: postcode, unit: "AUD/week" }),
      observation({ metric: "median_sold_price", value: sold, periodEnd: "2026-08-31", areaCode: postcode }),
      observation({ metric: "median_sold_price", value: soldOld, periodEnd: "2025-08-31", areaCode: postcode }),
      observation({ metric: "sale_listing_count", value: listings, periodEnd: "2026-09-01", areaCode: postcode, unit: "listings" }),
    );
  }
  const ranking = rankSuburbs(rows, targets, 2);
  assert(Math.abs(WEIGHTS.grossYield + WEIGHTS.rentGrowth + WEIGHTS.priceGrowth + WEIGHTS.supply - 1) < 1e-9, "weights sum to one");
  assert(ranking[0].rank === 1 && ranking.length === 3, "every target is ranked");
  const c = ranking.find((row) => row.suburb === "C")!;
  assert(c.missing.length === 4 && c.score === 50, "a suburb with no data scores the middle and says what is missing");
  const a = ranking.find((row) => row.suburb === "A")!;
  assert(a.grossYieldPct != null && Math.abs(a.grossYieldPct - (600 * 52 / 700000) * 100) < 0.01, "gross rent return computed");
  assert(rankSuburbs(rows, targets, 2).map((row) => row.suburb).join() === ranking.map((row) => row.suburb).join(), "deterministic order");
});

Deno.test("rent band prefers the latest postcode medians for the bedroom count", () => {
  const band = rentBand([
    observation({ metric: "median_weekly_rent", value: 560, periodEnd: "2026-03-31", unit: "AUD/week", source: "rta" }),
    observation({ metric: "median_weekly_rent", value: 580, periodEnd: "2026-06-30", unit: "AUD/week", source: "rta" }),
    observation({ metric: "asking_rent_median", value: 640, periodEnd: "2026-09-08", unit: "AUD/week", source: "domain" }),
  ], "4101", 2);
  assert(band.areaMedian === 580 && band.areaMedianPeriod === "2026-06-30" && band.askingMedian === 640, "latest values chosen");
});

Deno.test("import parsers validate shape and the Google assertion has the expected claims", () => {
  const rate = parseRateRow({ effective_from: "2024-12-13", rate_pct: "6.5", source: "settlement", note: "" }, "u", "l");
  assert(rate.rate_pct === 6.5 && rate.note === null, "rate row parses");
  let threw = false;
  try { parseRateRow({ effective_from: "13/12/2024", rate_pct: "6.5", source: "settlement" }, "u", "l"); } catch { threw = true; }
  assert(threw, "non ISO dates are rejected");
  const sale = parseObservationRow({ source: "manual", area_kind: "building", area_code: "demo-unit", dwelling_type: "unit", bedrooms: "2", metric: "sale_price", period_start: "2025-09-04", period_end: "2025-09-04", value: "700000", unit: "AUD", source_url: "https://example.test", detail_cars: "2", detail_address: "6/100 Sample St" });
  assert(sale.detail?.cars === 2 && sale.detail?.address === "6/100 Sample St", "detail_ columns become the detail object");
  const claims = assertionClaims({ email: "sa@example.iam.gserviceaccount.com", privateKey: "" }, ["scope-a"], 1_000);
  assert(claims.iss === "sa@example.iam.gserviceaccount.com" && claims.exp === 4_600 && claims.aud === "https://oauth2.googleapis.com/token", "JWT claims");
});
