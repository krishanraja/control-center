/**
 * COMPOUND stores industry settings as flat FMP industry names. This module is
 * only the presentation layer that rolls those names into a stable, coarse
 * taxonomy for Settings.
 *
 * Every industry in the current 123-industry snapshot is mapped explicitly.
 * A future FMP value lands in one final Other sector rather than leaking into
 * the top level as a standalone row.
 */

export const SECTOR_ORDER = [
  "Technology",
  "Financials",
  "Healthcare",
  "Energy",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Industrials",
  "Materials",
  "Real Estate",
  "Utilities",
  "Communication Services",
] as const;

export type IndustrySector = (typeof SECTOR_ORDER)[number];
export type IndustryTopGroup = IndustrySector | "Other";

export const FMP_INDUSTRY_TO_SECTOR: Readonly<Record<string, IndustrySector>> = {
  "Communication Equipment": "Technology",
  "Computer Hardware": "Technology",
  "Consumer Electronics": "Technology",
  "Hardware, Equipment & Parts": "Technology",
  "Information Technology Services": "Technology",
  Semiconductors: "Technology",
  "Software - Application": "Technology",
  "Software - Infrastructure": "Technology",
  "Software - Services": "Technology",
  "Technology Distributors": "Technology",

  "Banks - Regional": "Financials",
  "Financial - Capital Markets": "Financials",
  "Financial - Conglomerates": "Financials",
  "Financial - Credit Services": "Financials",
  "Financial - Data & Stock Exchanges": "Financials",
  "Financial - Mortgages": "Financials",
  "Insurance - Brokers": "Financials",
  "Insurance - Diversified": "Financials",
  "Insurance - Life": "Financials",
  "Insurance - Property & Casualty": "Financials",
  "Insurance - Reinsurance": "Financials",
  "Insurance - Specialty": "Financials",
  "Investment - Banking & Investment Services": "Financials",
  "Shell Companies": "Financials",

  Biotechnology: "Healthcare",
  "Drug Manufacturers - General": "Healthcare",
  "Drug Manufacturers - Specialty & Generic": "Healthcare",
  "Medical - Care Facilities": "Healthcare",
  "Medical - Devices": "Healthcare",
  "Medical - Diagnostics & Research": "Healthcare",
  "Medical - Distribution": "Healthcare",
  "Medical - Equipment & Services": "Healthcare",
  "Medical - Healthcare Information Services": "Healthcare",
  "Medical - Healthcare Plans": "Healthcare",
  "Medical - Instruments & Supplies": "Healthcare",
  "Medical - Pharmaceuticals": "Healthcare",
  "Medical - Specialties": "Healthcare",

  Coal: "Energy",
  "Oil & Gas Equipment & Services": "Energy",
  "Oil & Gas Exploration & Production": "Energy",
  "Oil & Gas Integrated": "Energy",
  "Oil & Gas Midstream": "Energy",
  "Oil & Gas Refining & Marketing": "Energy",
  Solar: "Energy",

  "Apparel - Footwear & Accessories": "Consumer Cyclical",
  "Apparel - Manufacturers": "Consumer Cyclical",
  "Apparel - Retail": "Consumer Cyclical",
  "Auto - Dealerships": "Consumer Cyclical",
  "Auto - Manufacturers": "Consumer Cyclical",
  "Auto - Parts": "Consumer Cyclical",
  "Auto - Recreational Vehicles": "Consumer Cyclical",
  "Education & Training Services": "Consumer Cyclical",
  "Furnishings, Fixtures & Appliances": "Consumer Cyclical",
  "Gambling, Resorts & Casinos": "Consumer Cyclical",
  "Home Improvement": "Consumer Cyclical",
  Leisure: "Consumer Cyclical",
  "Personal Products & Services": "Consumer Cyclical",
  "Rental & Leasing Services": "Consumer Cyclical",
  "Residential Construction": "Consumer Cyclical",
  Restaurants: "Consumer Cyclical",
  "Specialty Retail": "Consumer Cyclical",
  "Travel Lodging": "Consumer Cyclical",
  "Travel Services": "Consumer Cyclical",

  "Agricultural Farm Products": "Consumer Defensive",
  "Beverages - Non-Alcoholic": "Consumer Defensive",
  "Beverages - Wineries & Distilleries": "Consumer Defensive",
  "Discount Stores": "Consumer Defensive",
  "Food Distribution": "Consumer Defensive",
  "Grocery Stores": "Consumer Defensive",
  "Household & Personal Products": "Consumer Defensive",
  "Packaged Foods": "Consumer Defensive",
  Tobacco: "Consumer Defensive",

  "Aerospace & Defense": "Industrials",
  "Agricultural - Machinery": "Industrials",
  "Airlines, Airports & Air Services": "Industrials",
  Conglomerates: "Industrials",
  Construction: "Industrials",
  "Consulting Services": "Industrials",
  "Electrical Equipment & Parts": "Industrials",
  "Engineering & Construction": "Industrials",
  "Industrial - Distribution": "Industrials",
  "Industrial - Machinery": "Industrials",
  "Industrial - Pollution & Treatment Controls": "Industrials",
  "Integrated Freight & Logistics": "Industrials",
  "Manufacturing - Metal Fabrication": "Industrials",
  "Manufacturing - Tools & Accessories": "Industrials",
  "Marine Shipping": "Industrials",
  Railroads: "Industrials",
  "Security & Protection Services": "Industrials",
  "Specialty Business Services": "Industrials",
  "Staffing & Employment Services": "Industrials",
  Trucking: "Industrials",
  "Waste Management": "Industrials",

  "Agricultural Inputs": "Materials",
  Chemicals: "Materials",
  "Chemicals - Specialty": "Materials",
  "Construction Materials": "Materials",
  Gold: "Materials",
  "Industrial Materials": "Materials",
  "Other Precious Metals": "Materials",
  "Packaging & Containers": "Materials",
  "Paper, Lumber & Forest Products": "Materials",
  Steel: "Materials",

  "Real Estate - Development": "Real Estate",
  "Real Estate - General": "Real Estate",
  "Real Estate - Services": "Real Estate",
  "REIT - Diversified": "Real Estate",
  "REIT - Healthcare Facilities": "Real Estate",
  "REIT - Hotel & Motel": "Real Estate",
  "REIT - Industrial": "Real Estate",
  "REIT - Mortgage": "Real Estate",
  "REIT - Retail": "Real Estate",
  "REIT - Specialty": "Real Estate",

  "Regulated Electric": "Utilities",
  "Regulated Water": "Utilities",
  "Renewable Utilities": "Utilities",

  "Advertising Agencies": "Communication Services",
  Broadcasting: "Communication Services",
  "Electronic Gaming & Multimedia": "Communication Services",
  Entertainment: "Communication Services",
  "Internet Content & Information": "Communication Services",
  Publishing: "Communication Services",
  "Telecommunications Services": "Communication Services",
};

export function groupOf(industry: string): IndustryTopGroup {
  return FMP_INDUSTRY_TO_SECTOR[industry] ?? "Other";
}

export interface IndustryEntry {
  industry: string;
  /** Companies carrying signals in today's run. */
  names: number;
}

export interface IndustryGroup {
  group: IndustryTopGroup;
  members: IndustryEntry[];
  /** Total companies across the members in today's run. */
  companies: number;
}

/** Roll a flat list into the fixed sector order, with Other last if needed. */
export function buildGroups(entries: IndustryEntry[]): IndustryGroup[] {
  const map = new Map<IndustryTopGroup, IndustryEntry[]>();
  for (const entry of entries) {
    const group = groupOf(entry.industry);
    const list = map.get(group) ?? [];
    list.push(entry);
    map.set(group, list);
  }

  const order = new Map<IndustryTopGroup, number>([
    ...SECTOR_ORDER.map((sector, index) => [sector, index] as const),
    ["Other", SECTOR_ORDER.length],
  ]);

  return [...map.entries()]
    .map(([group, members]) => ({
      group,
      members: members.sort((a, b) => a.industry.localeCompare(b.industry)),
      companies: members.reduce((sum, member) => sum + member.names, 0),
    }))
    .sort((a, b) => (order.get(a.group) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.group) ?? Number.MAX_SAFE_INTEGER));
}
