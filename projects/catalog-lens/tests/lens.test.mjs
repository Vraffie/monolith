import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { parseXml, XmlError } from "../site/lib/xml.js";
import { readZip } from "../site/lib/zip.js";
import { timelineIssues, itemAt, steps } from "../site/lib/prices.js";
import { parsePackage, ruleMove } from "../site/lib/catalog.js";
import { runChecks } from "../site/lib/checks.js";
import { buildGraph, layout, trace, neighbourhood, attachFindings, LAYERS, NODE_W, NODE_H } from "../site/lib/graph.js";
import { scopeFiles, folderList, cleanScope } from "../site/lib/scope.js";
import { samplePackage, zipFiles } from "../tools/sample.mjs";

const sample = () => parsePackage(samplePackage());
const find = (fs, id, re) => fs.filter(f => f.id === id && (!re || re.test(f.message)));

test("xml: elements, attributes, entities, CDATA, comments, namespaces", () => {
  const r = parseXml(`<?xml version="1.0"?><!-- c --><a:root xmlns:a="u" a:k="v&amp;w"><x>1 &lt; 2 &#65;&#x42;</x><y><![CDATA[<raw>]]></y><z/><z></z></a:root>`);
  assert.equal(r.name, "root"); assert.equal(r.attrs.k, "v&w");
  assert.equal(r.kids[0].text, "1 < 2 AB"); assert.equal(r.kids[1].text, "<raw>"); assert.equal(r.kids.length, 4);
});

test("xml: malformed input throws XmlError with a message, never hangs or crashes", () => {
  for (const bad of ["", "<a>", "<a></b>", "<a><b></a>", "text only", "<a/><b/>", "<a x=1/>", "<a><</a>", "</a>"]) assert.throws(() => parseXml(bad), XmlError, bad);
  assert.doesNotThrow(() => parseXml("<!DOCTYPE a [<!ENTITY x 'y'>]><a>&x;</a>"));   // entities are never expanded
  assert.equal(parseXml("<!DOCTYPE a [<!ENTITY x 'y'>]><a>&x;</a>").text, "&x;");
  const deep = "<a>".repeat(5000) + "</a>".repeat(5000); assert.doesNotThrow(() => parseXml(deep));
});

test("zip: the sample round-trips, and damaged or hostile archives give readable errors", async () => {
  const files = samplePackage(), zip = zipFiles(files), back = await readZip(zip);
  assert.equal(back.size, files.size);
  for (const [k, v] of files) assert.deepEqual([...back.get(k)], [...v]);
  await assert.rejects(readZip(new Uint8Array([1, 2, 3])), /not a zip/);
  await assert.rejects(readZip(zip.subarray(0, zip.length - 30)), /zip|damaged|not a zip/);
  const broken = Uint8Array.from(zip); broken[30 + 40 + 5] ^= 0xff;      // flip a byte inside the first entry's data
  await assert.rejects(readZip(broken), /damaged|checksum|wrong size|inflate|invalid|data/i);
  for (let cut = 0; cut < zip.length; cut += 97) { try { await readZip(zip.subarray(0, cut)); } catch (e) { assert.ok(e.constructor === Error, `cut ${cut}: ${e}`); } }
});


test("prices: gaps, overlaps, open ends, bad dates, lookups and comparisons", () => {
  const ok = [{ charge: 1, activation: null, termination: "2025-01-01" }, { charge: 2, activation: "2025-01-01", termination: null }];
  assert.deepEqual(timelineIssues(ok), []);
  assert.equal(itemAt(ok, "2024-12-31").charge, 1); assert.equal(itemAt(ok, "2025-01-01").charge, 2); assert.equal(itemAt([{ charge: 1, activation: "2025-01-01", termination: null }], "2024-01-01"), undefined);
  assert.deepEqual(timelineIssues([{ charge: 1, activation: null, termination: "2025-01-01" }, { charge: 2, activation: "2025-03-01", termination: null }]).map(i => i.kind), ["gap"]);
  assert.deepEqual(timelineIssues([{ charge: 1, activation: null, termination: "2025-03-01" }, { charge: 2, activation: "2025-01-01", termination: null }]).map(i => i.kind), ["overlap"]);
  assert.deepEqual(timelineIssues([{ charge: 1, activation: null, termination: null }, { charge: 2, activation: "2025-01-01", termination: null }]).map(i => i.kind), ["overlap"]);
  assert.ok(timelineIssues([{ charge: 1, activation: "2025-13-45", termination: null }]).some(i => i.kind === "bad-date"));
  assert.ok(timelineIssues([{ charge: 1, activation: "2025-05-01", termination: "2025-05-01" }]).some(i => i.kind === "empty-period"));
  assert.equal(steps([{ charge: 100, activation: null, termination: "2025-01-01" }, { charge: 110, activation: "2025-01-01", termination: null }])[0].pct, 10);
});

test("rule keys: UPGRADE_x_TO_y", () => {
  assert.deepEqual(ruleMove("UPGRADE_RBO_AIB_MED_TO_RBO_AIB_PLUS"), { direction: "UPGRADE", from: "RBO_AIB_MED", to: "RBO_AIB_PLUS" });
  assert.equal(ruleMove("RESIDENTIAL"), null);
});

test("catalog: the sample parses into the expected model", () => {
  const c = sample();
  assert.deepEqual([Object.keys(c.bundles), Object.keys(c.bases).sort()], [["NL_HOME_PLUS"], ["NL_BB", "NL_TV"]]);
  assert.equal(Object.keys(c.featureGroups).length, 10); assert.equal(Object.keys(c.clusters).length, 11); assert.equal(c.offerRules.length, 4);
  assert.equal(c.bundles.NL_HOME_PLUS.deps.length, 3); assert.equal(c.bundles.NL_HOME_PLUS.offerRefs.length, 2);
  const tm = c.tariffModels.NL_HOME_PLUS_TM.tariffs.find(t => t.component === "BUN_HOME_PLUS_2M_FREE");
  assert.deepEqual([tm.cluster, tm.parent, tm.validity], ["HOME_PLUS_FREE_OV", "HOME_PLUS", { value: 2, unit: "MONTHS" }]);
  assert.equal(c.clusters.HOME_PLUS.charges[0].items.length, 3);
  assert.deepEqual(c.problems, []);
});

test("checks: every planted defect in the sample is found, and only there", () => {
  const f = runChecks(sample());
  assert.ok(find(f, "price.discount-cancel", /-1279.*1299/).length === 1, "discount that does not cancel (once, not per tariff)");
  assert.ok(find(f, "tariff.validity", /3 months.*2 MONTHS/).length === 1);
  assert.ok(find(f, "rule.direction", /isUpgrade="false"/).length === 1);
  assert.ok(find(f, "price.gap", /2025-06-01 and 2025-08-01/).length === 1);
  assert.ok(find(f, "ref.bill-type", /DISCOUNT_BILL/).length === 1);
  assert.ok(find(f, "unused.cluster", /OLD_PROMO/).length === 1);
  assert.ok(find(f, "rule.name", /case only/).length === 1);
  assert.equal(f.filter(x => x.id.startsWith("csv")).length, 0, "prices.csv is ignored");
  assert.ok(find(f, "ref.tariff-model", /NL_TV_TM/).length === 1 && find(f, "ref.tariff-model")[0].severity === "info", "a model that lives elsewhere is a note, not a warning");
  assert.equal(f.filter(x => x.severity === "error").length, 3, f.filter(x => x.severity === "error").map(x => x.id).join());
  for (const clean of ["price.overlap", "price.bad-date", "price.empty-period", "ref.cluster", "key.duplicate", "file.unreadable"]) assert.equal(find(f, clean).length, 0, clean);
});

test("checks: a defect-free package reports no errors or warnings", () => {
  const files = samplePackage(), enc = s => new TextEncoder().encode(s), dec = b => new TextDecoder().decode(b);
  for (const k of [...files.keys()]) if (/OLD_PROMO|BUN_NOK_DISCOUNT|UPGRADE_NL_HOME_PLUS_TO_NL_HOME_MAX|UPGRADE_NL_LEGACY|NL_TV|STATIC_IP/.test(k)) files.delete(k);
  files.set("NL_HOME_PLUS/chargeClusters/HOME_PLUS_FREE_OV.xml", enc(dec(files.get("NL_HOME_PLUS/chargeClusters/HOME_PLUS_FREE_OV.xml")).replace("-1279", "-1299")));
  files.set("NL_HOME_PLUS/chargeClusters/BUN_SPORT_OV.xml", enc(dec(files.get("NL_HOME_PLUS/chargeClusters/BUN_SPORT_OV.xml")).replace("2025-08-01", "2025-06-01")));
  files.set("NL_HOME_PLUS/tariffModels/NL_HOME_PLUS_TM.xml", enc(dec(files.get("NL_HOME_PLUS/tariffModels/NL_HOME_PLUS_TM.xml")).replace(/<tariff><offerComponent>NOK_Discount[^]*?<\/tariff>/g, "").replace("<value>2</value><unit>MONTHS</unit></validityPeriod></tariff>\n      ", "<value>2</value><unit>MONTHS</unit></validityPeriod></tariff>\n      ")));
  const c = parsePackage(files), f = runChecks(c).filter(x => x.severity !== "info");
  const left = f.map(x => `${x.id}: ${x.message}`);
  assert.ok(!left.some(l => /^(price|rule|tax)\./.test(l)), left.join("\n"));
});

test("checks: hostile package contents are reported, not thrown", () => {
  const files = new Map([["x/bad.xml", "<a><b></a>"], ["x/chargeClusters/c.xml", `<offerConfiguration><chargeClusters><chargeCluster><key>C</key><charges><charge><billTypeKey>B</billTypeKey><recurringCharge><key>C</key><timelineItems><timelineItem><charge>abc</charge><activation>nope</activation></timelineItem></timelineItems></recurringCharge></charge></charges></chargeCluster></chargeClusters></offerConfiguration>`], ["x/empty.xml", ""]]);
  const c = parsePackage(files), f = runChecks(c);
  assert.equal(c.problems.length, 2);
  assert.ok(find(f, "file.unreadable").length === 2 && find(f, "price.bad-date").length === 1);
  assert.doesNotThrow(() => buildGraph(c));
});

test("graph: nodes, edges and layout invariants on the sample", () => {
  const c = sample(), g = buildGraph(c, { date: "2025-06-01" }), ids = new Set(g.nodes.map(n => n.id));
  assert.equal(new Set(g.nodes.map(n => n.id)).size, g.nodes.length);
  for (const e of g.edges) assert.ok(ids.has(e.from) && ids.has(e.to), e.id);
  assert.equal(g.nodes.find(n => n.id === "cluster:HOME_PLUS").sub.replace(/\s/g, " ").includes("249"), true, "price as of 2025-06-01 is 1249");
  assert.ok(g.edges.some(e => e.kind === "upgrade" && e.to === "bundle:NL_HOME_PLUS"));
  assert.ok(g.edges.some(e => e.kind === "downgrade" && e.from === "bundle:NL_HOME_PLUS"));
  assert.equal(g.nodes.filter(n => n.type === "ext").length, 3, "NL_HOME, NL_HOME_MAX, NL_Legacy (case-insensitive merge)");
  assert.ok(g.edges.some(e => e.kind === "price" && e.from === "group:BUN_HOME_PLUS_2M_FREE" && e.to === "cluster:HOME_PLUS_FREE_OV"));
  assert.ok(g.links.some(l => l.kind === "excludes") && g.links.some(l => l.kind === "requires"));
  assert.equal(g.links.filter(l => l.kind === "excludes").length, 1, "A excludes B and B excludes A is one link");
  const L = layout(g);
  const byCol = new Map(); for (const n of L.nodes) (byCol.get(n.col) ?? byCol.set(n.col, []).get(n.col)).push(n);
  for (const col of byCol.values()) { col.sort((a, b) => a.y - b.y); for (let i = 1; i < col.length; i++) assert.ok(col[i].y >= col[i - 1].y + NODE_H, "boxes in a column never overlap"); assert.equal(new Set(col.map(n => n.type)).size, 1); }
  const colOf = t => L.nodes.find(n => n.type === t)?.col;
  assert.ok(LAYERS.filter(t => colOf(t) !== undefined).every((t, i, a) => i === 0 || colOf(t) > colOf(a[i - 1])), "columns follow the layer order");
  assert.ok(L.width >= (L.columns.length - 1) * NODE_W);
});

test("graph: trace and isolate follow the layers; findings attach to boxes", () => {
  const c = sample(), g = attachFindings(buildGraph(c), runChecks(c)), t = trace(g, "cluster:HOME_PLUS_FREE_OV");
  for (const id of ["group:BUN_HOME_PLUS_2M_FREE", "bundle:NL_HOME_PLUS", "bill:HOME_PLUS", "tax:MVA"]) assert.ok(t.has(id), id);
  assert.ok(!t.has("cluster:BB_100") && !t.has("base:NL_BB"), "unrelated boxes stay out");
  assert.equal(g.nodes.find(n => n.id === "cluster:HOME_PLUS_FREE_OV").severity, "error");
  assert.equal(g.nodes.find(n => n.id === "cluster:ROUTER_WIFI6").severity, null);
  assert.ok(neighbourhood(g, ["cluster:ETC"], 1).has("group:ETC") && !neighbourhood(g, ["cluster:ETC"], 1).has("bundle:NL_HOME_PLUS"));
  assert.ok(layout(g, neighbourhood(g, ["cluster:ETC"], 1)).nodes.length < g.nodes.length);
});

test("scope: whole path segments, any nesting, tidy input", () => {
  const f = new Map(["a/offers/X/o.xml", "a/offers/X/p.xml", "a/offers/XY/o.xml", "b/offers/X/o.xml", "a/other.xml", "README.md"].map(k => [k, 1]));
  assert.deepEqual([...scopeFiles(f, "")].length, 6);
  assert.deepEqual([...scopeFiles(f, "a/offers/X").keys()], ["a/offers/X/o.xml", "a/offers/X/p.xml"], "XY is not X");
  assert.deepEqual([...scopeFiles(f, "/a/offers/X/").keys()].length, 2, "slashes are tidied");
  assert.deepEqual([...scopeFiles(f, "a\\offers\\X").keys()].length, 2, "backslashes too");
  assert.deepEqual([...scopeFiles(f, "X").keys()].sort(), ["a/offers/X/o.xml", "a/offers/X/p.xml", "b/offers/X/o.xml"], "a folder name alone matches at any depth");
  assert.equal(scopeFiles(f, "a/offers/X/o.xml").size, 1, "a single file works");
  assert.equal(scopeFiles(f, "nope").size, 0);
  assert.equal(cleanScope("  ./x/y/ "), "x/y");
  assert.deepEqual(folderList(f), ["a", "b", "a/offers", "b/offers", "a/offers/X", "a/offers/XY", "b/offers/X"]);
});

const REAL = process.env.CATALOG_ZIP;
test("real package (set CATALOG_ZIP to a package zip to run this)", { skip: !REAL || !existsSync(REAL) }, async () => {
  const c = parsePackage(await readZip(readFileSync(REAL))), f = runChecks(c), g = buildGraph(c);
  assert.deepEqual(c.problems, []); assert.ok(g.nodes.length > 10 && g.edges.length > 10);
  assert.equal(f.filter(x => x.severity === "error").length, 0);
  assert.equal(layout(g).nodes.length, g.nodes.length);
});
