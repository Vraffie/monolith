import { h } from "../lib/dom.js";
import { stepChart } from "../lib/chart.js";
import { itemAt } from "../lib/prices.js";
import { LAYER_TITLES } from "../lib/graph.js";
import { ruleMove } from "../lib/catalog.js";

const money = (v, cur = "") => `${v.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ${cur}`.trim();
const TYPE_NAME = { ext: "Other offer", bundle: "Bundle offer", base: "Base offer", group: "Feature group", cluster: "Charge cluster", bill: "Bill type", tax: "Tax type" };

export function timelineTable(items, date, currency) {
  const rows = items.slice().sort((a, b) => (a.activation ?? "").localeCompare(b.activation ?? ""));
  const now = itemAt(items, date);
  return h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "From"), h("th", {}, "Until"), h("th", { class: "num" }, "Charge"))),
    h("tbody", {}, rows.map(i => h("tr", { class: i === now ? "now" : "" }, h("td", {}, i.activation ?? "always"), h("td", {}, i.termination ?? "open"), h("td", { class: "num" }, i.charge === null ? (i.percent ? i.percent.join(", ") + " %" : "") : money(i.charge, currency))))));
}

/** The side panel for one node. `m` is the app model, `actions` = { select(id), isolate(id) }. */
const flat = items => items.flat(Infinity).filter(x => x != null && x !== false);
export function renderDetails(rootEl, m, node, date, actions) {
  const root = { append: (...items) => rootEl.append(...flat(items).map(x => (x.nodeType ? x : String(x)))), replaceChildren: () => rootEl.replaceChildren() };
  root.replaceChildren();
  if (!node) {
    root.append(h("h2", {}, "Nothing selected"), h("p", { class: "muted" }, "Click a box to see what it is, what it connects to and what is wrong with it. Everything it depends on and everything that depends on it lights up. Drag to pan, scroll to zoom."),
      h("h3", {}, "Columns"), h("ul", { class: "list" }, Object.entries(LAYER_TITLES).map(([t, name]) => h("li", {}, h("span", { class: `chip t t-${t}` }, name)))),
      h("div", { class: "legend" }, h("span", {}, h("span", { class: "swatch e-upgrade" }), "upgrade"), h("span", {}, h("span", { class: "swatch e-downgrade" }), "downgrade"), h("span", {}, h("span", { class: "swatch l-excludes" }), "excludes"), h("span", {}, h("span", { class: "swatch l-requires" }), "requires")),
      h("p", { class: "muted" }, "Dashed boxes are referenced but not in the loaded files: they live elsewhere in the repository. Open more zips or folders together to resolve them."));
    return;
  }
  const c = m.cat, d = node.data, link = (id, text) => h("button", { type: "button", class: "link-btn", onclick: () => actions.select(id) }, text);
  root.append(h("p", {}, h("span", { class: `chip t t-${node.type}` }, TYPE_NAME[node.type]), node.missing ? h("span", { class: "muted" }, " · not in the loaded files") : null),
    h("h2", {}, node.key), node.sub && !node.missing ? h("p", { class: "muted" }, node.sub) : null,
    h("div", { class: "row" }, h("button", { type: "button", class: "ghost", onclick: () => actions.isolate(node.id) }, "Isolate"), h("button", { type: "button", class: "ghost", onclick: () => actions.select(null) }, "Clear")));
  if (d?.file) root.append(h("p", { class: "muted" }, d.file));

  if (node.findings?.length) root.append(h("h3", {}, "Findings"), h("ul", { class: "list" }, node.findings.map(f => h("li", {}, h("strong", { class: "sev-t-" + f.severity }, f.severity.toUpperCase()), " ", f.message))));

  const nbs = (dir, kinds) => m.graph.edges.filter(e => (dir === "out" ? e.from === node.id : e.to === node.id) && (!kinds || kinds.includes(e.kind))).map(e => m.graph.nodes.find(n => n.id === (dir === "out" ? e.to : e.from))).filter(Boolean);
  const listOf = (title, nodes) => nodes.length ? [h("h3", {}, `${title} (${nodes.length})`), h("ul", { class: "list" }, nodes.map(n => h("li", {}, link(n.id, n.key), n.missing ? h("span", { class: "muted" }, " (elsewhere)") : null)))] : [];

  if (node.type === "bundle" || node.type === "base") {
    root.append(h("p", { class: "muted" }, d?.internalName || ""), h("p", {}, d?.tariffModelKey ? ["Tariff model: ", h("code", {}, d.tariffModelKey), c.tariffModels[d.tariffModelKey] ? ` (${c.tariffModels[d.tariffModelKey].tariffs.length} tariffs)` : " (not loaded)"] : "No tariff model."));
    root.append(...listOf("Contains offers", nbs("out", ["contains"])), ...listOf("Contained in", nbs("in", ["contains"])), ...listOf("Feature groups", nbs("out", ["has"])),
      ...listOf("Reached by upgrade from", nbs("in", ["upgrade"])), ...listOf("Can downgrade to", nbs("out", ["downgrade"])));
    if (d?.rules?.length) root.append(h("h3", {}, "Business rules"), h("ul", { class: "list" }, d.rules.map(r => h("li", {}, r.type, ": ", r.key))));
    const deps = d?.deps?.length ? d.deps.length : 0; if (deps) root.append(h("p", { class: "muted" }, `${deps} feature dependencies (excludes/requires). Toggle "Dependencies" to draw them.`));
  } else if (node.type === "group") {
    if (d?.description) root.append(h("p", {}, d.description));
    if (d) root.append(h("p", { class: "muted" }, `${d.chargeType || "?"} · active ${d.minActive ?? 0}–${d.maxActive ?? "∞"}${d.single ? " · single feature" : ""}`),
      h("h3", {}, `Features (${d.features.length})`), h("ul", { class: "list" }, d.features.map(f => {
        const t = Object.values(c.tariffModels).flatMap(tm => tm.tariffs).filter(x => x.component === f.key);
        return h("li", {}, h("strong", {}, f.key), f.displayName && f.displayName !== f.key ? ` · ${f.displayName}` : "", t.length ? h("div", { class: "muted" }, "priced by ", t.map((x, i) => [i ? ", " : "", link("cluster:" + x.cluster, x.cluster)])) : null);
      })));
    root.append(...listOf("Used by", nbs("in", ["has"])), ...listOf("Charged through", nbs("out", ["price"])));
    const links = m.graph.links.filter(l => l.from === node.id || l.to === node.id);
    if (links.length) root.append(h("h3", {}, "Dependencies"), h("ul", { class: "list" }, links.map(l => { const other = l.from === node.id ? l.to : l.from; return h("li", {}, l.kind === "excludes" ? "excludes " : l.from === node.id ? "requires " : "required by ", link(other, other.split(":")[1])); })));
  } else if (node.type === "cluster") {
    if (d) {
      root.append(h("p", { class: "muted" }, `${d.currency}${d.prepaid ? " · prepaid" : ""}`));
      for (const ch of d.charges) {
        root.append(h("h3", {}, `${ch.kind} · ${ch.key ?? ""}`), ch.kind === "recurringCharge" || ch.kind === "onceOnlyCharge" ? [stepChart(ch.items, date), timelineTable(ch.items, date, d.currency)] : h("p", { class: "muted" }, ch.kind === "discount" ? "Percentage discount; the value comes from the tiering below." : ""),
          ch.kind === "discount" ? timelineTable(ch.items, date, d.currency) : null, h("p", { class: "muted" }, "Bill type: ", c.billTypes[ch.billType] ? link("bill:" + ch.billType, ch.billType) : ch.billType + " (not loaded)"));
      }
      const used = Object.values(c.tariffModels).flatMap(tm => tm.tariffs.filter(t => t.cluster === d.key || t.parent === d.key).map(t => ({ ...t, model: tm.key })));
      if (used.length) root.append(h("h3", {}, "Used by tariffs"), h("ul", { class: "list" }, used.map(t => h("li", {}, h("code", {}, t.component), " in ", t.model, t.parent === d.key ? " (as parent)" : t.parent ? ` (discounts ${t.parent}${t.validity ? `, ${t.validity.value} ${t.validity.unit.toLowerCase()}` : ""})` : ""))));
    }
    root.append(...listOf("Feature groups", nbs("in", ["price"])));
  } else if (node.type === "bill") {
    if (d) root.append(h("p", {}, d.invoiceText), h("p", { class: "muted" }, `Product code ${d.productCode || "–"} · GL ${d.glCode || "–"} · ${d.chargeType || ""}`));
    root.append(...listOf("Charge clusters", nbs("in", ["bill"])), ...listOf("Tax", nbs("out", ["tax"])));
  } else if (node.type === "tax") {
    if (d) root.append(h("ul", { class: "list" }, d.rates.map(r => h("li", {}, `${r.rate} %${r.activation ? " from " + r.activation : ""}`))));
    root.append(...listOf("Bill types", nbs("in", ["tax"])));
  } else if (node.type === "ext") {
    root.append(h("p", { class: "muted" }, "Not part of the loaded files: it only appears because up/downgrade rules mention it."), ...listOf("Can upgrade to", nbs("out", ["upgrade"])), ...listOf("Reached by downgrade from", nbs("in", ["downgrade"])));
  }
  if (node.type === "bundle" || node.type === "base" || node.type === "ext") {
    const rules = c.offerRules.filter(r => { const mv = ruleMove(r.key); return mv && [mv.from, mv.to, r.offerKey].some(x => x?.toLowerCase() === node.key.toLowerCase()); });
    if (rules.length) root.append(h("h3", {}, "Up/downgrade rules"), h("table", {}, h("tbody", {}, rules.map(r => h("tr", {}, h("td", {}, r.key), h("td", {}, r.etf || "")))))); 
  }
}
