// Run: node --test experiments/workers-spike/spike.test.mjs   (needs: npm i miniflare esbuild in a scratch dir; see README)
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { SCHEMA } from "./worker.js";

const BROWSER = "Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0 Safari/537.36";
let mf, db;

test.before(async () => {
  const out = await build({ entryPoints: [new URL("./worker.js", import.meta.url).pathname], bundle: true, format: "esm", write: false, target: "es2022" });
  mf = new Miniflare({ modules: true, script: out.outputFiles[0].text, d1Databases: { DB: "spike-db" }, bindings: { TOKEN: "t0ken" }, compatibilityDate: "2024-09-01" });
  db = await mf.getD1Database("DB");
  for (const stmt of SCHEMA) await db.prepare(stmt).run();
});
test.after(() => mf.dispose());

const call = (path, init = {}) => mf.dispatchFetch("http://hitch.test" + path, { redirect: "manual", ...init });
const auth = { authorization: "Bearer t0ken", "content-type": "application/json" };
const create = body => call("/api/links", { method: "POST", headers: auth, body: JSON.stringify(body) });
const settle = () => new Promise(r => setTimeout(r, 150)); // waitUntil work completes after the response

test("auth, validation, create, duplicate", async () => {
  assert.equal((await call("/api/links", { method: "POST", body: "{}" })).status, 401);
  assert.equal((await create({ url: "ftp://x" })).status, 400);
  assert.equal((await create({ url: "https://a.com", slug: "api" })).status, 400);
  const ok = await create({ url: "https://example.com/x", slug: "spike1" });
  assert.equal(ok.status, 201);
  assert.equal((await create({ url: "https://b.com", slug: "spike1" })).status, 409);
});

test("redirect, human vs bot counters, HEAD is a bot", async () => {
  await create({ url: "https://example.com/t", slug: "counts" });
  const r = await call("/counts", { headers: { "user-agent": BROWSER } });
  assert.equal([r.status, r.headers.get("location")].join(" "), "302 https://example.com/t");
  await call("/counts", { headers: { "user-agent": "Slackbot-LinkExpanding 1.0" } });
  await call("/counts", { method: "HEAD", headers: { "user-agent": BROWSER } });
  await settle();
  const link = await (await call("/api/links/counts", { headers: auth })).json();
  assert.deepEqual([link.clicks, link.bot_clicks], [1, 2]);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM clicks").first()).n >= 3, true);
});

test("max visits is enforced and expiry gives 410", async () => {
  await create({ url: "https://example.com/c", slug: "capped1", max_visits: 2 });
  for (let i = 0; i < 2; i++) { assert.equal((await call("/capped1", { headers: { "user-agent": BROWSER } })).status, 302); await settle(); }
  assert.equal((await call("/capped1", { headers: { "user-agent": BROWSER } })).status, 410);
  await create({ url: "https://example.com/e", slug: "expired" });
  await db.prepare("UPDATE links SET expires_at = 1 WHERE slug = 'expired'").run();
  assert.equal((await call("/expired")).status, 410);
  assert.equal((await call("/nosuchslug")).status, 404);
});

test("the browser's QR encoder runs unchanged inside the Worker", async () => {
  await create({ url: "https://example.com/q", slug: "qrlink" });
  const res = await call("/api/links/qrlink/qr.svg", { headers: auth });
  assert.equal(res.headers.get("content-type"), "image/svg+xml");
  const svg = await res.text();
  assert.match(svg, /^<svg xmlns=.*viewBox="0 0 /);
  const { encode } = await import("../../hitchly/ui/lib/qr.js");
  const expectedSize = encode("http://hitch.test/qrlink").length + 8;
  assert.ok(svg.includes(`viewBox="0 0 ${expectedSize} ${expectedSize}"`));
});
