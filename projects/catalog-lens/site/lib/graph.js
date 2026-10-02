import { featureIndex, ruleMove } from "./catalog.js";
import { itemAt } from "./prices.js";

// The package as a graph: nodes in fixed columns (layers), edges between neighbouring concepts.
//   rules/other offers -> bundle -> base offers -> feature groups -> charge clusters -> bill types -> tax types
// `links` are the same-column relations (feature-group EXCLUDED / REQUIRES) that are drawn as arcs, not used for layout.
export const LAYERS = ["ext", "bundle", "base", "group", "cluster", "bill", "tax"];
export const LAYER_TITLES = { ext: "Other offers (up/downgrade)", bundle: "Bundle offers", base: "Base offers", group: "Feature groups", cluster: "Charge clusters", bill: "Bill types", tax: "Tax" };
const low = s => (s ?? "").toLowerCase();

/** Current monthly price text for a cluster on a date: sum of its recurring charges that apply, or "" when it has none. */
export function clusterPrice(cluster, date) {
  let sum = 0, any = false, discount = false;
  for (const ch of cluster.charges) {
    if (ch.kind === "discount") { discount = true; continue; }
    const it = itemAt(ch.items, date);
    if (it && it.charge !== null) { sum += it.charge; any = true; }
  }
  return any ? { amount: sum, currency: cluster.currency || "" } : discount ? { discount: true } : null;
}

export function buildGraph(c, { date = new Date().toISOString().slice(0, 10) } = {}) {
  const nodes = new Map(), edges = new Map(), links = new Map();
  const node = (type, key, extra = {}) => {
    const id = `${type}:${key}`;
    if (!nodes.has(id)) nodes.set(id, { id, type, key, label: key, sub: "", missing: false, data: null, severity: null, ...extra });
    else Object.assign(nodes.get(id), extra);
    return nodes.get(id);
  };
  const edge = (from, to, kind, label = "") => {
    const id = `${from}>${to}|${kind}`, e = edges.get(id) ?? edges.set(id, { id, from, to, kind, label, count: 0 }).get(id);
    e.count++; return e;
  };
  const features = featureIndex(c);

  for (const o of Object.values(c.bundles)) node("bundle", o.key, { sub: o.invoiceName || "", data: o });
  for (const o of Object.values(c.bases)) node("base", o.key, { sub: o.invoiceName || "", data: o });
  const offerNode = key => (c.bundles[key] ? node("bundle", key) : c.bases[key] ? node("base", key) : node("base", key, { missing: true, sub: "not in the loaded files" }));
  for (const g of Object.values(c.featureGroups)) node("group", g.key, { sub: g.displayName || "", data: g, extra: g.features.length });
  for (const k of Object.values(c.clusters)) {
    const p = clusterPrice(k, date);
    node("cluster", k.key, { data: k, sub: p ? (p.discount ? "discount" : `${p.amount.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ${p.currency}`) : "no price" });
  }
  for (const b of Object.values(c.billTypes)) node("bill", b.key, { data: b, sub: b.invoiceText || "" });
  for (const t of Object.values(c.taxTypes)) node("tax", t.key, { data: t, sub: t.rates.length ? t.rates.at(-1).rate + " %" : "" });

  for (const o of Object.values(c.offers)) {
    const from = o.kind === "bundle" ? node("bundle", o.key) : node("base", o.key);
    for (const r of o.offerRefs) edge(from.id, offerNode(r.key).id, "contains");
    for (const r of o.featureGroupRefs) { const g = c.featureGroups[r.key] ? node("group", r.key) : node("group", r.key, { missing: true, sub: "not in the loaded files" }); edge(from.id, g.id, "has"); }
    const tm = c.tariffModels[o.tariffModelKey];
    if (tm) for (const t of tm.tariffs) {
      const groups = features.get(t.component) ?? [];
      const cluster = c.clusters[t.cluster] ? node("cluster", t.cluster) : node("cluster", t.cluster, { missing: true, sub: "not in the loaded files" });
      for (const g of groups) { const e = edge(node("group", g).id, cluster.id, "price"); (e.components ??= []).push(t.component); }
    }
    for (const d of o.deps) {
      const a = d.source.group ?? (features.get(d.source.feature) ?? [])[0], b = d.target.group ?? (features.get(d.target.feature) ?? [])[0];
      if (!a || !b || a === b) continue;
      const kind = /REQUIRE/i.test(d.type) ? "requires" : "excludes", [x, y] = kind === "excludes" && a > b ? [b, a] : [a, b];
      const id = `${kind}|${x}|${y}`;
      if (!links.has(id)) links.set(id, { id, kind, from: `group:${x}`, to: `group:${y}`, offers: new Set() });
      links.get(id).offers.add(o.key);
      for (const k of [x, y]) if (!nodes.has(`group:${k}`)) node("group", k, { missing: true, sub: "not in the loaded files" });
    }
  }
  for (const k of Object.values(c.clusters)) for (const ch of k.charges) {
    const b = c.billTypes[ch.billType] ? node("bill", ch.billType) : node("bill", ch.billType, { missing: true, sub: "not in the loaded files" });
    edge(`cluster:${k.key}`, b.id, "bill");
  }
  for (const b of Object.values(c.billTypes)) for (const t of b.taxTypes) edge(`bill:${b.key}`, (c.taxTypes[t] ? node("tax", t) : node("tax", t, { missing: true })).id, "tax");

  // up/downgrade rules: the other offer sits in the first column
  const extNames = new Map();
  for (const r of c.offerRules) {
    const m = ruleMove(r.key);
    if (!m) continue;
    const up = m.direction === "UPGRADE";
    const endpoint = raw => {
      const known = Object.keys(c.offers).find(k => low(k) === low(raw));
      if (known) return offerNode(known);
      const name = extNames.get(low(raw)) ?? raw; extNames.set(low(raw), name);   // the same other offer spelled with different case is one box
      return node("ext", name, { sub: "other offer" });
    };
    const other = endpoint(up ? m.from : m.to === r.offerKey || !r.offerKey ? m.to : r.offerKey), me = endpoint(up ? r.offerKey || m.to : m.from);
    if (up) edge(other.id, me.id, "upgrade", r.etf || ""); else edge(me.id, other.id, "downgrade", r.etf || "");
  }

  const list = [...nodes.values()];
  return { nodes: list, edges: [...edges.values()].filter(e => nodes.has(e.from) && nodes.has(e.to)), links: [...links.values()].map(l => ({ ...l, offers: [...l.offers] })), date };
}

/** Mark nodes with the worst severity among the findings that point at them. */
export function attachFindings(g, findings) {
  const rank = { error: 3, warn: 2, info: 1 }, byId = new Map(g.nodes.map(n => [n.id, n]));
  const bump = (n, f) => { if (n && (n.severity === null || rank[f.severity] > rank[n.severity])) n.severity = f.severity; (n.findings ??= []).push(f); };
  for (const f of findings) {
    for (const n of g.nodes) {
      const file = n.data?.file;
      if (f.where === file || f.where.endsWith("/" + n.key) || (n.type === "cluster" && f.where.endsWith("chargeClusters/" + n.key))) bump(n, f);
    }
  }
  void byId;
  return g;
}

/** Subgraph around `ids` (neighbours up to `depth` steps, following edges both ways). depth Infinity = whole connected part. */
export function neighbourhood(g, ids, depth = Infinity) {
  const adj = new Map(g.nodes.map(n => [n.id, new Set()]));
  for (const e of g.edges) { adj.get(e.from)?.add(e.to); adj.get(e.to)?.add(e.from); }
  const seen = new Set(ids), queue = ids.map(id => [id, 0]);
  while (queue.length) { const [id, d] = queue.shift(); if (d >= depth) continue; for (const nb of adj.get(id) ?? []) if (!seen.has(nb)) { seen.add(nb); queue.push([nb, d + 1]); } }
  return seen;
}

/** Everything reachable by following edges forwards (downstream) and backwards (upstream) from one node, along the layers. */
export function trace(g, id) {
  const fwd = new Map(), back = new Map();
  for (const e of g.edges) { (fwd.get(e.from) ?? fwd.set(e.from, []).get(e.from)).push(e.to); (back.get(e.to) ?? back.set(e.to, []).get(e.to)).push(e.from); }
  const walk = map => { const seen = new Set([id]), st = [id]; while (st.length) for (const n of map.get(st.pop()) ?? []) if (!seen.has(n)) { seen.add(n); st.push(n); } return seen; };
  const rank = n => LAYERS.indexOf(n.split(":")[0]), up = walk(back), down = walk(fwd);
  // rule edges run between offers in either direction; do not let them pull the whole catalogue into one trace
  const keep = new Set([id]);
  for (const n of up) if (rank(n) <= rank(id)) keep.add(n);
  for (const n of down) if (rank(n) >= rank(id)) keep.add(n);
  return keep;
}

export const NODE_W = 180, NODE_H = 40, GAP_Y = 10, COL_GAP = 84;

/** Place nodes: one column per layer that has nodes, ordered to reduce edge crossings (barycentre sweeps). Returns { nodes with x,y, edges, width, height, columns }. */
export function layout(g, visible = null) {
  const nodes = g.nodes.filter(n => !visible || visible.has(n.id)), ids = new Set(nodes.map(n => n.id));
  const edges = g.edges.filter(e => ids.has(e.from) && ids.has(e.to));
  const cols = LAYERS.map(t => nodes.filter(n => n.type === t).sort((a, b) => a.key.localeCompare(b.key))).filter(c => c.length);
  const nb = new Map(nodes.map(n => [n.id, []]));
  for (const e of edges) { nb.get(e.from).push(e.to); nb.get(e.to).push(e.from); }
  const pos = new Map();
  const place = () => cols.forEach(col => col.forEach((n, i) => pos.set(n.id, i)));
  place();
  for (let sweep = 0; sweep < 8; sweep++) {
    const order = sweep % 2 ? [...cols].reverse() : cols;
    for (const col of order) {
      const bary = n => { const p = nb.get(n.id).filter(id => !col.some(x => x.id === id)).map(id => pos.get(id)); return p.length ? p.reduce((a, b) => a + b, 0) / p.length : pos.get(n.id); };
      const keyed = col.map(n => ({ n, b: bary(n) })).sort((a, b) => a.b - b.b || a.n.key.localeCompare(b.n.key));
      col.splice(0, col.length, ...keyed.map(k => k.n)); col.forEach((n, i) => pos.set(n.id, i));
    }
  }
  const placed = [];
  cols.forEach((col, ci) => col.forEach((n, i) => placed.push({ ...n, x: ci * (NODE_W + COL_GAP), y: i * (NODE_H + GAP_Y), col: ci })));
  const height = Math.max(0, ...cols.map(c => c.length)) * (NODE_H + GAP_Y);
  return { nodes: placed, edges, links: g.links.filter(l => ids.has(l.from) && ids.has(l.to)), width: cols.length * (NODE_W + COL_GAP) - COL_GAP, height, columns: cols.map(c => c[0].type) };
}
