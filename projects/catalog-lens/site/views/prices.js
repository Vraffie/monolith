import { h } from "../lib/dom.js";
import { sorted, itemAt, timelineIssues } from "../lib/prices.js";
import { stepChart } from "../lib/chart.js";
import { timelineTable } from "./details.js";

const money = (v, cur = "") => `${v.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ${cur}`.trim();

export function mountPrices(root, m, date, onOpen) {
  const rows = [];
  for (const k of Object.values(m.cat.clusters)) for (const ch of k.charges) {
    if (ch.kind === "discount") { rows.push({ k, ch, now: null, next: null, discount: true, issues: 0 }); continue; }
    const s = sorted(ch.items), now = itemAt(ch.items, date), next = s.find(i => i.activation && i.activation > date);
    rows.push({ k, ch, now, next, issues: timelineIssues(ch.items).length });
  }
  rows.sort((a, b) => a.k.key.localeCompare(b.k.key));
  const detail = h("div"), pick = r => {
    detail.replaceChildren(...[h("h2", {}, `${r.k.key} · ${r.ch.kind}`), h("p", {}, h("button", { type: "button", class: "ghost", onclick: () => onOpen("cluster:" + r.k.key) }, "Show in graph")),
      r.discount ? h("p", { class: "muted" }, "Percentage discount: no fixed amount.") : [stepChart(r.ch.items, date, { width: 640, height: 200 }), timelineTable(r.ch.items, date, r.k.currency)]].flat());
  };
  root.replaceChildren(h("div", { class: "page" }, h("h2", {}, `Prices as of ${date}`), h("p", { class: "muted" }, "Every charge in the loaded clusters: the amount in force on the chosen date and the next change. Click a row for the timeline."),
    h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Cluster"), h("th", {}, "Kind"), h("th", { class: "num" }, "Now"), h("th", {}, "Next change"), h("th", {}, "Issues"))),
      h("tbody", {}, rows.map(r => h("tr", { tabindex: 0, role: "button", onclick: () => pick(r), onkeydown: e => { if (e.key === "Enter") pick(r); } },
        h("td", {}, r.k.key), h("td", {}, r.ch.kind.replace("Charge", "")), h("td", { class: "num" }, r.discount ? "discount" : r.now ? money(r.now.charge, r.k.currency) : "none"),
        h("td", {}, r.next ? `${r.next.activation}: ${money(r.next.charge, r.k.currency)}${r.now && r.now.charge ? ` (${(((r.next.charge - r.now.charge) / Math.abs(r.now.charge)) * 100).toFixed(1)} %)` : ""}` : "–"),
        h("td", { class: r.issues ? "sev-t-error" : "" }, r.issues ? `${r.issues} timeline issue(s)` : ""))))), detail));
}
