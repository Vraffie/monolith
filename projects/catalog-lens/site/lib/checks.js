import { featureIndex, ruleMove, baseName } from "./catalog.js";
import { timelineIssues, steps, itemAt, boundaries } from "./prices.js";

// The package is often one offer cut out of a bigger repository, so a reference to something that is not among the loaded files is
// normal. Those are reported as warn/info ("not in the loaded files"); load more files and they resolve. Case differences are flagged.
// Each finding: { id, severity: "error" | "warn" | "info", where, message }. Severity guide:
//   error = the package contradicts itself (a reference that cannot resolve inside the package, an impossible timeline);
//   warn  = probably a mistake, or a reference to something that may live in another package;
//   info  = worth knowing, usually fine.
const lower = s => (s ?? "").toLowerCase();

export function runChecks(c, opts = {}) {
  const out = [];
  const add = (id, severity, where, message) => out.push({ id, severity, where, message });
  const caseHint = (key, map) => { const hit = Object.keys(map).find(k => lower(k) === lower(key) && k !== key); return hit ? ` (the package has "${hit}": keys are case-sensitive)` : ""; };
  const sev = (key, map) => (Object.keys(map).some(k => lower(k) === lower(key)) ? "warn" : "info");   // a near-miss (case) is a probable typo; a plain absence is probably elsewhere
  const features = featureIndex(c), offers = Object.values(c.offers);

  for (const p of c.problems) add("file.unreadable", "error", p.file, p.message);
  for (const d of c.duplicates) add("key.duplicate", "error", d.file, `"${d.key}" is also defined in ${d.other}`);

  // ---- file name vs key
  for (const [map, label] of [[c.bundles, "offer"], [c.bases, "offer"], [c.featureGroups, "feature group"], [c.tariffModels, "tariff model"], [c.clusters, "charge cluster"], [c.billTypes, "bill type"], [c.taxTypes, "tax type"]]) {
    for (const e of Object.values(map)) {
      const name = baseName(e.file);
      if (name !== e.key) {
        // A file can hold several entities; only flag single-entity files.
        const same = Object.values(map).filter(x => x.file === e.file).length === 1;
        if (same) add("file.name", lower(name) === lower(e.key) ? "warn" : "info", e.file, `${label} key "${e.key}" does not match the file name "${name}"` + (lower(name) === lower(e.key) ? " (differs only in case)" : ""));
      }
    }
  }

  // ---- offers
  for (const o of offers) {
    const where = `${o.kind === "bundle" ? "bundleOffers" : "baseOffers"}/${o.key}`;
    if (o.tariffModelKey && !c.tariffModels[o.tariffModelKey]) add("ref.tariff-model", sev(o.tariffModelKey, c.tariffModels), where, `tariff model "${o.tariffModelKey}" is not in the loaded files${caseHint(o.tariffModelKey, c.tariffModels)}`);
    if (!o.tariffModelKey) add("ref.tariff-model", "info", where, "offer has no tariff model (no prices)");
    for (const r of o.featureGroupRefs) if (!c.featureGroups[r.key]) add("ref.feature-group", sev(r.key, c.featureGroups), where, `feature group "${r.key}" is not in the loaded files${caseHint(r.key, c.featureGroups)}`);
    for (const r of o.offerRefs) {
      if (!c.offers[r.key]) add("ref.offer", sev(r.key, c.offers), where, `referenced offer "${r.key}" is not in the loaded files${caseHint(r.key, c.offers)}`);
      if (r.min !== null && r.max !== null && r.min > r.max) add("offer.instances", "error", where, `offer reference "${r.key}" has min ${r.min} > max ${r.max}`);
    }
    for (const r of o.featureGroupRefs) if (r.max !== null && r.max < 1) add("offer.instances", "warn", where, `feature group "${r.key}" allows ${r.max} instances`);
    const seen = new Set();
    for (const r of o.featureGroupRefs) { if (seen.has(r.key)) add("offer.duplicate-ref", "info", where, `feature group "${r.key}" is referenced more than once (fine if it is for different parent offers)`); seen.add(r.key); }
    for (const d of o.deps) for (const side of [d.source, d.target]) {
      if (side.group && !c.featureGroups[side.group]) add("ref.dependency", "info", where, `dependency (${d.type}) names feature group "${side.group}", which is not in the loaded files`);
      else if (side.feature && !features.has(side.feature)) add("ref.dependency", "info", where, `dependency (${d.type}) names feature "${side.feature}", which is not defined in the loaded files`);
    }
  }

  // ---- usage
  const usedGroups = new Set(offers.flatMap(o => o.featureGroupRefs.map(r => r.key)));
  for (const g of Object.values(c.featureGroups)) if (!usedGroups.has(g.key)) add("unused.feature-group", "info", g.file, `feature group "${g.key}" is not referenced by any offer in the loaded files`);
  const tariffs = Object.values(c.tariffModels).flatMap(m => m.tariffs.map(t => ({ ...t, model: m.key })));
  const usedClusters = new Set(tariffs.flatMap(t => [t.cluster, t.parent].filter(Boolean)));
  for (const k of Object.values(c.clusters)) if (!usedClusters.has(k.key)) add("unused.cluster", "info", k.file, `charge cluster "${k.key}" is not used by any tariff`);
  const usedBillTypes = new Set(Object.values(c.clusters).flatMap(k => k.charges.map(ch => ch.billType)));
  for (const b of Object.values(c.billTypes)) if (!usedBillTypes.has(b.key)) add("unused.bill-type", "info", b.file, `bill type "${b.key}" is not used by any charge`);
  const usedModels = new Set(offers.map(o => o.tariffModelKey));
  for (const m of Object.values(c.tariffModels)) if (!usedModels.has(m.key)) add("unused.tariff-model", "info", m.file, `tariff model "${m.key}" is not used by any offer`);

  // ---- tariffs
  for (const t of tariffs) {
    const where = `tariffModels/${t.model}`;
    if (!features.has(t.component)) add("ref.tariff-component", "info", where, `tariff for "${t.component}": no such feature in the loaded files`);
    if (!c.clusters[t.cluster]) add("ref.cluster", sev(t.cluster, c.clusters), where, `tariff for "${t.component}" uses charge cluster "${t.cluster}", which is not in the loaded files${caseHint(t.cluster, c.clusters)}`);
    if (t.parent && !c.clusters[t.parent]) add("ref.cluster", sev(t.parent, c.clusters), where, `tariff for "${t.component}" has parent cluster "${t.parent}", which is not in the loaded files${caseHint(t.parent, c.clusters)}`);
    // Free-month and fixed-length discount features carry their length in the key; the validity period must say the same.
    const m = /(?:^|_)(\d+)(?:M|_MONTHS?)(?:_FREE|$)/i.exec(t.component) || /^(\d+)_Months?_Free$/i.exec(t.component) || /Discount_(\d+)_Months?$/i.exec(t.component);
    if (m && t.validity && (t.validity.unit !== "MONTHS" || t.validity.value !== Number(m[1]))) add("tariff.validity", "error", where, `"${t.component}" suggests ${m[1]} months but the validity period is ${t.validity.value} ${t.validity.unit}`);
    if (m && !t.validity) add("tariff.validity", "warn", where, `"${t.component}" suggests ${m[1]} months but the tariff has no validity period`);
  }

  // ---- charges, bill types, tax
  for (const k of Object.values(c.clusters)) {
    for (const ch of k.charges) {
      const where = `chargeClusters/${k.key}`;
      if (!c.billTypes[ch.billType]) add("ref.bill-type", sev(ch.billType, c.billTypes), where, `charge "${ch.key}" uses bill type "${ch.billType}", which is not in the loaded files${caseHint(ch.billType, c.billTypes)}`);
      for (const i of timelineIssues(ch.items)) add("price." + i.kind, i.kind === "gap" ? "warn" : "error", where, `${ch.key}: ${i.message}`);
      if (ch.kind === "recurringCharge") for (const s of steps(ch.items)) if (Math.abs(s.pct) >= (opts.jumpPct ?? 10)) add("price.jump", s.pct < 0 ? "warn" : "info", where, `${ch.key}: ${s.from} → ${s.to} on ${s.date} (${s.pct > 0 ? "+" : ""}${s.pct.toFixed(1)}%)`);
      if (ch.kind !== "discount" && ch.items.length && ch.items.at(-1).termination) add("price.ends", "info", where, `${ch.key}: the last price ends ${ch.items.at(-1).termination}; nothing applies after that`);
      if (!ch.items.length) add("price.empty", "warn", where, `charge "${ch.key}" has no timeline items`);
    }
    if (k.currency && k.currency !== "NOK" && opts.currency !== false) add("price.currency", "info", k.file, `charge cluster "${k.key}" is in ${k.currency}`);
  }
  for (const b of Object.values(c.billTypes)) for (const t of b.taxTypes) if (!c.taxTypes[t]) add("ref.tax-type", sev(t, c.taxTypes), b.file, `bill type "${b.key}" uses tax type "${t}", which is not in the loaded files`);
  for (const t of Object.values(c.taxTypes)) for (const r of t.rates) if (!(r.rate >= 0 && r.rate <= 100)) add("tax.rate", "error", t.file, `tax rate ${r.rate} for "${t.key}" is outside 0-100`);

  // ---- a free-months discount must cancel the parent price on every date it can apply
  for (const t of tariffs) {
    if (!t.parent || !c.clusters[t.cluster] || !c.clusters[t.parent] || !/FREE/i.test(t.cluster + t.component)) continue;
    const rec = k => c.clusters[k].charges.find(ch => ch.kind === "recurringCharge");
    const d = rec(t.cluster), p = rec(t.parent);
    if (!d || !p || !d.items.length || !p.items.length) continue;
    for (const date of boundaries([d.items, p.items])) {
      const di = itemAt(d.items, date), pi = itemAt(p.items, date);
      if (di && pi && Math.abs(di.charge + pi.charge) > 0.005) { add("price.discount-cancel", "error", `chargeClusters/${t.cluster}`, `from ${date} "${t.cluster}" is ${di.charge} but its parent "${t.parent}" is ${pi.charge}: the free months do not cancel the price`); break; }
      if (di && !pi) { add("price.discount-cancel", "warn", `chargeClusters/${t.cluster}`, `from ${date} "${t.cluster}" has a price but its parent "${t.parent}" has none`); break; }
    }
  }

  // ---- upgrade / downgrade rules
  const pairs = new Set(c.offerRules.map(r => { const m = ruleMove(r.key); return m ? `${m.direction}|${lower(m.from)}|${lower(m.to)}` : null; }).filter(Boolean));
  for (const r of c.offerRules) {
    const m = ruleMove(r.key);
    if (!m) { if (r.type || r.offerKey) add("rule.shape", "info", r.file, `rule "${r.key}" is not an up/downgrade rule`); continue; }
    if (baseName(r.file) !== r.key) add("rule.name", lower(baseName(r.file)) === lower(r.key) ? "warn" : "info", r.file, `rule key "${r.key}" differs from the file name "${baseName(r.file)}"` + (lower(baseName(r.file)) === lower(r.key) ? " (case only)" : ""));
    if (r.offerKey && lower(r.offerKey) !== lower(m.to) && !lower(m.to).startsWith(lower(r.offerKey))) add("rule.target", "error", r.file, `rule "${r.key}" says it goes to "${m.to}" but its offerKey is "${r.offerKey}"`);
    else if (r.offerKey && lower(r.offerKey) !== lower(m.to)) add("rule.target", "info", r.file, `rule "${r.key}" targets "${m.to}" but offerKey is "${r.offerKey}" (suffix after the offer key)`);
    if (r.isUpgrade !== null && r.isUpgrade !== (m.direction === "UPGRADE")) add("rule.direction", "error", r.file, `rule "${r.key}" is named ${m.direction} but isUpgrade="${r.isUpgrade}"`);
    if (m.direction === "UPGRADE" && r.etf && r.etf !== "WAIVED") add("rule.etf", "info", r.file, `upgrade "${r.key}" handles the early-termination fee as ${r.etf} (other upgrades: WAIVED)`);
    if (m.direction === "DOWNGRADE" && r.etf === "WAIVED") add("rule.etf", "warn", r.file, `downgrade "${r.key}" waives the early-termination fee`);
    if (!pairs.has(`${m.direction === "UPGRADE" ? "DOWNGRADE" : "UPGRADE"}|${lower(m.to)}|${lower(m.from)}`)) add("rule.pair", "info", r.file, `${r.key}: no matching ${m.direction === "UPGRADE" ? "downgrade" : "upgrade"} rule back (${m.to} → ${m.from}) in the loaded files`);
  }
  const order = { error: 0, warn: 1, info: 2 }, seenF = new Set();
  return out.filter(f => { const k = f.id + "|" + f.where + "|" + f.message; return seenF.has(k) ? false : (seenF.add(k), true); }).sort((a, b) => order[a.severity] - order[b.severity] || a.id.localeCompare(b.id) || a.where.localeCompare(b.where));
}
