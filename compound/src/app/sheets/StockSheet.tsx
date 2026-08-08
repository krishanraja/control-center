import { SIGNAL_ORDER, SIGNAL_SOURCES, agreementLabel, whatItWouldTake } from "../../lib/agreement";
import { pct1, plain1, ratio } from "../../lib/format";
import { CHECK_NAME, EXPLAIN } from "../../lib/words";
import type { AgreementRow, CompanyRow, SignalName } from "../../types";
import { AgreementKey, AgreementMeter } from "../components/AgreementMeter";

function reading(row: AgreementRow, signal: SignalName): string {
  if (signal === "price") return pct1(row.m1);
  if (signal === "analysts") return row.breadth != null ? `${row.breadth}% say buy` : "nobody rates it";
  if (signal === "news") return row.sent != null ? `${row.sent > 0 ? "good" : "bad"}, ${row.sent.toFixed(2)}` : "no coverage";
  return row.rev != null ? pct1(row.rev) : "not reported";
}

export function StockSheet({
  row,
  company,
  onAsk,
}: {
  row: AgreementRow;
  company: CompanyRow | undefined;
  onAsk: (question: string) => void;
}) {
  return (
    <div className="page">
      <h2 className="big nomargin">{company?.name || row.name || row.symbol}</h2>
      <p className="sub">{row.symbol} · {row.industry}</p>

      <div className="metervis">
        <AgreementMeter row={row} />
        <AgreementKey />
      </div>

      <div className="rowbox">
        {SIGNAL_ORDER.map((signal) => {
          const vote = row.signals[signal];
          return (
            <div className="tog" key={signal}>
              <div>
                <div className="tn">{CHECK_NAME[signal]}</div>
                <div className="ts">{SIGNAL_SOURCES[signal]}</div>
              </div>
              <div className="togval">
                <span className={`num ${vote > 0 ? "up" : vote < 0 ? "dn" : "mut"}`}>{reading(row, signal)}</span>
                <i className={vote > 0 ? "u" : vote < 0 ? "d" : ""} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="verdict">
        <div className="ctag">What would change this</div>
        <p>{whatItWouldTake(row)}</p>
      </div>

      {company && (
        <div className="rowbox">
          <div className="tog">
            <div><div className="tn">Price</div></div>
            <div className="togval"><span className="num">{company.price != null ? ratio(company.price, 2) : "not available"}</span></div>
          </div>
          <div className="tog">
            <div><div className="tn">Change over 3 months</div></div>
            <div className="togval"><span className={`num ${(company.m3 ?? 0) > 0 ? "up" : "dn"}`}>{pct1(company.m3)}</span></div>
          </div>
          <div className="tog">
            <div>
              <div className="tn">Price vs profit</div>
              <div className="ts">{EXPLAIN.peRatio}</div>
            </div>
            <div className="togval"><span className="num">{ratio(company.pe)}</span></div>
          </div>
          {company.gm != null && (
            <div className="tog">
              <div>
                <div className="tn">Profit kept per sale</div>
                <div className="ts">{EXPLAIN.margin}</div>
              </div>
              <div className="togval"><span className="num">{plain1(company.gm * 100)}</span></div>
            </div>
          )}
        </div>
      )}

      <button type="button" className="askbtn" onClick={() => onAsk(`Should I look harder at ${row.symbol}?`)}>
        Ask about {row.symbol}
      </button>

      <div className="footnote">
        Right now: {agreementLabel(row)}. Sources: FMP for the price, expert ratings and sales, Marketaux for the news.
      </div>
    </div>
  );
}
