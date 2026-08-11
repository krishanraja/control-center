import type { Citation, SignificanceFactors, StoryCandidate, StoryDomain } from "./model.ts";
import type { IndustryPoint, MetricSeries, ProviderEvidence, TimePoint } from "./providers/types.ts";

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function latest(series: MetricSeries): TimePoint | undefined {
  return series.points.at(-1);
}

function change(series: MetricSeries, periods: number): number | undefined {
  const end = series.points.at(-1);
  const start = series.points.at(-(periods + 1));
  if (!end || !start || start.value === 0) return undefined;
  return ((end.value / start.value) - 1) * 100;
}

function levelDelta(series: MetricSeries, periods: number): number | undefined {
  const end = series.points.at(-1);
  const start = series.points.at(-(periods + 1));
  return end && start ? end.value - start.value : undefined;
}

function percentile(points: TimePoint[], value: number): number {
  if (points.length === 0) return 0.5;
  return points.filter((point) => point.value <= value).length / points.length;
}

function novelty(series: MetricSeries): number {
  const current = series.points.at(-1);
  const previous = series.points.at(-6);
  if (!current || !previous) return 0.5;
  return clamp(
    Math.abs(percentile(series.points, current.value) - percentile(series.points, previous.value)) * 2,
  );
}

function changeMagnitudePercentile(series: MetricSeries, periods = 20): number {
  const current = change(series, periods);
  if (current === undefined) return 0;
  const magnitudes: number[] = [];
  for (let index = periods; index < series.points.length; index += 1) {
    const start = series.points[index - periods].value;
    const end = series.points[index].value;
    if (start !== 0) magnitudes.push(Math.abs(((end / start) - 1) * 100));
  }
  if (magnitudes.length === 0) return 0.5;
  return magnitudes.filter((value) => value <= Math.abs(current)).length / magnitudes.length;
}

function persistence(series: MetricSeries): number {
  const points = series.points.slice(-6);
  if (points.length < 3) return 0.5;
  const moves = points.slice(1).map((point, index) => Math.sign(point.value - points[index].value));
  const positive = moves.filter((move) => move > 0).length;
  const negative = moves.filter((move) => move < 0).length;
  return Math.max(positive, negative) / moves.length;
}

function citation(series: MetricSeries, retrievedAt: string): Citation {
  return {
    publisher: series.provider,
    title: series.label,
    url: series.sourceUrl,
    sourceDate: latest(series)?.date ?? retrievedAt.slice(0, 10),
    retrievedAt,
    evidenceType: "primary",
  };
}

function factors(
  magnitudePercentile: number,
  series: MetricSeries,
  breadth = 0.5,
  crossAssetConfirmation = 0.5,
): SignificanceFactors {
  return {
    magnitudePercentile: clamp(magnitudePercentile),
    persistence: clamp(persistence(series)),
    breadth: clamp(breadth),
    novelty: novelty(series),
    crossAssetConfirmation: clamp(crossAssetConfirmation),
    evidenceQuality: 0.95,
  };
}

function makeSeriesCandidate(options: {
  id: string;
  series: MetricSeries;
  classification: StoryCandidate["classification"];
  title: string;
  verdict: string;
  stance: StoryCandidate["stance"];
  significance: number;
  confidence: number;
  metricValue: string;
  metricLabel?: string;
  falsifier: string;
  scoreFactors: SignificanceFactors;
  retrievedAt: string;
  emerging?: boolean;
}): StoryCandidate {
  return {
    id: options.id,
    domain: options.series.domain,
    classification: options.classification,
    title: options.title,
    verdict: options.verdict,
    stance: options.stance,
    significance: clamp(options.significance),
    confidence: clamp(options.confidence),
    decisiveMetric: {
      value: options.metricValue,
      label: options.metricLabel ?? options.series.label,
      sourceDate: latest(options.series)?.date ?? "",
    },
    falsifier: options.falsifier,
    falsifierState: "untriggered",
    entityRefs: [options.series.id],
    coverage: [options.series.provider],
    citations: [citation(options.series, options.retrievedAt)],
    scoreFactors: options.scoreFactors,
    emerging: options.emerging,
  };
}

function ratesCandidate(series: MetricSeries, retrievedAt: string): StoryCandidate | undefined {
  const point = latest(series);
  if (!point) return undefined;
  const rank = percentile(series.points, point.value);
  const high = point.value >= 1.5;
  return makeSeriesCandidate({
    id: `rates-real-yield-${point.date}`,
    series,
    classification: "regime",
    title: high ? "Real yields are still setting a high bar" : "The real cost of capital is easing",
    verdict: high
      ? "Long-duration assets still need exceptional growth while real yields remain elevated."
      : "Falling real yields are making duration less punitive across markets.",
    stance: high ? "wait" : "consider",
    significance: Math.abs(rank - 0.5) * 2,
    confidence: 0.9,
    metricValue: `${point.value.toFixed(2)}%`,
    falsifier: high
      ? "This changes if the real yield falls below 1.5% while credit remains contained."
      : "This changes if the real yield returns above 1.5%.",
    scoreFactors: factors(Math.abs(rank - 0.5) * 2, series, 0.7, 0.7),
    retrievedAt,
  });
}

function creditCandidate(series: MetricSeries, retrievedAt: string): StoryCandidate | undefined {
  const point = latest(series);
  if (!point) return undefined;
  const rank = percentile(series.points, point.value);
  const stressed = point.value >= 5;
  return makeSeriesCandidate({
    id: `credit-spread-${point.date}`,
    series,
    classification: stressed ? "risk" : "regime",
    title: stressed ? "Credit is demanding protection" : "Credit conditions remain contained",
    verdict: stressed
      ? "High-yield spreads are wide enough to challenge the risk backdrop."
      : "High-yield spreads are not confirming broad market stress.",
    stance: stressed ? "avoid" : "wait",
    significance: Math.abs(rank - 0.5) * 2,
    confidence: 0.92,
    metricValue: `${point.value.toFixed(2)}%`,
    falsifier: stressed
      ? "This changes if the spread falls below 4% and stays there for two weeks."
      : "This changes if the spread rises above 5%.",
    scoreFactors: factors(Math.abs(rank - 0.5) * 2, series, 0.75, 0.7),
    retrievedAt,
  });
}

function dollarCandidate(
  series: MetricSeries,
  retrievedAt: string,
  periods: number,
  horizon: "3m" | "1y",
): StoryCandidate | undefined {
  const point = latest(series);
  const move = change(series, periods);
  if (!point || move === undefined) return undefined;
  const rising = move > 0;
  return makeSeriesCandidate({
    id: `dollar-${horizon}-${point.date}`,
    series,
    classification: "regime",
    title: rising ? "The dollar is tightening global conditions" : "The dollar is giving global risk room",
    verdict: rising
      ? "A firmer dollar is adding pressure outside the United States."
      : "A softer dollar is reducing one source of pressure on global assets.",
    stance: rising ? "wait" : "consider",
    significance: changeMagnitudePercentile(series, periods),
    confidence: 0.84,
    metricValue: `${move >= 0 ? "+" : ""}${move.toFixed(1)}%`,
    metricLabel: `${periods}-session dollar move`,
    falsifier: rising
      ? `This changes if the ${periods}-session move turns negative.`
      : `This changes if the ${periods}-session move turns positive.`,
    scoreFactors: factors(changeMagnitudePercentile(series, periods), series, 0.6, 0.6),
    retrievedAt,
  });
}

function basketCandidate(
  id: string,
  domain: StoryDomain,
  series: MetricSeries[],
  retrievedAt: string,
  periods: number,
  horizon: "3m" | "1y",
): StoryCandidate | undefined {
  const rows = series.flatMap((item) => {
    const move = change(item, periods);
    return move === undefined ? [] : [{ item, move }];
  });
  if (rows.length < 2) return undefined;
  const positive = rows.filter((row) => row.move > 0).length;
  const breadth = positive / rows.length;
  const average = rows.reduce((sum, row) => sum + row.move, 0) / rows.length;
  const representative = [...rows].sort((a, b) => Math.abs(b.move) - Math.abs(a.move))[0].item;
  const magnitude = rows.reduce((sum, row) => sum + changeMagnitudePercentile(row.item, periods), 0) /
    rows.length;
  const constructive = average >= 0;
  const label = domain === "equities"
    ? "global equity breadth"
    : domain === "commodities"
    ? "commodity basket"
    : "crypto breadth";
  return {
    ...makeSeriesCandidate({
      id: `${id}-${horizon}-${latest(representative)?.date}`,
      series: representative,
      classification: constructive ? "opportunity" : "risk",
      title: constructive
        ? `${label[0].toUpperCase()}${label.slice(1)} is improving`
        : `${label[0].toUpperCase()}${label.slice(1)} is weakening`,
      verdict: `${positive} of ${rows.length} tracked markets are positive over ${periods} sessions.`,
      stance: constructive ? "consider" : "avoid",
      significance: magnitude,
      confidence: rows.length >= 3 ? 0.86 : 0.72,
      metricValue: `${positive} of ${rows.length}`,
      metricLabel: `positive over ${periods} sessions`,
      falsifier: constructive
        ? "This changes if fewer than half remain positive."
        : "This changes if more than half turn positive.",
      scoreFactors: factors(magnitude, representative, Math.max(breadth, 1 - breadth), 0.7),
      retrievedAt,
      emerging: rows.length < 3,
    }),
    domain,
    entityRefs: rows.map((row) => row.item.id),
    coverage: [...new Set(rows.map((row) => row.item.provider))],
    citations: rows.map((row) => citation(row.item, retrievedAt)),
  };
}

function industryCandidate(industries: IndustryPoint[], retrievedAt: string): StoryCandidate | undefined {
  if (industries.length < 10) return undefined;
  const leader = [...industries].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))[0];
  const positive = industries.filter((item) => item.changePercent > 0).length;
  const constructive = leader.changePercent > 0;
  const magnitudeRank =
    industries.filter((item) => Math.abs(item.changePercent) <= Math.abs(leader.changePercent)).length /
    industries.length;
  return {
    id: `industry-${leader.industry.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${leader.sourceDate}`,
    domain: "equities",
    classification: constructive ? "opportunity" : "risk",
    title: `${leader.industry} is the market's sharpest industry move`,
    verdict: `${positive} of ${industries.length} industries are positive in the same snapshot.`,
    stance: constructive ? "consider" : "avoid",
    significance: magnitudeRank,
    confidence: 0.82,
    decisiveMetric: {
      value: `${leader.changePercent >= 0 ? "+" : ""}${round(leader.changePercent)}%`,
      label: "industry move",
      sourceDate: leader.sourceDate,
      direction: leader.changePercent > 0 ? "up" : "down",
    },
    falsifier: constructive
      ? "This changes if the industry's next snapshot turns negative."
      : "This changes if the next snapshot turns positive.",
    falsifierState: "untriggered",
    entityRefs: [leader.industry],
    coverage: ["FMP industry snapshot"],
    citations: [{
      publisher: "FMP",
      title: "Industry performance snapshot",
      url: leader.sourceUrl,
      sourceDate: leader.sourceDate,
      retrievedAt,
      evidenceType: "primary",
    }],
    scoreFactors: {
      magnitudePercentile: magnitudeRank,
      persistence: 0.5,
      breadth: Math.max(positive / industries.length, 1 - positive / industries.length),
      novelty: magnitudeRank,
      crossAssetConfirmation: 0.5,
      evidenceQuality: 0.9,
    },
  };
}

export interface CandidateSet {
  candidates: StoryCandidate[];
  stableCheckpoints: StoryCandidate[];
}

function withCrossAssetConfirmation(candidates: StoryCandidate[]): StoryCandidate[] {
  const direction = (candidate: StoryCandidate) =>
    candidate.stance === "consider" ? 1 : candidate.stance === "avoid" ? -1 : 0;
  return candidates.map((candidate) => {
    const candidateDirection = direction(candidate);
    const otherDirections = candidates
      .filter((other) => other.domain !== candidate.domain)
      .map(direction)
      .filter((value) => value !== 0);
    const confirmation = candidateDirection === 0 || otherDirections.length === 0
      ? 0.5
      : otherDirections.filter((value) => value === candidateDirection).length / otherDirections.length;
    return {
      ...candidate,
      scoreFactors: { ...candidate.scoreFactors, crossAssetConfirmation: confirmation },
    };
  });
}

export function deriveCandidates(
  evidence: ProviderEvidence,
  retrievedAt: string,
  horizon: "3m" | "1y",
): CandidateSet {
  const byId = new Map(evidence.metrics.map((series) => [series.id, series]));
  const periods = horizon === "3m" ? 20 : 120;
  const baseCandidates = [
    byId.get("DFII10") ? ratesCandidate(byId.get("DFII10")!, retrievedAt) : undefined,
    byId.get("BAMLH0A0HYM2") ? creditCandidate(byId.get("BAMLH0A0HYM2")!, retrievedAt) : undefined,
    byId.get("DTWEXBGS") ? dollarCandidate(byId.get("DTWEXBGS")!, retrievedAt, periods, horizon) : undefined,
    basketCandidate(
      "equity-breadth",
      "equities",
      evidence.metrics.filter((item) => ["SPY", "IWM", "EFA", "EEM"].includes(item.id)),
      retrievedAt,
      periods,
      horizon,
    ),
    basketCandidate(
      "commodity-breadth",
      "commodities",
      evidence.metrics.filter((item) => ["GLD", "DBC"].includes(item.id)),
      retrievedAt,
      periods,
      horizon,
    ),
    basketCandidate(
      "crypto-breadth",
      "crypto",
      evidence.metrics.filter((item) => ["BITCOIN", "ETHEREUM", "SOLANA"].includes(item.id)),
      retrievedAt,
      periods,
      horizon,
    ),
    industryCandidate(evidence.industries, retrievedAt),
  ].filter((item): item is StoryCandidate => Boolean(item));
  const candidates = withCrossAssetConfirmation(baseCandidates);

  const checkpoints = candidates
    .filter((item) => ["credit", "rates", "equities"].includes(item.domain))
    .slice(0, 3)
    .map((item) => ({
      ...item,
      id: `checkpoint-${item.id}`,
      classification: "regime" as const,
      stance: "wait" as const,
      significance: 0.35,
      scoreFactors: { ...item.scoreFactors, magnitudePercentile: 0.35, novelty: 0.2 },
    }));

  return { candidates, stableCheckpoints: checkpoints };
}
