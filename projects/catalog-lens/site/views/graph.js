import { h } from "../lib/dom.js";
import { layout, trace, neighbourhood, NODE_W, NODE_H, LAYERS, LAYER_TITLES } from "../lib/graph.js";
import { renderDetails } from "./details.js";

const NS = "http://www.w3.org/2000/svg";
const el = (name, attrs = {}, ...kids) => { const e = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : v); for (const k of kids) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k))); return e; };
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** The interactive graph view. `state` is shared with app.js: { selected, search, layers:Set, showElsewhere, showDeps, isolate:{id,depth}|null }. */
export function mountGraph(root, m, state, onChange) {
  const svg = el("svg", { role: "group", "aria-label": "Catalogue graph. Use Tab to move between boxes and Enter to select." }), vp = el("g");
  const defs = el("defs", {}, ...["", "up", "down"].map(k => el("marker", { id: "arrow" + k, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, el("path", { d: "M0,0 L10,5 L0,10 z", class: "arrow" }))));
  svg.append(defs, vp);
  const side = h("aside", { class: "side", "aria-label": "Details" });
  const search = h("input", { type: "search", placeholder: "Find…", "aria-label": "Find a box", value: state.search });
  const cb = (label, get, set) => { const i = h("input", { type: "checkbox", checked: get() }); i.addEventListener("change", () => { set(i.checked); draw(true); }); return h("label", {}, i, label); };
  const tools = h("div", { class: "tools" }, search,
    ...LAYERS.map(t => cb(LAYER_TITLES[t].split(" (")[0], () => state.layers.has(t), v => (v ? state.layers.add(t) : state.layers.delete(t)))),
    cb("Elsewhere", () => state.showElsewhere, v => { state.showElsewhere = v; }), cb("Dependencies", () => state.showDeps, v => { state.showDeps = v; }));
  const status = h("div", { class: "muted", role: "status", "aria-live": "polite" });
  const zoomBtns = h("div", { class: "zoom" }, h("button", { type: "button", class: "ghost", "aria-label": "Zoom in", onclick: () => zoomAt(1.25) }, "+"), h("button", { type: "button", class: "ghost", "aria-label": "Zoom out", onclick: () => zoomAt(0.8) }, "−"), h("button", { type: "button", class: "ghost", onclick: () => fit() }, "Fit"));
  const stage = h("div", { class: "stage" }, svg, zoomBtns);
  root.replaceChildren(h("div", { class: "split" }, h("div", { class: "left" }, tools, stage), side));

  let view = { x: 20, y: 40, k: 1 }, L = null, hasView = false;
  const apply = () => vp.setAttribute("transform", `translate(${view.x},${view.y}) scale(${view.k})`);
  function fit() {
    if (!L || !L.nodes.length) return;
    const r = svg.getBoundingClientRect(), k = Math.min(1, (r.width - 40) / (L.width + 20), (r.height - 50) / (L.height + 40));
    view = { k: Math.max(0.5, k), x: 20, y: 34 }; apply();
  }
  function zoomAt(f, cx, cy) {
    const r = svg.getBoundingClientRect(); cx ??= r.width / 2; cy ??= r.height / 2;
    const k = Math.min(3, Math.max(0.1, view.k * f)), s = k / view.k;
    view = { k, x: cx - (cx - view.x) * s, y: cy - (cy - view.y) * s }; apply();
  }
  svg.addEventListener("wheel", e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  let drag = null;
  svg.addEventListener("pointerdown", e => { if (e.target.closest(".node")) return; drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; svg.setPointerCapture(e.pointerId); svg.classList.add("drag"); });
  svg.addEventListener("pointermove", e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; view.x = drag.vx + dx; view.y = drag.vy + dy; apply(); });
  svg.addEventListener("pointerup", () => { if (drag && !drag.moved) select(null); drag = null; svg.classList.remove("drag"); });

  function visibleSet() {
    const g = m.graph, vis = new Set(g.nodes.filter(n => state.layers.has(n.type) && (state.showElsewhere || !n.missing)).map(n => n.id));
    if (state.isolate) { const around = neighbourhood(g, [state.isolate.id], state.isolate.depth); for (const id of [...vis]) if (!around.has(id)) vis.delete(id); vis.add(state.isolate.id); }
    return vis;
  }
  const pathFor = (a, b) => {
    const back = a.col > b.col, same = a.col === b.col;
    const x1 = back || same ? a.x : a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = back ? b.x + NODE_W : same ? b.x : b.x, y2 = b.y + NODE_H / 2;
    if (same) { const bulge = Math.min(80, 30 + Math.abs(y2 - y1) * 0.1); return `M${x1},${y1} C${x1 - bulge},${y1} ${x2 - bulge},${y2} ${x2},${y2}`; }
    const dx = Math.abs(x2 - x1) / 2; return back ? `M${x1},${y1} C${x1 - dx},${y1} ${x2 + dx},${y2} ${x2},${y2}` : `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  };

  function draw(refit) {
    L = layout(m.graph, visibleSet());
    const byId = new Map(L.nodes.map(n => [n.id, n])), hl = state.selected && byId.has(state.selected) ? trace(m.graph, state.selected) : null;
    const q = state.search.trim().toLowerCase(), hit = n => q && (n.key.toLowerCase().includes(q) || n.sub.toLowerCase().includes(q));
    vp.replaceChildren();
    const seen = new Set();
    L.nodes.forEach(n => { if (!seen.has(n.col)) { seen.add(n.col); vp.append(el("text", { class: "colhead", x: n.x, y: -14 }, LAYER_TITLES[n.type])); } });
    for (const e of L.edges) {
      const a = byId.get(e.from), b = byId.get(e.to), on = hl && hl.has(e.from) && hl.has(e.to);
      const marker = e.kind === "upgrade" ? "up" : e.kind === "downgrade" ? "down" : "";
      vp.append(el("path", { class: `edge e-${e.kind}${on ? " on" : ""}${hl && !on ? " dim" : ""}`, d: pathFor(a, b), "marker-end": `url(#arrow${marker})` }));
      const label = e.kind === "price" && e.count > 1 ? `×${e.count}` : e.kind === "upgrade" || e.kind === "downgrade" ? e.kind + (e.label ? ` · ${e.label.toLowerCase()}` : "") : "";
      if (label && (!hl || on)) vp.append(el("text", { class: "elabel", x: (a.x + b.x + NODE_W) / 2 + (a.col > b.col ? -NODE_W / 2 : 0), y: (a.y + b.y) / 2 + NODE_H / 2 - 4 }, label));
    }
    if (state.showDeps) for (const l of L.links) {
      const a = byId.get(l.from), b = byId.get(l.to), x = a.x, y1 = a.y + NODE_H / 2, y2 = b.y + NODE_H / 2, bulge = 24 + Math.min(70, Math.abs(y2 - y1) * 0.12);
      vp.append(el("path", { class: `link l-${l.kind}${hl && !(hl.has(l.from) && hl.has(l.to)) ? " dim" : ""}`, d: `M${x},${y1} C${x - bulge},${y1} ${x - bulge},${y2} ${x},${y2}` }, el("title", {}, `${a.key} ${l.kind} ${b.key} (${l.offers.join(", ")})`)));
    }
    for (const n of L.nodes) {
      const dim = (hl && !hl.has(n.id)) || (q && !hit(n));
      const g = el("g", { class: `node t-${n.type}${n.missing ? " missing" : ""}${state.selected === n.id ? " sel" : ""}${dim ? " dim" : ""}${hit(n) ? " hit" : ""}`, transform: `translate(${n.x},${n.y})`, tabindex: 0, role: "button",
        "aria-label": `${n.type} ${n.key}${n.sub ? ", " + n.sub : ""}${n.severity ? ", " + n.severity : ""}${n.missing ? ", not in the loaded files" : ""}`, "aria-pressed": String(state.selected === n.id) },
        el("title", {}, `${n.key}${n.sub ? "\n" + n.sub : ""}`), el("rect", { width: NODE_W, height: NODE_H, rx: 7 }), el("text", { class: "lbl", x: 10, y: 17 }, clip(n.key, 27)), el("text", { class: "sub", x: 10, y: 32 }, clip(n.sub || "", 34)));
      if (n.severity) g.append(el("circle", { class: "sev sev-" + n.severity, cx: NODE_W - 2, cy: 2, r: 6 }));
      g.addEventListener("click", ev => { ev.stopPropagation(); select(n.id); });
      g.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(n.id); } });
      vp.append(g);
    }
    status.textContent = `${L.nodes.length} boxes, ${L.edges.length} connections${state.isolate ? " (isolated)" : ""}`;
    if (refit || !hasView) { fit(); hasView = true; } else apply();
    renderDetails(side, m, state.selected ? m.graph.nodes.find(n => n.id === state.selected) : null, m.date, { select, isolate });
    side.prepend(status);
    onChange?.();
  }
  function select(id) { state.selected = id; draw(false); }
  function isolate(id) { state.isolate = state.isolate?.id === id ? null : { id, depth: 2 }; draw(true); }
  search.addEventListener("input", () => { state.search = search.value; draw(false); });
  new ResizeObserver(() => { if (!hasView) fit(); }).observe(svg);
  draw(true);
  return { draw, select, fit };
}
