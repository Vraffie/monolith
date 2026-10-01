// Builds dist/hitchly-toolbox.html: the whole client-side toolbox in ONE self-contained file that works offline
// (double-click it, put it on a USB stick, host it anywhere). The link and admin tools need a server and are shown as such.
//
//   npm install && npm run bundle       (or: make bundle)
//
// Safety properties, all enforced by tests/e2e/bundle.cjs:
//  * the CSP allows exactly the two inline blocks below (by SHA-256) and `connect-src 'none'`: the file cannot make network requests;
//  * no external references of any kind (no CDN, fonts or analytics);
//  * the output is deterministic: same sources, same bytes (no timestamps).
import { build, transform } from "esbuild";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const ui = new URL("../hitchly/ui/", import.meta.url).pathname;
const out = new URL("../dist/", import.meta.url).pathname;
const version = /__version__\s*=\s*"([^"]+)"/.exec(readFileSync(new URL("../hitchly/__init__.py", import.meta.url), "utf8"))[1];
const sha256 = data => createHash("sha256").update(data).digest("base64");
const safeInScript = js => js.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");  // never let content close or open an HTML construct

// 1. the regex tester's worker, as a plain classic-worker script (embedded and started from a Blob)
const worker = (await build({ entryPoints: [ui + "lib/regex-worker.js"], bundle: true, format: "iife", minify: true, write: false, target: "es2022", legalComments: "none" })).outputFiles[0].text;

// 2. the app: every tool statically included, flagged as server-less
const banner = `globalThis.__HITCHLY_STATIC__=true;globalThis.__HITCHLY_WORKER__=${JSON.stringify(worker).replace(/</g, "\\u003c")};`;
const js = safeInScript((await build({ entryPoints: [ui + "app.js"], bundle: true, format: "esm", minify: true, write: false, target: "es2022", legalComments: "none", banner: { js: banner } })).outputFiles[0].text);

// 3. styles
const css = (await transform(readFileSync(ui + "app.css", "utf8"), { loader: "css", minify: true })).code.trim();

// 4. the page: index.html with the CSS/JS/favicon inlined and a CSP that pins them by hash
let html = readFileSync(ui + "index.html", "utf8");
const favicon = "data:image/svg+xml;base64," + readFileSync(ui + "favicon.svg").toString("base64");
const csp = [`default-src 'none'`, `script-src 'sha256-${sha256(js)}'`, `style-src 'sha256-${sha256(css)}'`, `img-src data: blob:`, `worker-src blob:`, `connect-src 'none'`, `base-uri 'none'`, `form-action 'none'`].join("; ");
const swap = (pattern, replacement, what) => { if (!pattern.test(html)) throw new Error(`index.html changed: could not find the ${what}`); html = html.replace(pattern, () => replacement); };
swap(/<meta http-equiv="Content-Security-Policy"[^>]*>/, `<meta http-equiv="Content-Security-Policy" content="${csp}">`, "CSP meta tag");
swap(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${favicon}" type="image/svg+xml">`, "favicon link");
swap(/<link rel="stylesheet"[^>]*>/, `<style>${css}</style>`, "stylesheet link");
swap(/<script type="module" src="ui\/app\.js"><\/script>/, `<script type="module">${js}</script>`, "app script");
swap(/<head>/, `<head>\n<meta name="generator" content="Hitchly ${version} offline toolbox">`, "<head>");

mkdirSync(out, { recursive: true });
const file = out + "hitchly-toolbox.html";
writeFileSync(file, html);
writeFileSync(file + ".sha256", `${createHash("sha256").update(html).digest("hex")}  hitchly-toolbox.html\n`);
console.log(`dist/hitchly-toolbox.html  ${(html.length / 1024).toFixed(0)} KB (${(gzipSync(html).length / 1024).toFixed(0)} KB gzipped)  v${version}`);
console.log(`  script sha256-${sha256(js).slice(0, 12)}…  style sha256-${sha256(css).slice(0, 12)}…`);
