import { useMemo, useState } from "react";
import type { Snapshot } from "../../types";
import { buildGroups, type IndustryEntry } from "../../lib/industryGroups";
import { Segmented } from "../components/Segmented";
import { ChevronIcon } from "../components/Icons";

type View = "all" | "active" | "hidden";

interface Props {
  snapshot: Snapshot;
  excluded: string[];
  saveError: string;
  onToggle: (industry: string) => void;
  /** Hide or show a whole list at once. The list is whatever is on screen. */
  onBulk: (industries: string[], hidden: boolean) => void;
}

/** One line under the filter saying, in plain words, what the view is showing. */
const VIEW_NOTE: Record<View, string> = {
  all: "Every industry in today's run, rolled up into families.",
  active: "Only industries with at least one company in today's data — the ones you can act on now.",
  hidden: "The industries you have switched off.",
};

/**
 * The 123 industries roll up into families ("Software", "Oil & Gas", "REIT")
 * so the list is scannable. A family switch hides or shows everything under it
 * in one tap; open a family to reach the industries inside it. Turning one off
 * hides it on Stocks and in the Trends list, and the setting follows you rather
 * than the browser you happened to open.
 *
 * Search, or the "Active" and "Hidden" views, drop the families and show a flat
 * list so a specific industry is one tap away.
 */
export function SettingsSheet({ snapshot, excluded, saveError, onToggle, onBulk }: Props) {
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<View>("all");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const hidden = new Set(excluded);

  const entries = useMemo<IndustryEntry[]>(() => {
    const names = new Set<string>([
      ...snapshot.industries.map((row) => row.industry),
      ...snapshot.agreement.map((row) => row.industry),
      ...snapshot.companies.map((row) => row.industry),
    ]);
    const counts = new Map<string, number>();
    for (const row of snapshot.agreement) counts.set(row.industry, (counts.get(row.industry) ?? 0) + 1);
    return [...names].map((industry) => ({ industry, names: counts.get(industry) ?? 0 }));
  }, [snapshot]);

  const groups = useMemo(() => buildGroups(entries), [entries]);
  const withCompanies = entries.filter((entry) => entry.names > 0).length;

  const needle = filter.trim().toLowerCase();
  const searching = needle.length > 0;
  // Search and the two narrow views flatten to a plain list; only the resting
  // "all" view rolls the industries up into families.
  const flat = searching || view !== "all";

  function passes(entry: IndustryEntry, group: string): boolean {
    if (view === "active" && entry.names === 0) return false;
    if (view === "hidden" && !hidden.has(entry.industry)) return false;
    if (needle && !entry.industry.toLowerCase().includes(needle) && !group.toLowerCase().includes(needle)) return false;
    return true;
  }

  const shownGroups = groups
    .map((group) => ({ ...group, members: group.members.filter((entry) => passes(entry, group.group)) }))
    .filter((group) => group.members.length > 0);

  const flatMembers = shownGroups
    .flatMap((group) => group.members)
    .sort((a, b) => a.industry.localeCompare(b.industry));

  const listed = flat ? flatMembers.map((entry) => entry.industry) : shownGroups.flatMap((group) => group.members.map((entry) => entry.industry));
  const canHide = listed.filter((name) => !hidden.has(name)).length;
  const canShow = listed.filter((name) => hidden.has(name)).length;

  function renderMember(entry: IndustryEntry, inGroup = false) {
    const visible = !hidden.has(entry.industry);
    return (
      <button
        type="button"
        className={inGroup ? "tog toggle member" : "tog toggle"}
        key={entry.industry}
        role="switch"
        aria-checked={visible}
        onClick={() => onToggle(entry.industry)}
      >
        <span>
          <span className="tn">{entry.industry}</span>
          <span className="ts">
            {entry.names === 0 ? "nothing today" : `${entry.names} ${entry.names === 1 ? "company" : "companies"}`}
          </span>
        </span>
        <span className={visible ? "sw on" : "sw"} aria-hidden="true"><i /></span>
      </button>
    );
  }

  return (
    <div className="page">
      <h2 className="big nomargin">What you want to see</h2>
      <p className="sub">Switch off any industry — or a whole family — you never want to look at. It disappears everywhere in the app.</p>

      <div className="settingsbar">
        <input
          type="search"
          aria-label="Search industries"
          placeholder={`Search ${entries.length} industries`}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>

      <Segmented
        label="Which industries to list"
        choices={[
          { id: "all", name: "All", count: groups.length },
          { id: "active", name: "Active today", short: "Active", count: withCompanies },
          { id: "hidden", name: "Hidden", count: excluded.length },
        ]}
        value={view}
        onChange={(id) => setView(id as View)}
        wrap
      />
      <p className="sub note">{VIEW_NOTE[view]}</p>

      {/* The two buttons act on the list below them, so what they will do is
          always visible. Narrow the list first, then act on all of it. */}
      <div className="bulk">
        <p className="eyebrow">
          {flat ? `${listed.length} listed` : `${shownGroups.length} families`}
          {excluded.length > 0 && ` · ${excluded.length} hidden`}
        </p>
        <div className="bulk-actions">
          <button type="button" className="pill" disabled={canHide === 0} onClick={() => onBulk(listed, true)}>
            Hide these {canHide > 0 ? canHide : ""}
          </button>
          <button type="button" className="pill" disabled={canShow === 0} onClick={() => onBulk(listed, false)}>
            Show these {canShow > 0 ? canShow : ""}
          </button>
        </div>
      </div>

      {saveError && <p className="dn small">{saveError}</p>}

      <div className="rowbox">
        {shownGroups.length === 0 && (
          <p className="sub empty">
            {view === "hidden" ? "You have not hidden anything yet." : "No industry matches that."}
          </p>
        )}

        {flat && flatMembers.map((entry) => renderMember(entry))}

        {!flat && shownGroups.map((group) => {
          if (group.members.length === 1) return renderMember(group.members[0]);
          const memberNames = group.members.map((entry) => entry.industry);
          const visibleCount = memberNames.filter((name) => !hidden.has(name)).length;
          const anyVisible = visibleCount > 0;
          const partial = visibleCount > 0 && visibleCount < group.members.length;
          const opened = Boolean(openGroups[group.group]);
          return (
            <div className="group" key={group.group}>
              <div className="grouprow">
                <button
                  type="button"
                  className="groupname"
                  aria-expanded={opened}
                  onClick={() => setOpenGroups((current) => ({ ...current, [group.group]: !current[group.group] }))}
                >
                  <span className={opened ? "chev open" : "chev"} aria-hidden="true"><ChevronIcon /></span>
                  <span>
                    <span className="tn">{group.group}</span>
                    <span className="ts">
                      {group.members.length} industries · {partial
                        ? `${visibleCount} of ${group.members.length} shown`
                        : `${group.companies} ${group.companies === 1 ? "company" : "companies"}`}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={anyVisible}
                  aria-label={`Show ${group.group}`}
                  className={anyVisible ? "sw on" : "sw"}
                  onClick={() => onBulk(memberNames, anyVisible)}
                >
                  <i />
                </button>
              </div>
              {opened && group.members.map((entry) => renderMember(entry, true))}
            </div>
          );
        })}
      </div>

      {excluded.length > 0 && (
        <button type="button" className="askbtn ghost" onClick={() => onBulk(excluded, false)}>
          Show everything again
        </button>
      )}
    </div>
  );
}
