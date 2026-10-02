import { parseXml, kids, kid, txt } from "./xml.js";
import { decodeText } from "./zip.js";

// Turns the files of an offer-configuration package into one model. Parsing is tolerant (unknown elements are ignored);
// anything wrong with the content is reported by checks.js, while files that are not well-formed XML are collected in `problems`.
const num = s => (s === undefined || s === "" ? null : Number(s));
const bool = s => s === "true";
const baseName = path => path.split("/").pop().replace(/\.[^.]+$/, "");

function timeline(el) {
  return kids(kid(el, "timelineItems"), "timelineItem").map(t => ({
    charge: num(txt(t, "charge")), activation: txt(t, "activation") || null, termination: txt(t, "termination") || null,
    percent: (() => { const lv = kid(kid(t, "discountTiering"), "tieringLevels"); return lv ? kids(lv, "tieringLevel").map(l => num(txt(l, "value"))) : undefined; })(),
  }));
}

function parseOffer(el, kind, file) {
  const refs = (list, item) => kids(kid(el, list), item);
  return {
    kind, key: txt(el, "key"), file, invoiceName: txt(el, "invoiceName"), internalName: txt(el, "internalName"),
    tariffModelKey: txt(el, "tariffModelKey"), template: txt(el, "offerTemplateKey"), barring: txt(el, "barringConfigurationKey"),
    featureGroupRefs: refs("featureGroupReferences", "featureGroupReference").map(r => ({
      key: txt(r, "featureGroupKey"), isDefaultActive: bool(r.attrs.isDefaultActive), isMandatory: bool(r.attrs.isMandatory), max: num(txt(r, "maxNumberOfInstances")), termination: txt(r, "termination") || null })),
    offerRefs: refs("offerReferences", "offerReference").map(r => ({ key: txt(r, "offerKey"), min: num(txt(r, "minNumberOfInstances")), max: num(txt(r, "maxNumberOfInstances")) })),
    deps: refs("featureDependencies", "featureDependency").map(d => ({
      type: txt(d, "dependencyTypeKey"),
      source: { group: txt(kid(d, "source"), "featureGroupKey"), feature: txt(kid(d, "source"), "featureKey") },
      target: { group: txt(kid(d, "target"), "featureGroupKey"), feature: txt(kid(d, "target"), "featureKey") } })),
    rules: refs("ruleReferences", "ruleReference").map(r => ({ type: txt(r, "ruleTypeKey"), key: txt(r, "ruleKey") })),
    attributes: Object.fromEntries(refs("configurationAttributes", "configurationAttribute").map(a => [txt(a, "attributeKey"), txt(a, "attributeValue")])),
  };
}

/** files: Map(path -> Uint8Array | string). Returns the catalogue model. */
export function parsePackage(files) {
  const c = { bundles: {}, bases: {}, featureGroups: {}, tariffModels: {}, clusters: {}, billTypes: {}, taxTypes: {}, offerRules: [], files: [], problems: [], duplicates: [] };
  const put = (map, key, value, file) => { if (key === undefined) return; if (map[key]) c.duplicates.push({ key, file, other: map[key].file }); else map[key] = value; };
  for (const [path, data] of [...files].sort((a, b) => a[0].localeCompare(b[0]))) {
    const text = typeof data === "string" ? data : decodeText(data);
    c.files.push(path);
    if (/\.csv$/i.test(path)) continue;   // prices.csv is deliberately ignored: the XML timelines are the source of truth
    if (!/\.xml$/i.test(path)) continue;
    let root;
    try { root = parseXml(text); } catch (e) { c.problems.push({ file: path, message: "Not well-formed XML: " + e.message }); continue; }
    for (const section of root.kids) {
      for (const el of section.kids) {
        const file = path;
        switch (section.name + "/" + el.name) {
          case "bundleOffers/bundleOffer": put(c.bundles, txt(el, "key"), parseOffer(el, "bundle", file), file); break;
          case "baseOffers/baseOffer": put(c.bases, txt(el, "key"), parseOffer(el, "base", file), file); break;
          case "featureGroups/featureGroup": put(c.featureGroups, txt(el, "key"), { key: txt(el, "key"), file, displayName: txt(el, "displayName"), description: txt(el, "description"), chargeType: txt(el, "chargeTypeKey"),
            single: bool(el.attrs.isSingleFeatureGroup), minActive: num(txt(el, "minActive")), maxActive: num(txt(el, "maxActive")),
            features: kids(kid(el, "features"), "feature").map(f => ({ key: txt(f, "key"), displayName: txt(f, "displayName"), mandatory: bool(f.attrs.isMandatory), defaultActive: bool(f.attrs.isDefaultActive) })) }, file); break;
          case "tariffModels/tariffModel": put(c.tariffModels, txt(el, "key"), { key: txt(el, "key"), file, tariffs: kids(kid(el, "tariffs"), "tariff").map(t => ({
            component: txt(t, "offerComponent"), cluster: txt(t, "chargeClusterKey"), parent: txt(t, "parentChargeClusterKey") || null, activation: txt(t, "activation") || null,
            validity: kid(t, "validityPeriod") ? { value: num(txt(kid(t, "validityPeriod"), "value")), unit: txt(kid(t, "validityPeriod"), "unit") } : null })) }, file); break;
          case "chargeClusters/chargeCluster": put(c.clusters, txt(el, "key"), { key: txt(el, "key"), file, currency: txt(el, "currency"), prepaid: bool(el.attrs.isPrepaid), charges: kids(kid(el, "charges"), "charge").map(ch => {
            const body = ch.kids.find(k => k.name !== "billTypeKey");
            return { billType: txt(ch, "billTypeKey"), kind: body ? body.name : "unknown", key: body ? txt(body, "key") : undefined, prorated: body ? bool(body.attrs.isProrated) : false, items: body ? timeline(body) : [] };
          }) }, file); break;
          case "billTypes/billType": put(c.billTypes, txt(el, "key"), { key: txt(el, "key"), file, chargeType: txt(el, "chargeTypeKey"), invoiceText: txt(el, "invoiceText"), productCode: txt(el, "productCode"), glCode: txt(el, "glCode"),
            taxTypes: kids(kid(el, "timelineItems"), "timelineItem").map(t => txt(t, "taxTypeKey")).filter(Boolean) }, file); break;
          case "taxTypes/taxType": put(c.taxTypes, txt(el, "key"), { key: txt(el, "key"), file, description: txt(el, "description"), rates: kids(kid(el, "taxRates"), "taxRate").map(r => ({ rate: num(txt(r, "rate")), activation: txt(r, "activation") || null })) }, file); break;
          case "offerRules/offerRule": c.offerRules.push({ file, key: txt(el, "key"), type: txt(el, "ruleTypeKey"), offerKey: txt(el, "offerKey"), isUpgrade: el.attrs.isUpgrade === undefined ? null : bool(el.attrs.isUpgrade),
            etf: txt(el, "earlyTerminationFeeHandlingTypeKey") || null }); break;
          default: break;
        }
      }
    }
  }
  c.offers = { ...c.bases, ...c.bundles };
  return c;
}

export { baseName };

/** Every feature key defined in the package, with the group that owns it. */
export function featureIndex(c) {
  const idx = new Map();
  for (const g of Object.values(c.featureGroups)) for (const f of g.features) (idx.get(f.key) ?? idx.set(f.key, []).get(f.key)).push(g.key);
  return idx;
}

/** Rule keys encode the move: UPGRADE_<from>_TO_<to> / DOWNGRADE_<from>_TO_<to>. */
export function ruleMove(key) {
  const m = /^(UPGRADE|DOWNGRADE)_(.+?)_TO_(.+)$/i.exec(key || "");
  return m ? { direction: m[1].toUpperCase(), from: m[2], to: m[3] } : null;
}
