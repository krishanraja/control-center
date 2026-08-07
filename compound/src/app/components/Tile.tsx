export function Tile({ label, value, detail, signal = false }: { label: string; value: string; detail: string; signal?: boolean }) {
  return (
    <div className="tile">
      <div className="lbl">{label}</div>
      <div className={signal ? "v sig" : "v"}>{value}</div>
      <div className="d">{detail}</div>
    </div>
  );
}

export function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="sechead">
      <h3>{title}</h3>
      {note && <span className="eyebrow">{note}</span>}
    </div>
  );
}
