import { SIGNAL_ORDER, SIGNAL_SOURCES, agreementLabel, whatItWouldTake } from "../../lib/agreement";
import { pct1, plain1, ratio } from "../../lib/format";
import type { AgreementRow, CompanyRow, SignalName } from "../../types";
import { AgreementKey, AgreementMeter } from "../components/AgreementMeter";

function reading(row: AgreementRow, signal: SignalName): string {
  if (signal === "price") return pct1(row.m1);
  if (signal === "analysts") return row.breadth != null ? `${row.breadth}% positive` : "no ratings";
  if (signal === "news") return row.sent != null ? `${row.sent > 0 ? "positive" : "negative"} ${row.sent.toFixed(2)}` : "no coverage";
  return row.rev != null ? pct1(row.rev) : "not filed";
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
    <div className="pad">
      <h2 className="big nomargin">{company?.name || row.name || row.symbol}</h2>
      <p className="sub">{row.industry}</p>

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
                <div className="tn">{signal}</div>
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
        <div className="ctag">What it would take</div>
        <p>{whatItWouldTake(row)}</p>
      </div>

      {company && (
        <div className="rowbox">
          <div className="tog">
            <div><div className="tn">Price</div></div>
            <div className="togval"><span className="num">{company.price != null ? ratio(company.price, 2) : "n/a"}</span></div>
          </div>
          <div className="tog">
            <div><div className="tn">3 month move</div></div>
            <div className="togval"><span className={`num ${(company.m3 ?? 0) > 0 ? "up" : "dn"}`}>{pct1(company.m3)}</span></div>
          </div>
          <div className="tog">
            <div><div className="tn">Price to earnings</div></div>
            <div className="togval"><span className="num">{ratio(company.pe)}</span></div>
          </div>
          {company.gm != null && (
            <div className="tog">
              <div><div className="tn">Gross margin</div></div>
              <div className="togval"><span className="num">{plain1(company.gm * 100)}</span></div>
            </div>
          )}
        </div>
      )}

      <div className="footnote">
        Reading: {agreementLabel(row)}. Sources: FMP price and grades history, Marketaux entity sentiment, FMP financial
        growth.
      </div>
      <button type="button" className="askbtn" onClick={() => onAsk(`Should I look harder at ${row.symbol}?`)}>
        Ask about {row.symbol} →
      </button>
    </div>
  );
}
