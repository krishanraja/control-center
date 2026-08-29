import {
  type BriefBuildInput,
  type BriefStory,
  type DailyBrief,
  ENGINE_VERSION,
  type SignificanceFactors,
  type StoryCandidate,
} from "./model.ts";

const MIN_ACTION_SCORE = 0.55;
const MIN_EVIDENCE_QUALITY = 0.5;

const WEIGHTS: Readonly<Record<keyof SignificanceFactors, number>> = {
  magnitudePercentile: 0.24,
  persistence: 0.16,
  breadth: 0.16,
  novelty: 0.14,
  crossAssetConfirmation: 0.14,
  evidenceQuality: 0.16,
};

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function scoreCandidate(candidate: StoryCandidate): number {
  const factorScore = (Object.keys(WEIGHTS) as Array<keyof SignificanceFactors>)
    .reduce((sum, key) => sum + clampUnit(candidate.scoreFactors[key]) * WEIGHTS[key], 0);
  return Number((factorScore * 0.8 + clampUnit(candidate.significance) * 0.2).toFixed(6));
}

function compareCandidates(a: StoryCandidate, b: StoryCandidate): number {
  const scoreDifference = scoreCandidate(b) - scoreCandidate(a);
  if (scoreDifference !== 0) return scoreDifference;
  const confidenceDifference = clampUnit(b.confidence) - clampUnit(a.confidence);
  if (confidenceDifference !== 0) return confidenceDifference;
  return a.id.localeCompare(b.id);
}

function isSupported(candidate: StoryCandidate): boolean {
  return candidate.citations.length > 0 &&
    candidate.coverage.length > 0 &&
    candidate.falsifier.trim().length > 0 &&
    clampUnit(candidate.scoreFactors.evidenceQuality) >= MIN_EVIDENCE_QUALITY;
}

function rankThree(candidates: StoryCandidate[]): [BriefStory, BriefStory, BriefStory] {
  const sorted = [...candidates].sort(compareCandidates);
  if (sorted.length < 3) {
    throw new Error("A published brief requires three independently supported positions");
  }

  const selected: StoryCandidate[] = [sorted[0]];
  const remaining = sorted.slice(1);

  while (selected.length < 3) {
    const distinctIndex = remaining.findIndex((candidate) =>
      !selected.some((item) => item.domain === candidate.domain)
    );
    const nextIndex = distinctIndex >= 0 ? distinctIndex : 0;
    selected.push(remaining.splice(nextIndex, 1)[0]);
  }

  return selected.map((candidate, index) => ({
    ...candidate,
    portfolioAnnotation: undefined,
    rank: (index + 1) as 1 | 2 | 3,
    selectionScore: scoreCandidate(candidate),
  })) as [BriefStory, BriefStory, BriefStory];
}

export function buildDailyBrief(input: BriefBuildInput): DailyBrief {
  const supported = input.candidates.filter(isSupported);
  const actionable = supported.filter((candidate) => scoreCandidate(candidate) >= MIN_ACTION_SCORE);
  const quiet = actionable.length === 0;
  const checkpoints = input.stableCheckpoints.filter(isSupported);
  const pool = quiet ? checkpoints : [
    ...actionable,
    ...checkpoints.filter((checkpoint) =>
      !actionable.some((candidate) =>
        candidate.id === checkpoint.id ||
        candidate.entityRefs.some((entity) => checkpoint.entityRefs.includes(entity))
      )
    ),
  ];

  if (quiet && pool.length < 2) {
    throw new Error("A quiet brief requires two supported stability checkpoints");
  }

  const quietLead = quiet ? createQuietLead(input, pool) : undefined;
  const stories = rankThree(quietLead ? [quietLead, ...pool] : pool);

  return {
    state: quiet ? "quiet" : "representative",
    asOf: input.asOf,
    generatedAt: input.generatedAt,
    engineVersion: ENGINE_VERSION,
    stories,
    coverageLimitations: [...new Set(input.coverageLimitations ?? [])].sort(),
  };
}

function createQuietLead(input: BriefBuildInput, checkpoints: StoryCandidate[]): StoryCandidate {
  const citation =
    checkpoints.flatMap((item) => item.citations).sort((a, b) =>
      a.publisher.localeCompare(b.publisher) || a.url.localeCompare(b.url)
    )[0];

  return {
    id: `quiet-${input.asOf}`,
    domain: "macro",
    classification: "regime",
    title: "Nothing needs action",
    verdict: "No supported signal cleared COMPOUND's market-significance threshold.",
    stance: "wait",
    significance: 0,
    confidence: Math.min(...checkpoints.map((item) => clampUnit(item.confidence))),
    decisiveMetric: {
      value: "Stable",
      label: "market-wide signal check",
      sourceDate: input.asOf,
      direction: "flat",
    },
    falsifier: "This changes when a supported signal clears the significance threshold.",
    falsifierState: "untriggered",
    entityRefs: [],
    coverage: [...new Set(checkpoints.flatMap((item) => item.coverage))],
    citations: citation ? [citation] : [],
    scoreFactors: {
      magnitudePercentile: 1,
      persistence: 1,
      breadth: 1,
      novelty: 1,
      crossAssetConfirmation: 1,
      evidenceQuality: 1,
    },
  };
}

export function annotatePortfolioRelevance(
  brief: DailyBrief,
  annotations: ReadonlyMap<string, string>,
): DailyBrief {
  return {
    ...brief,
    stories: brief.stories.map((story) => ({
      ...story,
      portfolioAnnotation: annotations.get(story.id),
    })) as [BriefStory, BriefStory, BriefStory],
  };
}
