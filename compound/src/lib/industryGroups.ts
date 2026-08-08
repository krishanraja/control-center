/**
 * Industries roll up into families so the settings list is scannable instead of
 * being 123 near-identical rows. FMP encodes the family before a " - " in most
 * names ("Software - Infrastructure" -> "Software"), which is the main rule. A
 * couple of families use a plain prefix ("Oil & Gas Midstream") or are spread
 * across unrelated names ("Regulated Electric", "Steel"), handled by the two
 * tables below.
 *
 * Storage never changes: a group is only ever a view over its member industries,
 * so `excluded_industries` stays a flat list and every other tab is unaffected.
 */

/** Families whose members share a leading phrase rather than a " - " split. */
const PREFIX_GROUPS = ["Oil & Gas"];

/** Scattered industries that belong together but share no common prefix. */
const EXACT_GROUP: Record<string, string> = {
  "Regulated Electric": "Utilities",
  "Regulated Gas": "Utilities",
  "Regulated Water": "Utilities",
  "Renewable Utilities": "Utilities",
  "Independent Power Producers": "Utilities",
  "Diversified Utilities": "Utilities",
  "General Utilities": "Utilities",
  Gold: "Metals & Mining",
  Silver: "Metals & Mining",
  Copper: "Metals & Mining",
  Aluminum: "Metals & Mining",
  Steel: "Metals & Mining",
  "Other Precious Metals": "Metals & Mining",
  "Other Industrial Metals & Mining": "Metals & Mining",
  "Coking Coal": "Metals & Mining",
  "Thermal Coal": "Metals & Mining",
  Uranium: "Metals & Mining",
};

/** The family an industry belongs to. Falls back to the industry's own name. */
export function groupOf(industry: string): string {
  const exact = EXACT_GROUP[industry];
  if (exact) return exact;
  for (const prefix of PREFIX_GROUPS) {
    if (industry === prefix || industry.startsWith(`${prefix} `)) return prefix;
  }
  const dash = industry.indexOf(" - ");
  if (dash > 0) return industry.slice(0, dash);
  return industry;
}

export interface IndustryEntry {
  industry: string;
  /** Companies carrying signals in today's run. */
  names: number;
}

export interface IndustryGroup {
  group: string;
  members: IndustryEntry[];
  /** Total companies across the members in today's run. */
  companies: number;
}

/** Roll a flat list of industries into alphabetically ordered families. */
export function buildGroups(entries: IndustryEntry[]): IndustryGroup[] {
  const map = new Map<string, IndustryEntry[]>();
  for (const entry of entries) {
    const group = groupOf(entry.industry);
    const list = map.get(group) ?? [];
    list.push(entry);
    map.set(group, list);
  }
  return [...map.entries()]
    .map(([group, members]) => ({
      group,
      members: members.sort((a, b) => a.industry.localeCompare(b.industry)),
      companies: members.reduce((sum, member) => sum + member.names, 0),
    }))
    .sort((a, b) => a.group.localeCompare(b.group));
}
