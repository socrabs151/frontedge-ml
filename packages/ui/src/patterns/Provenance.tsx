import type { ProvenanceEntry } from "../types";

export function ProvenanceList({ entries }: { entries: ProvenanceEntry[] }) {
  return (
    <dl className="fe-provenance">
      {entries.map((entry) => (
        <div key={entry.label} className="fe-provenance__row">
          <dt className="fe-provenance__label">{entry.label}</dt>
          <dd className={entry.mono ? "fe-provenance__value fe-mono" : "fe-provenance__value"}>
            {entry.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
