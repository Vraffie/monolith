// The JS encoder must produce exactly the same matrix as the Python one (which zxing-cpp decodes for versions 1-40).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { encode, toSvg } from "../../hitchly/ui/lib/qr.js";
import * as pl from "../../hitchly/ui/lib/qrpayload.js";

const SAMPLES = [
  "a", "hi", "https://example.com/abc", "https://example.com/" + "z".repeat(100), "https://x.io/" + "q?=&%".repeat(60),
  "héllo ✓ 日本語", "WIFI:T:WPA;S:cafe;P:secret;;", "x".repeat(26), "x".repeat(27), "x".repeat(213), "x".repeat(214),
  "y".repeat(500), "z".repeat(1000), "w".repeat(2000), "https://" + "long.".repeat(300) + "example.com/",
];

function pythonMatrix(text) {
  const code = "import sys,json;sys.path.insert(0,'.');from hitchly import qr;print(json.dumps([''.join('1' if c else '0' for c in r) for r in qr.encode(sys.stdin.read())]))";
  return JSON.parse(execFileSync("python3", ["-c", code], { input: text, cwd: new URL("../..", import.meta.url).pathname, maxBuffer: 1 << 26 }));
}

test("JS encoder matches the Python encoder module-for-module", () => {
  for (const text of SAMPLES) {
    const js = encode(text).map(r => r.map(v => (v ? "1" : "0")).join(""));
    assert.deepEqual(js, pythonMatrix(text), `mismatch for ${JSON.stringify(text.slice(0, 40))} (${text.length} chars)`);
  }
});

test("sizes and limits", () => {
  assert.equal(encode("hi").length, 21);
  assert.equal(encode("x".repeat(26)).length, 25);
  assert.equal(encode("x".repeat(27)).length, 29);
  assert.throws(() => encode("x".repeat(3000)), /Too much data/);
});

test("svg output", () => {
  const svg = toSvg(encode("hi"));
  assert.match(svg, /^<svg xmlns=.* viewBox="0 0 29 29"/);
  assert.match(svg, /<path d="M/);
});

const BS = "\u005c"; // one backslash (spelled out so no tool or editor can mangle `backslash + semicolon`)

test("payloads: wifi escaping, vcard, mailto, sms, geo, tel, url", () => {
  const pw = ["p", ":", "a", '"', "ss", BS, "1"].join("");               // p:a"ss\1
  assert.equal(pl.wifi({ ssid: "My;Net", password: pw, security: "WPA", hidden: true }),
    ["WIFI:T:WPA;S:My", BS, ";Net;P:p", BS, ":a", BS, '"ss', BS, BS, "1;H:true;;"].join(""));
  assert.equal(pl.wifi({ ssid: "Open", security: "nopass" }), "WIFI:T:nopass;S:Open;;");
  assert.throws(() => pl.wifi({ ssid: "x", security: "WPA" }), /password is required/);
  assert.throws(() => pl.wifi({ ssid: "" }), /SSID/);
  const v = pl.vcard({ first: "Ada", last: "Lovelace, Countess", org: "Analytical; Engines", email: "ada@example.com" });
  const lines = v.split("\r\n");
  assert.deepEqual(lines.slice(0, 2), ["BEGIN:VCARD", "VERSION:3.0"]);
  assert.equal(lines[2], "N:Lovelace" + BS + ", Countess;Ada;;;");
  assert.equal(lines[3], "FN:Ada Lovelace" + BS + ", Countess");
  assert.equal(lines[4], "ORG:Analytical" + BS + "; Engines");
  assert.deepEqual(lines.slice(-2), ["EMAIL:ada@example.com", "END:VCARD"]);
  assert.equal(pl.vcard({ first: "A", org: "x" + String.fromCharCode(10) + "y" }).includes("ORG:x" + BS + "ny"), true); // newline escaped
  assert.throws(() => pl.vcard({}), /name or an organisation/);
  assert.equal(pl.email({ to: "a@b.co", subject: "Hi there", body: "x&y" }), "mailto:a@b.co?subject=Hi%20there&body=x%26y");
  assert.throws(() => pl.email({ to: "nope" }), /valid email/);
  assert.equal(pl.sms({ number: "+1 (555) 123-4567", message: "hey" }), "SMSTO:+15551234567:hey");
  assert.throws(() => pl.sms({ number: "12" }), /3-15 digits/);
  assert.equal(pl.phone("+47 22 33 44 55"), "tel:+4722334455");
  assert.equal(pl.geo({ lat: "59.9139", lon: "10.7522" }), "geo:59.9139,10.7522");
  assert.throws(() => pl.geo({ lat: "91", lon: "0" }), /Latitude/);
  assert.throws(() => pl.geo({ lat: "", lon: "0" }), /Latitude/);
  assert.equal(pl.url(" https://example.com "), "https://example.com/");
  assert.throws(() => pl.url("example.com"), /complete URL/);
});
