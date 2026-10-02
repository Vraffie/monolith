const NS = "http://www.w3.org/2000/svg";
const el = (name, attrs = {}, text) => { const e = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text !== undefined) e.textContent = text; return e; };

/** A step chart of one or more timelines [{charge, activation, termination}] with a marker for the as-of date. Pure SVG; styling via CSS classes. */
export function stepChart(items, asOf, { width = 320, height = 150 } = {}) {
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, class: "chart", role: "img", "aria-label": "Price over time" });
  const real = items.filter(i => i.charge !== null).slice().sort((a, b) => (a.activation ?? "").localeCompare(b.activation ?? ""));
  if (!real.length) return svg;
  const day = d => Date.parse(d + "T00:00:00Z") / 864e5;
  const dates = real.flatMap(i => [i.activation, i.termination]).filter(Boolean).concat(asOf ? [asOf] : []);
  const t0 = dates.length ? Math.min(...dates.map(day)) - 120 : 0, t1 = dates.length ? Math.max(...dates.map(day)) + 120 : 1;
  const vals = real.map(i => i.charge), lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), pad = (hi - lo || 1) * 0.12;
  const X = d => 34 + ((day(d) - t0) / (t1 - t0)) * (width - 44), Y = v => 14 + (1 - (v - (lo - pad * (lo < 0 ? 1 : 0))) / (hi + pad - (lo - pad * (lo < 0 ? 1 : 0)))) * (height - 36);
  svg.append(el("line", { class: "axis", x1: 34, x2: width - 8, y1: Y(0), y2: Y(0) }));
  svg.append(el("text", { x: 2, y: Y(hi) + 3 }, String(Math.round(hi))), el("text", { x: 2, y: Y(lo) + 3 }, String(Math.round(lo))));
  let d = "";
  for (const it of real) {
    const a = it.activation ? X(it.activation) : 34, b = it.termination ? X(it.termination) : width - 8, y = Y(it.charge);
    d += `${d ? "L" : "M"}${a.toFixed(1)},${y.toFixed(1)}L${b.toFixed(1)},${y.toFixed(1)}`;
  }
  svg.append(el("path", { class: "step", d }));
  const years = new Set(dates.map(x => x.slice(0, 4)));
  for (const y of [...years].sort()) svg.append(el("text", { x: X(`${y}-01-01`) - 12, y: height - 4 }, y));
  if (asOf) svg.append(el("line", { class: "asof", x1: X(asOf), x2: X(asOf), y1: 6, y2: height - 18 }));
  return svg;
}
