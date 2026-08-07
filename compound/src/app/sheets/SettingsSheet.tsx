import { useMemo, useState } from "react";
import type { Snapshot } from "../../types";

interface Props {
  snapshot: Snapshot;
  excluded: string[];
  saveError: string;
  onToggle: (industry: string) => void;
  onClearAll: () => void;
}

/**
 * Every industry in the run gets a toggle. Turning one off hides it on Stocks
 * and in the Shifts industry map, and the setting follows the member rather
 * than the browser.
 */
export function SettingsSheet({ snapshot, excluded, saveError, onToggle, onClearAll }: Props) {
  const [filter, setFilter] = useState("");
  const hidden = new Set(excluded);

  const industries = useMemo(() => {
    const names = new Set<string>([
      ...snapshot.industries.map((row) => row.industry),
      ...snapshot.agreement.map((row) => row.industry),
      ...snapshot.companies.map((row) => row.industry),
    ]);
    const counts = new Map<string, number>();
    for (const row of snapshot.agreement) counts.set(row.industry, (counts.get(row.industry) ?? 0) + 1);
    return [...names].sort().map((industry) => ({ industry, names: counts.get(industry) ?? 0 }));
  }, [snapshot]);

  const needle = filter.trim().toLowerCase();
  const shown = needle ? industries.filter((entry) => entry.industry.toLowerCase().includes(needle)) : industries;

  return (
    <div className="pad">
      <h2 className="big nomargin">Industries</h2>
      <p className="sub">Turn off anything you never want to see. Applies everywhere.</p>

      <div className="settingsbar">
        <input
          type="search"
          aria-label="Filter industries"
          placeholder={`Filter ${industries.length} industries`}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <button type="button" className="pill" onClick={onClearAll} disabled={excluded.length === 0}>
          Show all
        </button>
      </div>

      <p className="eyebrow">
        {excluded.length === 0 ? "Nothing hidden" : `${excluded.length} hidden`}
        {needle && ` · ${shown.length} matching`}
      </p>
      {saveError && <p className="dn small">{saveError}</p>}

      <div className="rowbox">
        {shown.length === 0 && <p className="sub empty">No industry matches that.</p>}
        {shown.map((entry) => {
          const visible = !hidden.has(entry.industry);
          return (
            <button
              type="button"
              className="tog toggle"
              key={entry.industry}
              role="switch"
              aria-checked={visible}
              onClick={() => onToggle(entry.industry)}
            >
              <span>
                <span className="tn">{entry.industry}</span>
                <span className="ts">{entry.names === 0 ? "no names today" : `${entry.names} ${entry.names === 1 ? "name" : "names"}`}</span>
              </span>
              <span className={visible ? "sw on" : "sw"} aria-hidden="true"><i /></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
