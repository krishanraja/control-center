import { useMemo, useState } from "react";
import type { CashBalance } from "../../lib/cash";
import { buildGroups, type IndustryEntry } from "../../lib/industryGroups";
import { usdRound } from "../../lib/spend/format";
import { dayMonth } from "../../lib/spend/runway";
import { SPEND_EXPLAIN } from "../../lib/words";
import { Segmented } from "../components/Segmented";
import { ChevronIcon } from "../components/Icons";

type View = "all" | "active" | "hidden";

interface Props {
  entries: IndustryEntry[];
  excluded: string[];
  saveError: string;
  onToggle: (industry: string) => void;
  /** Hide or show a whole list at once. The list is whatever is on screen. */
  onBulk: (industries: string[], hidden: boolean) => void;
  /** The latest cash on hand the member has saved, or null before the first one. */
  cash: CashBalance | null;
  cashError: string;
  /** Sample data cannot be written to an account, so the cash form is read-only. */
  demo: boolean;
  /** Resolves true when the row was written. Errors arrive through cashError. */
  onSaveCash: (balance: CashBalance) => Promise<boolean>;
}

const VIEW_NOTE: Record<View, string> = {
  all: "Open a sector to choose individual industries.",
  active: "Industries represented in today's company signals.",
  hidden: "Industries COMPOUND is leaving out.",
};

export const DEMO_CASH_NOTE = "Sample data. Cash on hand can be saved once COMPOUND is connected to your account.";

/** Today in the member's own calendar, not UTC, so a late evening entry keeps its date. */
export function todayIso(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function CashForm({ cash, cashError, demo, onSaveCash }: Pick<Props, "cash" | "cashError" | "demo" | "onSaveCash">) {
  const [amount, setAmount] = useState("");
  const [asOf, setAsOf] = useState(() => todayIso());
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const parsed = Number(amount.replace(/[,\s]/g, ""));
  const amountOk = amount.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(asOf);
  const canSave = !demo && !busy && amountOk && dateOk;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setSaved(false);
    const ok = await onSaveCash({ asOf, amountUsd: Math.round(parsed * 100) / 100 });
    setBusy(false);
    if (ok) {
      setSaved(true);
      setAmount("");
    }
  }

  return (
    <section className="cashform" aria-labelledby="cash-head">
      <div className="sechead"><h3 id="cash-head">Cash on hand</h3></div>
      <p className="sub">
        What is in the bank today, in US dollars. The Spend tab uses it to say how many months it would last. Runway is {SPEND_EXPLAIN.runway}. Burn is {SPEND_EXPLAIN.burn}.
      </p>
      {cash && <p className="sub note">Last entered {usdRound(cash.amountUsd)} as of {dayMonth(cash.asOf)}.</p>}
      <form
        className="cashfields"
        onSubmit={(event) => { event.preventDefault(); void save(); }}
      >
        <label className="cashfield">
          <span className="tn">Amount in US dollars</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            placeholder="0"
            value={amount}
            disabled={demo || busy}
            onChange={(event) => { setAmount(event.target.value); setSaved(false); }}
          />
        </label>
        <label className="cashfield">
          <span className="tn">As of</span>
          <input
            type="date"
            value={asOf}
            max={todayIso()}
            disabled={demo || busy}
            onChange={(event) => { setAsOf(event.target.value); setSaved(false); }}
          />
        </label>
        <button type="submit" className="pill cashsave" disabled={!canSave}>
          {busy ? "Saving…" : "Save cash on hand"}
        </button>
      </form>
      {demo && <p className="sub note">{DEMO_CASH_NOTE}</p>}
      {saved && !cashError && <p className="sub note" role="status">Saved. The Spend tab now uses this figure.</p>}
      {cashError && <p className="dn small" role="alert">{cashError}</p>}
    </section>
  );
}

export function SettingsSheet({ entries, excluded, saveError, onToggle, onBulk, cash, cashError, demo, onSaveCash }: Props) {
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<View>("all");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const hidden = new Set(excluded);

  const groups = useMemo(() => buildGroups(entries), [entries]);
  const withCompanies = entries.filter((entry) => entry.names > 0).length;
  const needle = filter.trim().toLowerCase();
  const searching = needle.length > 0;
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

  const listed = flat
    ? flatMembers.map((entry) => entry.industry)
    : shownGroups.flatMap((group) => group.members.map((entry) => entry.industry));
  const canHide = listed.filter((name) => !hidden.has(name)).length;
  const canShow = listed.filter((name) => hidden.has(name)).length;
  const viewNote = searching
    ? `${flatMembers.length} ${flatMembers.length === 1 ? "industry" : "industries"} match your search.`
    : view === "all"
      ? `${groups.length} sectors. ${VIEW_NOTE.all}`
      : VIEW_NOTE[view];

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
            {entry.names === 0
              ? "No companies today"
              : `${entry.names} ${entry.names === 1 ? "company" : "companies"} today`}
          </span>
        </span>
        <span className={visible ? "sw on" : "sw"} aria-hidden="true"><i /></span>
      </button>
    );
  }

  return (
    <div className="page settings-page">
      <h2 className="big nomargin">Choose what you explore</h2>
      <p className="sub">Hidden industries leave Markets and Ask. A materially significant Brief story still appears.</p>

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
        label="Show"
        choices={[
          { id: "all", name: "All", count: groups.length },
          { id: "active", name: "Active today", short: "Active", count: withCompanies },
          { id: "hidden", name: "Hidden", count: excluded.length },
        ]}
        value={view}
        onChange={(id) => setView(id as View)}
      />
      <p className="sub note">{viewNote}</p>

      {flat && listed.length > 0 && (
        <div className="bulk">
          <p className="eyebrow">
            {listed.length} listed
            {excluded.length > 0 && ` · ${excluded.length} hidden`}
          </p>
          <div className="bulk-actions">
            <button type="button" className="pill" disabled={canHide === 0} onClick={() => onBulk(listed, true)}>
              Hide listed {canHide > 0 ? canHide : ""}
            </button>
            <button type="button" className="pill" disabled={canShow === 0} onClick={() => onBulk(listed, false)}>
              Show listed {canShow > 0 ? canShow : ""}
            </button>
          </div>
        </div>
      )}

      {saveError && <p className="dn small">{saveError}</p>}

      <div className="rowbox settings-groups">
        {shownGroups.length === 0 && (
          <p className="sub empty">
            {view === "hidden" ? "Nothing is hidden." : "No industry matches that search."}
          </p>
        )}

        {flat && flatMembers.map((entry) => renderMember(entry))}

        {!flat && shownGroups.map((group) => {
          const memberNames = group.members.map((entry) => entry.industry);
          const visibleCount = memberNames.filter((name) => !hidden.has(name)).length;
          const allVisible = visibleCount === group.members.length;
          const partial = visibleCount > 0 && !allVisible;
          const opened = Boolean(openGroups[group.group]);
          const activeIndustries = group.members.filter((entry) => entry.names > 0).length;
          const state = allVisible ? "All" : partial ? "Some" : "None";
          const subtitle = allVisible
            ? `${group.members.length} industries · ${activeIndustries} active today`
            : partial
              ? `${visibleCount} of ${group.members.length} shown · ${activeIndustries} active today`
              : `${group.members.length} industries · Hidden`;
          const groupId = `industry-group-${group.group.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

          return (
            <div className={`group state-${state.toLowerCase()}`} key={group.group}>
              <div className="grouprow">
                <button
                  type="button"
                  className="groupname"
                  aria-expanded={opened}
                  aria-controls={groupId}
                  onClick={() => setOpenGroups((current) => ({ ...current, [group.group]: !current[group.group] }))}
                >
                  <span className={opened ? "chev open" : "chev"} aria-hidden="true"><ChevronIcon /></span>
                  <span className="groupcopy">
                    <span className="tn">{group.group}</span>
                    <span className="ts">{subtitle}</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={partial ? "mixed" : allVisible}
                  aria-label={`Show ${group.group} industries`}
                  className="groupcontrol"
                  onClick={() => onBulk(memberNames, allVisible)}
                >
                  <span className="groupstate">{state}</span>
                  <span className={allVisible ? "sw on" : partial ? "sw mixed" : "sw"} aria-hidden="true"><i /></span>
                </button>
              </div>
              {opened && <div id={groupId} className="groupmembers">{group.members.map((entry) => renderMember(entry, true))}</div>}
            </div>
          );
        })}
      </div>

      {excluded.length > 0 && (
        <button type="button" className="askbtn ghost" onClick={() => onBulk(excluded, false)}>
          Show all industries
        </button>
      )}

      <CashForm cash={cash} cashError={cashError} demo={demo} onSaveCash={onSaveCash} />
    </div>
  );
}
