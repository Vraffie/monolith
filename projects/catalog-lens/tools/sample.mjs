// A small fictional catalogue ("Nordlys Fiber") in the same file layout as a real package, with a few deliberate defects so every check has
// something to find. `node tools/sample.mjs` writes site/data/sample.zip; the tests import samplePackage().
import { writeFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";

const NS = 'xmlns="http://www.infonova.com/product/model"';
const wrap = (section, body) => `<?xml version="1.0" encoding="UTF-8"?>\n<offerConfiguration ${NS}>\n   <${section}>\n${body}\n   </${section}>\n</offerConfiguration>\n`;
const item = (charge, a, t) => `<timelineItem><charge>${charge}</charge>${a ? `<activation>${a}</activation>` : ""}${t ? `<termination>${t}</termination>` : ""}</timelineItem>`;
const recurring = (key, bill, items) => `<charge><billTypeKey>${bill}</billTypeKey><recurringCharge isProrated="true"><key>${key}</key><timelineItems>${items.map(i => item(...i)).join("")}</timelineItems></recurringCharge></charge>`;
const cluster = (key, bill, items, kind = "recurring") => wrap("chargeClusters", `<chargeCluster isPrepaid="false"><key>${key}</key><priority>0</priority><currency>NOK</currency><charges>${kind === "once" ? `<charge><billTypeKey>${bill}</billTypeKey><onceOnlyCharge><key>${key}</key><timelineItems>${item(items[0][0])}</timelineItems></onceOnlyCharge></charge>` : recurring(key, bill, items)}</charges></chargeCluster>`);
const bill = (key, text, tax = "MVA") => wrap("billTypes", `<billType><key>${key}</key><chargeTypeKey>RECURRING</chargeTypeKey><invoiceText>${text}</invoiceText><timelineItems><timelineItem><taxTypeKey>${tax}</taxTypeKey></timelineItem></timelineItems></billType>`);
const group = (key, name, features, single = false) => wrap("featureGroups", `<featureGroup isSingleFeatureGroup="${single}"><key>${key}</key><displayName>${name}</displayName><chargeTypeKey>RECURRING</chargeTypeKey><minActive>${single ? 1 : 0}</minActive><features>${features.map(([k, n]) => `<feature isMandatory="${single}"><key>${k}</key><displayName>${n}</displayName></feature>`).join("")}</features></featureGroup>`);
const gref = (key, extra = "") => `<featureGroupReference ${extra}><featureGroupKey>${key}</featureGroupKey><maxNumberOfInstances>1</maxNumberOfInstances></featureGroupReference>`;
const dep = (type, a, b) => `<featureDependency><dependencyTypeKey>${type}</dependencyTypeKey><source><featureGroupKey>${a}</featureGroupKey></source><target><featureGroupKey>${b}</featureGroupKey></target></featureDependency>`;
const tariff = (comp, cl, parent, months) => `<tariff><offerComponent>${comp}</offerComponent><chargeClusterKey>${cl}</chargeClusterKey>${parent ? `<parentChargeClusterKey>${parent}</parentChargeClusterKey>` : ""}${months ? `<validityPeriod><value>${months}</value><unit>MONTHS</unit></validityPeriod>` : ""}</tariff>`;
const rule = (key, up, offer, etf) => wrap("offerRules", `<offerRule isUpgrade="${up}" xsi:type="UpDowngradeOfferRule" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><key>${key}</key><ruleTypeKey>UP_DOWNGRADE</ruleTypeKey><offerKey>${offer}</offerKey><earlyTerminationFeeHandlingTypeKey>${etf}</earlyTerminationFeeHandlingTypeKey></offerRule>`);

export function samplePackage() {
  const f = new Map(), put = (path, text) => f.set("NL_HOME_PLUS/" + path, text);
  put("bundleOffers/NL_HOME_PLUS.xml", wrap("bundleOffers", `<bundleOffer><key>NL_HOME_PLUS</key><invoiceName>Nordlys Home Plus</invoiceName><internalName>Fibre 1000/1000 with TV and sports</internalName><tariffModelKey>NL_HOME_PLUS_TM</tariffModelKey><offerTemplateKey>DEFAULT_BUNDLE</offerTemplateKey>
      <featureGroupReferences>${["BUN_HOME_PLUS", "BUN_HOME_PLUS_2M_FREE", "BUN_HOME_PLUS_3M_FREE", "FREE_MONTHS", "NOK_DISCOUNTS", "BUN_SPORT_OV", "ETC"].map(k => gref(k, `isDefaultActive="${k === "BUN_HOME_PLUS"}" isMandatory="${k === "BUN_HOME_PLUS"}"`)).join("")}</featureGroupReferences>
      <offerReferences><offerReference><offerKey>NL_BB</offerKey><minNumberOfInstances>1</minNumberOfInstances><maxNumberOfInstances>1</maxNumberOfInstances></offerReference><offerReference><offerKey>NL_TV</offerKey><minNumberOfInstances>1</minNumberOfInstances><maxNumberOfInstances>1</maxNumberOfInstances></offerReference></offerReferences>
      <featureDependencies>${dep("EXCLUDED", "FREE_MONTHS", "NOK_DISCOUNTS")}${dep("EXCLUDED", "NOK_DISCOUNTS", "FREE_MONTHS")}${dep("REQUIRES", "BUN_SPORT_OV", "BUN_HOME_PLUS")}</featureDependencies>
      <ruleReferences><ruleReference><ruleTypeKey>CUSTOMER_TYPE_RESTRICTION</ruleTypeKey><ruleKey>RESIDENTIAL</ruleKey></ruleReference></ruleReferences></bundleOffer>`));
  put("baseOffers/NL_BB.xml", wrap("baseOffers", `<baseOffer><key>NL_BB</key><invoiceName>Fibre broadband</invoiceName><tariffModelKey>NL_BB_TM</tariffModelKey><featureGroupReferences>${gref("BB_SPEED")}${gref("BB_ROUTER")}${gref("STATIC_IP")}</featureGroupReferences></baseOffer>`));
  put("baseOffers/NL_TV.xml", wrap("baseOffers", `<baseOffer><key>NL_TV</key><invoiceName>TV</invoiceName><tariffModelKey>NL_TV_TM</tariffModelKey><featureGroupReferences>${gref("TV_PACKAGE")}</featureGroupReferences></baseOffer>`));
  put("featureGroups/BUN_HOME_PLUS.xml", group("BUN_HOME_PLUS", "Nordlys Home Plus", [["BUN_HOME_PLUS", "Nordlys Home Plus"]], true));
  for (const m of [2, 3]) put(`featureGroups/BUN_HOME_PLUS_${m}M_FREE.xml`, group(`BUN_HOME_PLUS_${m}M_FREE`, `Home Plus, ${m} months free`, [[`BUN_HOME_PLUS_${m}M_FREE`, `${m} months free`]], true));
  put("featureGroups/FREE_MONTHS.xml", group("FREE_MONTHS", "Free months", [["1_Month_Free", "1 month free"], ["2_Months_Free", "2 months free"], ["3_Months_Free", "3 months free"]]));
  put("featureGroups/NOK_DISCOUNTS.xml", group("NOK_DISCOUNTS", "Kroner discounts", [["NOK_Discount_6_Months", "6 months"], ["NOK_Discount_12_Months", "12 months"]]));
  put("featureGroups/BUN_SPORT_OV.xml", group("BUN_SPORT_OV", "Sports package discount", [["BUN_SPORT_OV", "Sports"]], true));
  put("featureGroups/ETC.xml", group("ETC", "Early termination charge", [["ETC", "Early termination"]], true));
  put("featureGroups/BB_SPEED.xml", group("BB_SPEED", "Broadband speed", [["BB_100", "100/100"], ["BB_500", "500/500"], ["BB_1000", "1000/1000"]]));
  put("featureGroups/BB_ROUTER.xml", group("BB_ROUTER", "Router", [["BB_ROUTER_BASIC", "Basic router"], ["BB_ROUTER_WIFI6", "Wi-Fi 6 router"]]));
  put("featureGroups/TV_PACKAGE.xml", group("TV_PACKAGE", "TV package", [["TV_BASIC", "Basic"], ["TV_PLUS", "Plus"]]));
  put("tariffModels/NL_HOME_PLUS_TM.xml", wrap("tariffModels", `<tariffModel><key>NL_HOME_PLUS_TM</key><tariffs>
      ${tariff("BUN_HOME_PLUS", "HOME_PLUS", null)}${tariff("BUN_HOME_PLUS_2M_FREE", "HOME_PLUS_FREE_OV", "HOME_PLUS", 2)}${tariff("BUN_HOME_PLUS_3M_FREE", "HOME_PLUS_FREE_OV", "HOME_PLUS", 2)}
      ${tariff("1_Month_Free", "BUN_FREE_MONTHS", null, 1)}${tariff("BUN_SPORT_OV", "BUN_SPORT_OV", null)}${tariff("NOK_Discount_6_Months", "BUN_NOK_DISCOUNT", null, 6)}${tariff("NOK_Discount_12_Months", "BUN_NOK_DISCOUNT", null, 12)}${tariff("ETC", "ETC", null)}
      </tariffs></tariffModel>`));
  put("tariffModels/NL_BB_TM.xml", wrap("tariffModels", `<tariffModel><key>NL_BB_TM</key><tariffs>${tariff("BB_100", "BB_100", null)}${tariff("BB_500", "BB_500", null)}${tariff("BB_1000", "BB_1000", null)}${tariff("BB_ROUTER_WIFI6", "ROUTER_WIFI6", null)}</tariffs></tariffModel>`));
  put("chargeClusters/HOME_PLUS.xml", cluster("HOME_PLUS", "HOME_PLUS", [[1199, null, "2025-01-01"], [1249, "2025-01-01", "2026-01-01"], [1299, "2026-01-01", null]]));
  put("chargeClusters/HOME_PLUS_FREE_OV.xml", cluster("HOME_PLUS_FREE_OV", "HOME_PLUS", [[-1199, null, "2025-01-01"], [-1249, "2025-01-01", "2026-01-01"], [-1279, "2026-01-01", null]]));   // DEFECT: -1279 does not cancel 1299
  put("chargeClusters/BUN_FREE_MONTHS.xml", cluster("BUN_FREE_MONTHS", "HOME_PLUS", [[-100]]));
  put("chargeClusters/BUN_SPORT_OV.xml", cluster("BUN_SPORT_OV", "HOME_PLUS", [[-99, null, "2025-06-01"], [-99, "2025-08-01", null]]));   // DEFECT: gap in June-July 2025
  put("chargeClusters/BUN_NOK_DISCOUNT.xml", cluster("BUN_NOK_DISCOUNT", "DISCOUNT_BILL", [[-50]]));   // DEFECT: bill type missing
  put("chargeClusters/ETC.xml", cluster("ETC", "ETC", [[0]], "once"));
  put("chargeClusters/BB_100.xml", cluster("BB_100", "BB", [[299, null, "2025-04-01"], [329, "2025-04-01", null]]));
  put("chargeClusters/BB_500.xml", cluster("BB_500", "BB", [[399, null, "2025-04-01"], [429, "2025-04-01", null]]));
  put("chargeClusters/BB_1000.xml", cluster("BB_1000", "BB", [[599, null, "2025-04-01"], [649, "2025-04-01", null]]));
  put("chargeClusters/ROUTER_WIFI6.xml", cluster("ROUTER_WIFI6", "BB", [[49]]));
  put("chargeClusters/OLD_PROMO.xml", cluster("OLD_PROMO", "BB", [[10]]));   // DEFECT: not used by any tariff
  put("billTypes/HOME_PLUS.xml", bill("HOME_PLUS", "Home Plus")); put("billTypes/ETC.xml", bill("ETC", "Early termination")); put("billTypes/BB.xml", bill("BB", "Broadband"));
  put("taxTypes/MVA.xml", wrap("taxTypes", `<taxType><key>MVA</key><description>VAT</description><taxRates><taxRate><rate>25</rate></taxRate></taxRates></taxType>`));
  put("offerRules/UPGRADE_NL_HOME_TO_NL_HOME_PLUS.xml", rule("UPGRADE_NL_HOME_TO_NL_HOME_PLUS", true, "NL_HOME_PLUS", "WAIVED"));
  put("offerRules/DOWNGRADE_NL_HOME_PLUS_TO_NL_HOME.xml", rule("DOWNGRADE_NL_HOME_PLUS_TO_NL_HOME", false, "NL_HOME", "TOTAL"));
  put("offerRules/UPGRADE_NL_HOME_PLUS_TO_NL_HOME_MAX.xml", rule("UPGRADE_NL_HOME_PLUS_TO_NL_HOME_MAX", false, "NL_HOME_MAX", "WAIVED"));   // DEFECT: named UPGRADE but isUpgrade=false
  put("offerRules/UPGRADE_NL_LEGACY_TO_NL_HOME_PLUS.xml", rule("UPGRADE_NL_Legacy_TO_NL_HOME_PLUS", true, "NL_HOME_PLUS", "WAIVED"));   // key differs from the file name in case
  return new Map([...f].map(([k, v]) => [k, new TextEncoder().encode(v)]));
}

// ---- a minimal zip writer (deflate), for the sample file
function crc32(b) { let c, crc = 0xffffffff; for (const x of b) { c = (crc ^ x) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
export function zipFiles(files) {
  const parts = [], central = []; let off = 0;
  for (const [name, data] of files) {
    const n = new TextEncoder().encode(name), comp = deflateRawSync(data), crc = crc32(data), h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8); h.writeUInt16LE(0x21, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, Buffer.from(n), Buffer.from(comp)); central.push(c, Buffer.from(n)); off += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = new URL("../site/data/sample.zip", import.meta.url);
  writeFileSync(out, zipFiles(samplePackage())); console.log("wrote", out.pathname);
}
