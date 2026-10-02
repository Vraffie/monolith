#!/usr/bin/env node
// Check a package from the command line:  node tools/lens.mjs <package.zip | folder> [--json] [--min=warn]
// Exit code 1 if there are errors (or warnings with --min=warn), so it can gate a catalogue change in CI.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { readZip } from "../site/lib/zip.js";
import { parsePackage } from "../site/lib/catalog.js";
import { runChecks } from "../site/lib/checks.js";

async function load(path) {
  if (statSync(path).isDirectory()) {
    const files = new Map(), walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.set(relative(path, p).replace(/\\/g, "/"), readFileSync(p)); } };
    walk(path); return files;
  }
  return readZip(readFileSync(path));
}

const args = process.argv.slice(2), target = args.find(a => !a.startsWith("--"));
if (!target) { console.error("usage: lens.mjs <package.zip | folder> [--json] [--min=warn|error]"); process.exit(2); }
const min = (args.find(a => a.startsWith("--min=")) || "--min=error").slice(6);
const cat = parsePackage(await load(target)), findings = runChecks(cat);
if (args.includes("--json")) console.log(JSON.stringify(findings, null, 1));
else {
  const n = s => findings.filter(f => f.severity === s).length;
  console.log(`${Object.keys(cat.offers).length} offers, ${Object.keys(cat.featureGroups).length} feature groups, ${Object.keys(cat.clusters).length} charge clusters, ${cat.offerRules.length} rules, ${cat.files.length} files`);
  for (const f of findings) console.log(`${f.severity.toUpperCase().padEnd(5)} ${f.id.padEnd(22)} ${f.where}\n      ${f.message}`);
  console.log(`\n${n("error")} errors, ${n("warn")} warnings, ${n("info")} notes`);
}
process.exit(findings.some(f => f.severity === "error" || (min === "warn" && f.severity === "warn")) ? 1 : 0);
