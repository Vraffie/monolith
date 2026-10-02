import test from "node:test";
import assert from "node:assert/strict";
const lib = n => import(`../../hitchly/ui/lib/${n}.js`);

// ---------- diff ----------
test("diff: edit scripts, minimality (vs. a DP LCS), reconstruction", async () => {
  const d = await lib("diff");
  const rows = (a, b, m) => d.diffRows(a, b, m).map(r => (r.type === "eq" ? "=" : r.type === "add" ? "+" : "-") + r.text);
  assert.deepEqual(rows("a\nb\nc", "a\nc"), ["=a", "-b", "=c"]);
  assert.deepEqual(rows("a\nc", "a\nb\nc"), ["=a", "+b", "=c"]);
  assert.deepEqual(rows("", ""), ["=" + ""]);          // one empty line on each side
  assert.deepEqual(d.myers([], []), []);
  assert.deepEqual(d.myers([], ["x"]).map(o => o.type), ["add"]);
  assert.deepEqual(d.diffRows("same", "same").map(r => r.type), ["eq"]);
  assert.deepEqual(rows("the quick fox", "the slow fox", "words"), ["=the", "= ", "-quick", "+slow", "= ", "=fox"]);
  assert.deepEqual(rows("abc", "axc", "chars"), ["=a", "-b", "+x", "=c"]);
  assert.deepEqual(d.stats(d.diffRows("a\nb\nc", "a\nx\nc\nd")), { added: 2, removed: 1, unchanged: 2 });
  // property test: ops reconstruct b from a, and the edit count equals the DP optimum
  let seed = 7; const rnd = n => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
  const lcs = (a, b) => { const t = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0)); for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) t[i][j] = a[i - 1] === b[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1]); return t[a.length][b.length]; };
  for (let n = 0; n < 300; n++) {
    const A = Array.from({ length: rnd(14) }, () => "abcd"[rnd(4)]), B = Array.from({ length: rnd(14) }, () => "abcd"[rnd(4)]);
    const ops = d.myers(A, B), out = [];
    for (const o of ops) { if (o.type === "eq") { assert.equal(A[o.ai], B[o.bi]); out.push(B[o.bi]); } else if (o.type === "add") out.push(B[o.bi]); }
    assert.deepEqual(out, B, `reconstruct ${A.join("")} -> ${B.join("")}`);
    assert.equal(ops.filter(o => o.type !== "eq").length, A.length + B.length - 2 * lcs(A, B), `minimal edits for ${A.join("")} -> ${B.join("")}`);
  }
  assert.throws(() => d.myers(new Array(4000).fill("a"), new Array(4000).fill("b")), /too large/);
});

test("diff: unified output matches diff -u conventions", async () => {
  const d = await lib("diff");
  assert.equal(d.unified("a\nb\nc\n", "a\nb\nc\n"), "");
  const u = d.unified("1\n2\n3\n4\n5\n6\n7\n8\n9\n10", "1\n2\n3\n4\nFIVE\n6\n7\n8\n9\n10", { context: 2, from: "old", to: "new" });
  assert.equal(u, "--- old\n+++ new\n@@ -3,5 +3,5 @@\n 3\n 4\n-5\n+FIVE\n 6\n 7\n");
  assert.equal(d.unified("a", "a\nb").split("\n")[2], "@@ -1,1 +1,2 @@");
});

test("diff: JSON structural diff ignores key order, reports paths", async () => {
  const d = await lib("diff");
  assert.deepEqual(d.jsonDiff({ a: 1, b: 2 }, { b: 2, a: 1 }), []);
  assert.deepEqual(d.jsonDiff({ a: 1, n: { x: [1, 2] } }, { a: 2, n: { x: [1, 3, 4] }, z: true }),
    [{ path: "$.a", kind: "changed", from: 1, to: 2 }, { path: "$.n.x[1]", kind: "changed", from: 2, to: 3 }, { path: "$.n.x[2]", kind: "added", to: 4 }, { path: "$.z", kind: "added", to: true }]);
  assert.deepEqual(d.jsonDiff({ "a-b": 1 }, {}), [{ path: '$["a-b"]', kind: "removed", from: 1 }]);
  assert.equal(d.jsonDiff(1, "1")[0].kind, "changed");                 // type change counts
  assert.equal(d.jsonDiff(null, 0)[0].kind, "changed");
  assert.deepEqual(d.jsonDiff([1, 2, 3], [1]).map(x => x.path), ["$[1]", "$[2]"]);
});

// ---------- cron ----------
test("cron: parsing, next runs, semantics, errors", async () => {
  const c = await lib("cron");
  const from = new Date("2026-10-01T12:07:00Z"), iso = a => a.map(d => d.toISOString().slice(0, 16));
  assert.deepEqual(iso(c.nextRuns("*/15 * * * *", from, 4)), ["2026-10-01T12:15", "2026-10-01T12:30", "2026-10-01T12:45", "2026-10-01T13:00"]);
  assert.deepEqual(iso(c.nextRuns("0 9 * * 1-5", from, 3)), ["2026-10-02T09:00", "2026-10-05T09:00", "2026-10-06T09:00"]);      // Fri, Mon, Tue
  assert.deepEqual(iso(c.nextRuns("30 2 29 2 *", from, 2)), ["2028-02-29T02:30", "2032-02-29T02:30"]);                             // leap days only
  assert.deepEqual(iso(c.nextRuns("@daily", from, 2)), ["2026-10-02T00:00", "2026-10-03T00:00"]);
  assert.deepEqual(iso(c.nextRuns("0 0 1 JAN *", from, 1)), ["2027-01-01T00:00"]);
  assert.deepEqual(iso(c.nextRuns("0 12 * * SUN", from, 2)), ["2026-10-04T12:00", "2026-10-11T12:00"]);
  assert.deepEqual(iso(c.nextRuns("0 12 * * 7", from, 1)), ["2026-10-04T12:00"]);                                                  // 7 is Sunday too
  assert.deepEqual(iso(c.nextRuns("7 12 * * *", from, 1)), ["2026-10-02T12:07"]);                                                  // strictly after `from`
  // day-of-month AND day-of-week both restricted => OR (Vixie cron)
  assert.deepEqual(iso(c.nextRuns("0 0 13 * 5", new Date("2026-10-01T00:00:00Z"), 4)), ["2026-10-02T00:00", "2026-10-09T00:00", "2026-10-13T00:00", "2026-10-16T00:00"]);
  assert.deepEqual(iso(c.nextRuns("0 0 1,15 * *", from, 3)), ["2026-10-15T00:00", "2026-11-01T00:00", "2026-11-15T00:00"]);
  assert.deepEqual(iso(c.nextRuns("5-10/2 * * * *", from, 3)), ["2026-10-01T12:09", "2026-10-01T13:05", "2026-10-01T13:07"]);
  assert.deepEqual(iso(c.nextRuns("0 0 31 * *", from, 3)), ["2026-10-31T00:00", "2026-12-31T00:00", "2027-01-31T00:00"]);      // months without a 31st skipped
  assert.deepEqual(c.nextRuns("0 0 30 2 *", from, 1), []);                                                                         // never happens
  for (const [bad, msg] of [["* * * *", /5 fields/], ["61 * * * *", /minute must be/], ["* 24 * * *", /hour must be/], ["* * 0 * *", /day of month must be/],
    ["* * * 13 *", /month must be/], ["* * * * 8", /day of week must be/], ["*/0 * * * *", /positive/], ["a * * * *", /not valid/], ["5-1 * * * *", /minute must be/], ["@reboot", /boot/], ["@sometimes", /Unknown macro/], ["1,,2 * * * *", /Empty/]])
    assert.throws(() => c.parseCron(bad), msg, bad);
});

test("cron: plain-English explanations", async () => {
  const c = await lib("cron");
  const cases = {
    "* * * * *": "Every minute", "*/5 * * * *": "Every 5 minutes", "30 9 * * *": "At 09:30", "0 * * * *": "At the start of every hour",
    "15 * * * *": "At minute 15 past every hour", "0 9 * * 1-5": "At 09:00, on Monday through Friday", "0 0 1 * *": "At 00:00, on day-of-month 1",
    "0 0 1 1 *": "At 00:00, on day-of-month 1, in January", "0 12 * * 0,6": "At 12:00, on Sunday and Saturday", "0 8,17 * * *": "At minute 0 past hour 8 and 17",
    "0 0 13 * 5": "At 00:00, on day-of-month 13 or on Friday (when both are set, either matches)", "@weekly": "At 00:00, on Sunday",
    "*/10 8-18 * * *": "At minutes 0, 10, 20, 30, 40 and 50 past hours 8 through 18", "0 0 * 6-8 *": "At 00:00, in June through August",
  };
  for (const [expr, text] of Object.entries(cases)) assert.equal(c.explainCron(expr), text, expr);
});

// ---------- CSV <-> JSON ----------
test("convert: JSON <-> CSV", async () => {
  const v = await lib("convert");
  assert.equal(v.jsonToCsv([{ a: 1, b: "x,y" }, { a: 2, c: { n: 1 } }]), 'a,b,c\r\n1,"x,y",\r\n2,,"{""n"":1}"\r\n');
  assert.equal(v.jsonToCsv({ a: 1 }), "a\r\n1\r\n");
  assert.equal(v.jsonToCsv([]), "");
  assert.throws(() => v.jsonToCsv([1, 2]), /array of objects/);
  assert.deepEqual(v.csvToJson("a,b,c\n1,true,\n2.5,null,x"), [{ a: 1, b: true, c: "" }, { a: 2.5, b: null, c: "x" }]);
  assert.deepEqual(v.csvToJson("id\n007\n12345678901234567890", { types: true }), [{ id: "007" }, { id: "12345678901234567890" }]);  // no precision loss, no lost leading zeros
  assert.deepEqual(v.csvToJson("a\n1", { types: false }), [{ a: "1" }]);
  assert.deepEqual(v.csvToJson(""), []);
  const data = [{ name: 'Ann "A"', n: 1 }, { name: "line\nbreak", n: 2 }];
  assert.deepEqual(v.csvToJson(v.jsonToCsv(data)), data);          // round trip with quotes and newlines
});

// ---------- YAML ----------
test("yaml: real-world documents", async () => {
  const { parseYaml } = await lib("yaml");
  const compose = `# a comment
version: "3.8"
services:
  web:
    image: nginx:1.25   # trailing comment
    ports:
      - "80:80"
      - 443:443
    environment:
      - KEY=value
      - EMPTY=
    deploy: {replicas: 2, labels: [a, b]}
  db:
    image: postgres
    healthcheck:
      test: ["CMD", "pg_isready"]
volumes: {}
`;
  assert.deepEqual(parseYaml(compose), {
    version: "3.8", services: { web: { image: "nginx:1.25", ports: ["80:80", "443:443"], environment: ["KEY=value", "EMPTY="], deploy: { replicas: 2, labels: ["a", "b"] } },
      db: { image: "postgres", healthcheck: { test: ["CMD", "pg_isready"] } } }, volumes: {} });
  assert.deepEqual(parseYaml("---\n- a: 1\n  b: 2\n- c:\n    - x\n    - y\n- - nested\n  - seq\n- plain"),
    [{ a: 1, b: 2 }, { c: ["x", "y"] }, ["nested", "seq"], "plain"]);
  assert.deepEqual(parseYaml("key:\n- a\n- b\nother: 1"), { key: ["a", "b"], other: 1 });          // sequence at the key's own indent
  assert.deepEqual(parseYaml("a: 1\nb: 1.5\nc: -3\nd: 1e3\ne: 0x1F\nf: 0o17\ng: yes\nh: ~\ni: null\nj: true\nk: False\nl: 2001-12-14\nm: 12345678901234567890"),
    { a: 1, b: 1.5, c: -3, d: 1000, e: 31, f: 15, g: "yes", h: null, i: null, j: true, k: false, l: "2001-12-14", m: "12345678901234567890" });
  assert.deepEqual(parseYaml(`q: 'it''s'\nd: "tab\\tnew\\nline \\u00e9"\nurl: http://x.io:80/a#frag\nhash: "a #not comment"\ncolon: "a: b"`),
    { q: "it's", d: "tab\tnew\nline é", url: "http://x.io:80/a#frag", hash: "a #not comment", colon: "a: b" });
  assert.deepEqual(parseYaml('"quoted key": 1\n\'single\': 2\n? x'.split("\n").slice(0, 2).join("\n")), { "quoted key": 1, single: 2 });
  assert.deepEqual(parseYaml("lit: |\n  line1\n  line2\n\n  line4\nfold: >\n  a\n  b\n\n  c\nstrip: |-\n  x\nkeep: |+\n  y\n\nend: 1"),
    { lit: "line1\nline2\n\nline4\n", fold: "a b\nc\n", strip: "x", keep: "y\n\n", end: 1 });
  assert.equal(parseYaml(""), null); assert.equal(parseYaml("# only a comment\n"), null); assert.equal(parseYaml("42"), 42); assert.equal(parseYaml("just text"), "just text");
  assert.deepEqual(parseYaml("a: [1, [2, 3], {x: \"y,z\"}]\nb: {}"), { a: [1, [2, 3], { x: "y,z" }], b: {} });
});

test("yaml: unsupported or invalid input is refused with a line number, never guessed", async () => {
  const { parseYaml } = await lib("yaml");
  for (const [src, msg] of [["a: &x 1", /anchors/], ["a: *x", /anchors/], ["a: !!str 1", /tags/], ["<<: {a: 1}", /merge/], ["a: 1\n---\nb: 2", /multiple documents/],
    ["a: 1\na: 2", /duplicate key 'a'/], ["a:\n\tb: 1", /tabs/], ["a: \"open", /unterminated/], ["a: [1, 2", /flow/], ["a: 1\n   b: 2", /indentation/], ["? k\n: v", /complex keys/], ["a: b\nplain", /key: value/]])
    assert.throws(() => parseYaml(src), msg, src);
  assert.throws(() => parseYaml("a: 1\nb: [\n"), /Line 2/);
});

test("yaml: writer output is valid and round-trips (including strings that look like other types)", async () => {
  const { parseYaml, toYaml } = await lib("yaml");
  const tricky = ["yes", "No", "null", "~", "true", "123", "1e3", "0x1F", "-", "- a", "a: b", "a #b", "#c", "  lead", "trail ", "", "tab\there", "line\nbreak", "é✓日本", "{x}", "[y]", "@at", "%pct", "*star", "&amp", "!bang", "|pipe", ">gt", "'q'", '"dq"', "a:", ":a", "---", "..."];
  for (const s of tricky) assert.deepEqual(parseYaml(toYaml({ k: s })), { k: s }, JSON.stringify(s));
  for (const s of tricky) assert.deepEqual(parseYaml(toYaml([s])), [s], "seq " + JSON.stringify(s));
  assert.equal(toYaml({ a: [1, { b: 2, c: [] }], d: {} , e: null }), "a:\n  - 1\n  - b: 2\n    c: []\nd: {}\ne: null\n");
  assert.equal(toYaml([]), "[]\n"); assert.equal(toYaml("hi"), "hi\n"); assert.equal(toYaml(3), "3\n"); assert.equal(toYaml(NaN), "null\n");
  let seed = 11; const rnd = n => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
  const gen = depth => {
    const r = rnd(depth > 3 ? 4 : 7);
    if (r === 0) return null; if (r === 1) return rnd(2) === 0; if (r === 2) return rnd(1000) - 500; if (r === 3) return tricky[rnd(tricky.length)];
    if (r <= 5) return Array.from({ length: rnd(4) }, () => gen(depth + 1));
    return Object.fromEntries(Array.from({ length: rnd(4) }, (_, i) => ["k" + i + (rnd(3) === 0 ? " x" : ""), gen(depth + 1)]));
  };
  for (let n = 0; n < 400; n++) { const v = gen(0); assert.deepEqual(parseYaml(toYaml(v)), v, JSON.stringify(v)); }
});

// ---------- XML ----------
test("xml: parsing", async () => {
  const { parseXml } = await lib("xml");
  assert.deepEqual(parseXml('<?xml version="1.0"?><!-- c --><root a="1" b=\'2\'><item>one</item><item>two</item><empty/><t>x &amp; y &#65;&#x42;</t><c><![CDATA[<raw>&]]></c></root>'),
    { root: { "@a": "1", "@b": "2", item: ["one", "two"], empty: "", t: "x & y AB", c: "<raw>&" } });
  assert.deepEqual(parseXml("<a><b>1</b><b>2</b><b>3</b></a>"), { a: { b: ["1", "2", "3"] } });         // 3+ repeats stay one flat array
  assert.deepEqual(parseXml('<p id="7">hello <b>bold</b> world</p>'), { p: { "@id": "7", b: "bold", "#text": "hello  world" } });
  assert.deepEqual(parseXml("<a>\n  <b>\n    <c>deep</c>\n  </b>\n</a>"), { a: { b: { c: "deep" } } });
  for (const [bad, msg] of [["<a><b></a>", /does not match/], ["<a>", /unclosed/], ["<a></a><b/>", /after the root/], ["<!DOCTYPE x><a/>", /DOCTYPE/], ["<a>&bogus;</a>", /Unknown entity/],
    ["<a x=1/>", /attribute/], ["<a x='1' x='2'/>", /duplicate/], ["not xml", /expected an element/], ["<a><!-- open</a>", /unterminated/], ["<a>&#xFFFFFFFF;</a>", /Invalid character/]])
    assert.throws(() => parseXml(bad), msg, bad);
});

test("xml: writing, escaping, name sanitising, round trip", async () => {
  const { toXml, parseXml } = await lib("xml");
  assert.equal(toXml({ users: { user: [{ "@id": "1", name: "A & B" }, { "@id": "2", name: "C" }] } }, { declaration: false }),
    '<users>\n  <user id="1">\n    <name>A &amp; B</name>\n  </user>\n  <user id="2">\n    <name>C</name>\n  </user>\n</users>\n');
  assert.equal(toXml([1, 2], { root: "nums", declaration: false }), "<nums>1</nums>\n<nums>2</nums>\n");
  assert.equal(toXml({ "1bad key!": 1, ok: null }, { root: "r", declaration: false }), "<r>\n  <_1bad_key_>1</_1bad_key_>\n  <ok/>\n</r>\n");
  assert.equal(toXml("x", { declaration: false }), "<root>x</root>\n");
  assert.match(toXml({ a: 1 }), /^<\?xml version="1.0" encoding="UTF-8"\?>\n/);
  assert.equal(toXml({ a: { "@q": 'say "hi" <b>' } }, { declaration: false }), '<a q="say &quot;hi&quot; &lt;b&gt;"/>\n');
  const doc = { shop: { "@open": "yes", item: [{ "@sku": "a1", price: "9.50", tags: { tag: ["x", "y"] } }, { "@sku": "b2", price: "3" }], note: "a < b & c" } };
  assert.deepEqual(parseXml(toXml(doc)), doc);
});

// ---------- convert (all pairs) ----------
test("convert: between every pair of formats, with readable errors", async () => {
  const { convert } = await lib("convert");
  const json = '{"name":"Ann","tags":["a","b"],"n":{"x":1}}';
  const yaml = convert(json, "json", "yaml");
  assert.equal(yaml, "name: Ann\ntags:\n  - a\n  - b\nn:\n  x: 1\n");
  assert.deepEqual(JSON.parse(convert(yaml, "yaml", "json")), JSON.parse(json));
  assert.match(convert(json, "json", "xml"), /<name>Ann<\/name>/);
  assert.equal(convert("a,b\n1,2", "csv", "json"), '[\n  {\n    "a": 1,\n    "b": 2\n  }\n]\n');
  assert.equal(convert("a: 1\nb: x", "yaml", "csv"), "a,b\r\n1,x\r\n");
  assert.throws(() => convert("{bad", "json", "yaml"), /Could not read the input as JSON/);
  assert.throws(() => convert("a: &x 1", "yaml", "json"), /anchors/);
  assert.throws(() => convert("x", "json", "json"), /different/);
  assert.throws(() => convert("x", "json", "toml"), /Unknown format/);
});

// ---------- HTTP reference ----------
test("httpref: status codes and MIME types", async () => {
  const h = await lib("httpref");
  assert.equal(new Set(h.STATUS.map(s => s.code)).size, h.STATUS.length);
  assert.ok(h.STATUS.every(s => s.code >= 100 && s.code <= 599 && s.name && s.meaning.length > 10));
  const by = c => h.STATUS.find(s => s.code === c);
  assert.equal(by(404).class, "Client error"); assert.equal(by(301).class, "Redirection"); assert.equal(by(204).class, "Success");
  assert.match(by(302).meaning, /not cached|counted/i); assert.match(by(308).meaning, /keeps the request method/); assert.match(by(410).meaning, /Hitchly/);
  for (const c of [200, 201, 204, 301, 302, 303, 304, 307, 308, 400, 401, 403, 404, 405, 409, 410, 418, 422, 429, 500, 502, 503, 504]) assert.ok(by(c), "missing " + c);
  assert.deepEqual(h.searchStatus("4").every(s => String(s.code).startsWith("4") || /4/.test(s.name + s.meaning)), true);
  assert.equal(h.searchStatus("teapot")[0].code, 418); assert.equal(h.searchStatus("redirection").length >= 6, true); assert.equal(h.searchStatus("zzzz").length, 0); assert.equal(h.searchStatus("").length, h.STATUS.length);
  assert.equal(h.MIME.find(m => m.ext === "json").type, "application/json"); assert.equal(h.searchMime(".PNG")[0].type, "image/png"); assert.ok(h.searchMime("video/").length >= 4);
  assert.equal(new Set(h.MIME.map(m => m.ext)).size, h.MIME.length);
});
