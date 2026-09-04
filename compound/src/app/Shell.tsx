import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import { useDevice } from "../lib/device";
import type { CompoundConfig } from "../lib/env";
import { buildGroups, KNOWN_FMP_INDUSTRIES, type IndustryEntry } from "../lib/industryGroups";
import { loadExclusions, readLocalExclusions, saveExclusions, toggleIn, writeLocalExclusions } from "../lib/settings";
import { getSupabase } from "../lib/supabase";
import { SECTION_ORDER } from "../lib/words";
import type { BriefStory, CompoundDay, IndustryRow, TabKey } from "../types";
import { DeviceProvider } from "./DeviceProvider";
import { SectorDetail } from "./components/SectorDetail";
import { StoryDetail } from "./components/StoryDetail";
import { DeskFrame } from "./frames/DeskFrame";
import { PhoneFrame } from "./frames/PhoneFrame";
import { HistorySheet } from "./sheets/HistorySheet";
import { SettingsSheet } from "./sheets/SettingsSheet";
import { AskTab } from "./tabs/AskTab";
import { BriefTab } from "./tabs/BriefTab";
import { MarketsTab } from "./tabs/MarketsTab";
import { PortfolioTab } from "./tabs/PortfolioTab";
import { PropertyTab } from "./tabs/PropertyTab";
import { SpendTab } from "./tabs/SpendTab";

type Sheet =
  | { kind: "settings" }
  | { kind: "history" }
  | { kind: "story"; story: BriefStory }
  | { kind: "sector"; sector: string }
  | null;

interface Props {
  day: CompoundDay;
  config: CompoundConfig;
  session: Session | null;
  tab: TabKey;
  onTab: (tab: TabKey) => void;
}

export function Shell({ day, config, session, tab, onTab }: Props) {
  const device = useDevice();
  const split = device.layout === "split";
  const userId = session?.user.id ?? null;
  const [sheet, setSheet] = useState<Sheet>(null);
  const [pendingAsk, setPendingAsk] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<string[]>(() => readLocalExclusions(userId));
  const [saveError, setSaveError] = useState("");
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const industryEntries = useMemo<IndustryEntry[]>(() => {
    if (day.legacy) {
      const names = new Set<string>([
        ...day.legacy.industries.map((row) => row.industry),
        ...day.legacy.agreement.map((row) => row.industry),
        ...day.legacy.companies.map((row) => row.industry),
      ]);
      const counts = new Map<string, number>();
      for (const row of day.legacy.agreement) counts.set(row.industry, (counts.get(row.industry) ?? 0) + 1);
      return [...names].map((industry) => ({ industry, names: counts.get(industry) ?? 0 }));
    }
    const captured = day.archive.payload.evidence?.industries ?? [];
    const industries = captured.length > 0 ? captured.map((row) => row.industry) : KNOWN_FMP_INDUSTRIES;
    return industries.map((industry) => ({ industry, names: 0 }));
  }, [day]);

  const industryRows = useMemo(
    () => new Map<string, IndustryRow>((day.legacy?.industries ?? []).map((row) => [row.industry, row])),
    [day],
  );

  useEffect(() => {
    if (config.mode !== "live" || !userId) return;
    let mounted = true;
    void loadExclusions(getSupabase(config), userId)
      .then((saved) => {
        if (!mounted) return;
        setExcluded(saved);
        writeLocalExclusions(userId, saved);
      })
      .catch((reason: unknown) => {
        if (mounted) setSaveError(reason instanceof Error ? reason.message : "Your saved settings could not be read.");
      });
    return () => { mounted = false; };
  }, [config, userId]);

  useEffect(() => {
    if (sheet) closeRef.current?.focus();
    else returnFocusRef.current?.focus();
  }, [sheet]);

  const openSheet = useCallback((next: Sheet) => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSheet(next);
  }, []);
  const closeSheet = useCallback(() => setSheet(null), []);

  useEffect(() => {
    if (!split) return;
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const typing = target instanceof HTMLElement
        && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "Escape") {
        setSheet((current) => current ? null : current);
        return;
      }
      if (typing) return;
      const index = Number(event.key);
      if (Number.isInteger(index) && index >= 1 && index <= SECTION_ORDER.length) {
        onTab(SECTION_ORDER[index - 1]);
        setSheet(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [split, onTab]);

  function persist(next: string[]) {
    setExcluded(next);
    writeLocalExclusions(userId, next);
    setSaveError("");
    if (config.mode === "live" && userId) {
      void saveExclusions(getSupabase(config), userId, next).catch((reason: unknown) => {
        setSaveError(reason instanceof Error ? reason.message : "That setting was not saved to your account.");
      });
    }
  }

  function askAbout(question: string) {
    setSheet(null);
    setPendingAsk(question);
    onTab("ask");
  }

  function sheetTitle(): string {
    if (!sheet) return "";
    if (sheet.kind === "settings") return "Industry settings";
    if (sheet.kind === "history") return "Market history";
    if (sheet.kind === "sector") return sheet.sector;
    return sheet.story.title;
  }

  function sheetBody() {
    if (!sheet) return null;
    if (sheet.kind === "settings") {
      return (
        <SettingsSheet
          entries={industryEntries}
          excluded={excluded}
          saveError={saveError}
          onToggle={(industry) => persist(toggleIn(excluded, industry))}
          onBulk={(industries, hide) => persist(hide
            ? [...new Set([...excluded, ...industries])]
            : excluded.filter((entry) => !industries.includes(entry)))}
        />
      );
    }
    if (sheet.kind === "history") return <HistorySheet day={day} session={session} demo={config.mode === "demo"} />;
    if (sheet.kind === "story") return <StoryDetail story={sheet.story} onAsk={askAbout} />;
    const group = buildGroups(industryEntries).find((item) => item.group === sheet.sector);
    if (!group) return <div className="page"><p className="sub">That sector is not in this snapshot.</p></div>;
    return (
      <SectorDetail
        sector={group.group}
        members={group.members}
        rows={industryRows}
        excluded={excluded}
        onToggle={(industry) => persist(toggleIn(excluded, industry))}
      />
    );
  }

  function tabBody() {
    if (tab === "brief") return <BriefTab day={day} onStory={(story) => openSheet({ kind: "story", story })} />;
    if (tab === "markets") {
      return (
        <MarketsTab
          day={day}
          entries={industryEntries}
          excluded={excluded}
          onStory={(story) => openSheet({ kind: "story", story })}
          onSector={(sector) => openSheet({ kind: "sector", sector })}
        />
      );
    }
    if (tab === "portfolio") return <PortfolioTab day={day} />;
    if (tab === "property") return <PropertyTab config={config} session={session} onAsk={askAbout} />;
    if (tab === "spend") return <SpendTab config={config} session={session} onAsk={askAbout} />;
    return (
      <AskTab
        day={day}
        config={config}
        session={session}
        pending={pendingAsk}
        onConsumed={() => setPendingAsk(null)}
      />
    );
  }

  const page = <div className="page calm-page">{tabBody()}</div>;
  const panel = sheet ? { title: sheetTitle(), body: sheetBody() } : null;
  const generated = `${day.archive.snapshot_date}T12:00:00.000Z`;

  return (
    <DeviceProvider device={device}>
      <div className={`shell ${device.layout} ${device.input}`} style={{ "--px": `${device.scale}px` } as CSSProperties}>
        {split ? (
          <DeskFrame
            tab={tab}
            onTab={(next) => { onTab(next); setSheet(null); }}
            onSettings={() => openSheet({ kind: "settings" })}
            onHistory={() => openSheet({ kind: "history" })}
            generated={generated}
            demo={config.mode === "demo"}
            panel={panel}
            onClosePanel={closeSheet}
            closeRef={closeRef}
          >
            {page}
          </DeskFrame>
        ) : (
          <PhoneFrame
            tab={tab}
            onTab={(next) => { onTab(next); setSheet(null); }}
            onSettings={() => openSheet({ kind: "settings" })}
            onHistory={() => openSheet({ kind: "history" })}
            generated={generated}
            demo={config.mode === "demo"}
            sheet={panel}
            onCloseSheet={closeSheet}
            closeRef={closeRef}
          >
            {page}
          </PhoneFrame>
        )}
      </div>
    </DeviceProvider>
  );
}
