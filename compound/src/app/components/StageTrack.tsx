import type { Stage } from "../../types";

/**
 * The five-stage disruption track: nothing yet, story only, numbers move,
 * repriced, settled. Stages before the current one read as done, not as empty.
 */
export function StageTrack({ stage, stages }: { stage: number; stages: Stage[] }) {
  const names = stages.length
    ? stages
    : [
      { stage: 1, name: "Nothing yet", desc: "No visible effect" },
      { stage: 2, name: "Story only", desc: "Headlines, no numbers" },
      { stage: 3, name: "Numbers move", desc: "Growth or margin shifts" },
      { stage: 4, name: "Repriced", desc: "Valuation resets" },
      { stage: 5, name: "Settled", desc: "Winners and losers clear" },
    ];
  const current = names.find((entry) => entry.stage === stage);

  return (
    <div className="stagewrap">
      <div className="track" role="img" aria-label={`Stage ${stage} of ${names.length}: ${current?.name ?? "unknown"}. ${current?.desc ?? ""}`}>
        {names.map((entry) => (
          <div
            key={entry.stage}
            className={entry.stage === stage ? "on" : entry.stage < stage ? "past" : ""}
          />
        ))}
      </div>
      <div className="tracklab" aria-hidden="true">
        {names.map((entry) => <span key={entry.stage} className={entry.stage === stage ? "sig" : ""}>{entry.name}</span>)}
      </div>
    </div>
  );
}
