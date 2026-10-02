import { h } from "./lib/dom.js";
import { readZip } from "./lib/zip.js";
import { parsePackage } from "./lib/catalog.js";
import { runChecks } from "./lib/checks.js";
import { scopeFiles, folderList, cleanScope } from "./lib/scope.js";
import { buildGraph, attachFindings, LAYERS } from "./lib/graph.js";
import { mountGraph } from "./views/graph.js";
import { mountPrices } from "./views/prices.js";
import { mountChecks } from "./views/checks.js";

const $ = id => document.getElementById(id);
let model = null, view = "graph", graphCtl = null, source = null;
const state = { selected: null, search: "", layers: new Set(LAYERS), showElsewhere: false, showDeps: false, isolate: null };

function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 3500); }

/** Parse the source files (optionally only those under `scope`) and show them. Several packages are merged so references between them resolve. */
function rebuild(scope = "") {
  const files = scopeFiles(source.files, scope);
  if (!files.size) { toast(`No files under "${scope}". Pick a folder from the list.`); return false; }
  const cat = parsePackage(files), findings = runChecks(cat), date = $("asOf").value || new Date().toISOString().slice(0, 10);
  const graph = attachFindings(buildGraph(cat, { date }), findings);
  model = { name: source.name, cat, findings, graph, date };
  Object.assign(state, { selected: null, search: "", isolate: null });
  $("empty").hidden = true; $("app").hidden = false;
  const n = s => findings.filter(f => f.severity === s).length;
  $("meta").textContent = `${source.name}: ${Object.keys(cat.offers).length} offers · ${Object.keys(cat.featureGroups).length} feature groups · ${Object.keys(cat.clusters).length} charge clusters · ${cat.offerRules.length} rules`;
  $("scopeInfo").textContent = `${files.size} of ${source.files.size} files`;
  $("checkBadge").textContent = n("error") ? `${n("error")} ✖` : n("warn") ? `${n("warn")} !` : "✓";
  show(view);
  return true;
}

function build(name, maps) {
  const all = new Map();
  maps.forEach((map, i) => { for (const [p, d] of map) all.set(maps.length > 1 ? `${i + 1}/${p}` : p, d); });
  source = { name, files: all };
  const dl = $("dirs"); dl.replaceChildren(...folderList(all).map(d => { const o = document.createElement("option"); o.value = d; return o; }));
  $("scope").value = "";
  rebuild("");
}

function show(v) {
  view = v;
  for (const b of document.querySelectorAll("[role=tab]")) b.setAttribute("aria-selected", String(b.dataset.view === v));
  if (!model) return;
  const root = $("view");
  const open = id => { state.selected = id; show("graph"); };
  if (v === "graph") graphCtl = mountGraph(root, model, state);
  else if (v === "prices") mountPrices(root, model, model.date, open);
  else mountChecks(root, model, open);
}

async function fromFiles(list) {
  const files = [...list];
  try {
    const zips = files.filter(f => /\.zip$/i.test(f.name));
    if (zips.length) { const maps = []; for (const z of zips) maps.push(await readZip(await z.arrayBuffer())); build(zips.map(z => z.name.replace(/\.zip$/i, "")).join(" + "), maps); return; }
    // a folder: webkitRelativePath keeps the directory structure
    const map = new Map();
    for (const f of files) map.set((f.webkitRelativePath || f.name).replace(/^[^/]+\//, ""), new Uint8Array(await f.arrayBuffer()));
    if (!map.size) throw new Error("No files selected.");
    build((files[0].webkitRelativePath || files[0].name).split("/")[0], [map]);
  } catch (e) { toast(e.message); }
}

$("zipIn").addEventListener("change", e => { if (e.target.files.length) fromFiles(e.target.files); e.target.value = ""; });
$("dirIn").addEventListener("change", e => { if (e.target.files.length) fromFiles(e.target.files); e.target.value = ""; });
$("sampleBtn").addEventListener("click", async () => {
  try { const r = await fetch("data/sample.zip"); if (!r.ok) throw new Error("sample.zip: HTTP " + r.status); build("Sample (Nordlys Fiber)", [await readZip(await r.arrayBuffer())]); }
  catch (e) { toast(e.message); }
});
for (const b of document.querySelectorAll("[role=tab]")) b.addEventListener("click", () => show(b.dataset.view));
function applyScope() { const v = cleanScope($("scope").value); if (source && !rebuild(v)) $("scope").select(); }
$("scope").addEventListener("change", applyScope);
$("scope").addEventListener("keydown", e => { if (e.key === "Enter") applyScope(); });
$("asOf").value = new Date().toISOString().slice(0, 10);
$("asOf").addEventListener("change", () => { if (model) { model.date = $("asOf").value; model.graph = attachFindings(buildGraph(model.cat, { date: model.date }), model.findings); show(view); } });
addEventListener("dragover", e => { e.preventDefault(); document.body.classList.add("drop"); });
addEventListener("dragleave", () => document.body.classList.remove("drop"));
addEventListener("drop", e => { e.preventDefault(); document.body.classList.remove("drop"); if (e.dataTransfer.files.length) fromFiles(e.dataTransfer.files); });
void h; void graphCtl;
