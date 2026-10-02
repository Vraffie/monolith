import { h } from "../lib/dom.js";

export function mountChecks(root, m, onOpen) {
  const sev = { error: true, warn: true, info: false }, q = h("input", { type: "search", placeholder: "Filter…", "aria-label": "Filter findings" }), list = h("div");
  const nodeFor = f => m.graph.nodes.find(n => n.findings?.includes(f));
  function draw() {
    const term = q.value.trim().toLowerCase();
    const shown = m.findings.filter(f => sev[f.severity] && (!term || (f.id + f.where + f.message).toLowerCase().includes(term)));
    list.replaceChildren(...(shown.length ? shown.map(f => { const n = nodeFor(f); return h("div", { class: "finding" }, h("strong", { class: "sev-t-" + f.severity }, f.severity.toUpperCase()), " ", h("code", {}, f.id), " ", f.message, h("div", { class: "where" }, f.where, n ? [" · ", h("button", { type: "button", class: "link-btn", onclick: () => onOpen(n.id) }, "show in graph")] : null)); })
      : [h("p", { class: "muted" }, m.findings.length ? "Nothing matches these filters." : "No findings.")]));
  }
  const counts = s => m.findings.filter(f => f.severity === s).length;
  const box = s => { const i = h("input", { type: "checkbox", checked: sev[s] }); i.addEventListener("change", () => { sev[s] = i.checked; draw(); }); return h("label", { class: "inline" }, i, `${s} (${counts(s)})`); };
  q.addEventListener("input", draw);
  root.replaceChildren(h("div", { class: "page" }, h("h2", {}, "Checks"), h("p", { class: "muted" }, "Errors are contradictions inside the loaded files. Warnings are probable mistakes or references that are not in the loaded files (the catalogue may live in several places). Notes are for information."),
    h("div", { class: "row" }, box("error"), box("warn"), box("info"), q), list));
  draw();
}
