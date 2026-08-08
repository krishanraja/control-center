import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { shortDate } from "../../lib/format";
import { SECTION_ORDER, SECTION_SHORT } from "../../lib/words";
import type { TabKey } from "../../types";
import { ChevronIcon, GearIcon, TabIcon } from "../components/Icons";

interface Props {
  tab: TabKey;
  onTab: (tab: TabKey) => void;
  onSettings: () => void;
  /** The day these numbers are from. Freshness belongs in the frame. */
  generated: string;
  demo: boolean;
  /** Rendered over the content, below the tab bar, when something is open. */
  sheet: { title: string; body: ReactNode } | null;
  onCloseSheet: () => void;
  closeRef: RefObject<HTMLButtonElement>;
  children: ReactNode;
}

/**
 * The phone frame. A slim bar at the top holds the wordmark and settings, the
 * section title lives at the top of the page where a large title belongs, and
 * the tabs sit at the bottom inside thumb reach.
 *
 * Detail arrives as a sheet that covers the content and slides up from it. The
 * tab bar stays put underneath, so opening a stock never traps anyone: the way
 * out is a full width Back target at the top and every section is still one
 * tap away at the bottom.
 */
export function PhoneFrame({ tab, onTab, onSettings, generated, demo, sheet, onCloseSheet, closeRef, children }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);

  // A sheet covers the content, so the content behind it stops being part of
  // the page: no tab stops, nothing for a screen reader to wander into, and
  // nothing a stray tap can reach through the sheet.
  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    if (sheet) node.setAttribute("inert", "");
    else node.removeAttribute("inert");
  }, [sheet]);

  return (
    <div className="app">
      <div className="appbar">
        <span className="brand">COMPOUND</span>
        <span className="barend">
          <span className="stamp">{demo ? "Sample data" : shortDate(generated)}</span>
          <button type="button" className="iconbtn" aria-label="Settings" onClick={onSettings}>
            <GearIcon />
          </button>
        </span>
      </div>

      <div className="sheetwrap">
        <div className="scroll" ref={contentRef} aria-hidden={sheet ? true : undefined}>{children}</div>
        {sheet && (
          <div className="sheet" role="dialog" aria-modal="true" aria-label={sheet.title}>
            <div className="grabber" aria-hidden="true" />
            <div className="sheethead">
              <button type="button" className="backbtn" ref={closeRef} onClick={onCloseSheet}>
                <ChevronIcon />Back
              </button>
              <span className="sheettitle">{sheet.title}</span>
              <span className="spacer" aria-hidden="true" />
            </div>
            <div className="scroll">{sheet.body}</div>
          </div>
        )}
      </div>

      <nav className="botnav" aria-label="Sections">
        {SECTION_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "on" : ""}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => onTab(key)}
          >
            <span className="puck"><TabIcon tab={key} /></span>
            {SECTION_SHORT[key]}
          </button>
        ))}
      </nav>
    </div>
  );
}
