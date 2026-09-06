import type { Target } from "./types.ts";

/**
 * The inner-south Brisbane suburbs the ranking compares. Chosen because they
 * share the subject's buyer pool: within about five kilometres of the CBD, on
 * the south side of the river, with an established unit market.
 */
export const TARGET_SUBURBS: Target[] = [
  { suburb: "Highgate Hill", postcode: "4101" },
  { suburb: "West End", postcode: "4101" },
  { suburb: "South Brisbane", postcode: "4101" },
  { suburb: "Woolloongabba", postcode: "4102" },
  { suburb: "Dutton Park", postcode: "4102" },
  { suburb: "Annerley", postcode: "4103" },
  { suburb: "Fairfield", postcode: "4103" },
  { suburb: "Yeronga", postcode: "4104" },
  { suburb: "Moorooka", postcode: "4105" },
  { suburb: "Kangaroo Point", postcode: "4169" },
  { suburb: "East Brisbane", postcode: "4169" },
  { suburb: "Greenslopes", postcode: "4120" },
  { suburb: "Holland Park", postcode: "4121" },
];

export const TARGET_POSTCODES: string[] = [...new Set(TARGET_SUBURBS.map((target) => target.postcode))];

export const ENGINE_VERSION = "compound-property/1.0.0";
