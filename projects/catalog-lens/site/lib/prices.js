// Price timelines: [{ charge, activation, termination }] where a missing activation means "from the beginning" and a missing
// termination means "until further notice". An item is valid from `activation` (inclusive) up to `termination` (exclusive); dates are YYYY-MM-DD.
const lo = d => d ?? "0000-00-00", hi = d => d ?? "9999-99-99";
export const sorted = items => items.slice().sort((a, b) => lo(a.activation).localeCompare(lo(b.activation)) || hi(a.termination).localeCompare(hi(b.termination)));
export const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));

/** Problems in one timeline: bad dates, empty/inverted periods, overlaps, gaps, more than one open end. */
export function timelineIssues(items) {
  const out = [];
  for (const it of items) {
    for (const f of ["activation", "termination"]) if (it[f] && !isDate(it[f])) out.push({ kind: "bad-date", message: `"${it[f]}" is not a valid date (${f})` });
    if (it.charge !== null && !Number.isFinite(it.charge)) out.push({ kind: "bad-charge", message: "charge is not a number" });
    if (it.activation && it.termination && it.termination <= it.activation) out.push({ kind: "empty-period", message: `period ${it.activation} → ${it.termination} is empty or inverted` });
  }
  const s = sorted(items);
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1], b = s[i];
    if (a.termination === null) out.push({ kind: "overlap", message: `${a.activation ?? "(start)"} → (open end) overlaps the item starting ${b.activation ?? "(start)"}` });
    else if (lo(b.activation) < a.termination) out.push({ kind: "overlap", message: `${a.activation ?? "(start)"} → ${a.termination} overlaps ${b.activation ?? "(start)"} → ${b.termination ?? "(open end)"}` });
    else if (lo(b.activation) > a.termination) out.push({ kind: "gap", message: `no price between ${a.termination} and ${b.activation}` });
  }
  return out;
}

/** The item valid on `date`, or undefined. */
export function itemAt(items, date) {
  return items.find(i => lo(i.activation) <= date && date < hi(i.termination));
}

/** All dates at which any of the timelines changes. */
export const boundaries = lists => [...new Set(lists.flatMap(l => l.flatMap(i => [i.activation, i.termination]).filter(Boolean)))].sort();

/** Percentage change between consecutive periods (for spotting jumps and cuts). */
export function steps(items) {
  const s = sorted(items).filter(i => i.charge !== null), out = [];
  for (let i = 1; i < s.length; i++) if (s[i - 1].charge) out.push({ date: s[i].activation, from: s[i - 1].charge, to: s[i].charge, pct: ((s[i].charge - s[i - 1].charge) / Math.abs(s[i - 1].charge)) * 100 });
  return out;
}

/** Compare the XML timeline of a cluster with rows of prices.csv (same cluster, same charge type). Returns [{kind, message}]. */
export function compareTimelines(xmlItems, csvItems) {
  const x = sorted(xmlItems), c = sorted(csvItems), out = [], eq = (a, b) => (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) < 0.0005);
  const key = i => `${i.activation ?? "…"}→${i.termination ?? "…"}`;
  const xm = new Map(x.map(i => [key(i), i])), cm = new Map(c.map(i => [key(i), i]));
  for (const [k, i] of cm) {
    const j = xm.get(k);
    if (!j) out.push({ kind: "csv-only", message: `prices.csv has ${i.charge} for ${k}; the XML has no such period` });
    else if (!eq(i.charge, j.charge)) out.push({ kind: "value", message: `${k}: prices.csv says ${i.charge}, the XML says ${j.charge}` });
  }
  for (const [k, j] of xm) if (!cm.has(k)) out.push({ kind: "xml-only", message: `the XML has ${j.charge} for ${k}; prices.csv does not list it` });
  return out;
}
