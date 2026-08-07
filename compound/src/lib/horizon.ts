/**
 * The stored snapshot rows are keyed by horizon. The app no longer offers a
 * horizon switch, because the old one only relabelled a chip, so every question
 * is asked against the near-term view.
 */
export type Horizon = "3m" | "1y";

export const DEFAULT_HORIZON: Horizon = "3m";
