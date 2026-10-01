// Run with: node --test tests/js
import test from "node:test";
import assert from "node:assert/strict";

const lib = name => import(`../../hitchly/ui/lib/${name}.js`);

test("base64: vectors, unicode, url-safe, padding, errors", async () => {
  const b = await lib("base64");
  assert.equal(b.encodeText("hello"), "aGVsbG8=");
  assert.equal(b.decodeText("aGVsbG8="), "hello");
  assert.equal(b.decodeText("aGVsbG8"), "hello"); // padding optional
  assert.equal(b.decodeText(b.encodeText("héllo ✓ 日本語")), "héllo ✓ 日本語");
  assert.equal(b.bytesToBase64(Uint8Array.from([0x3f, 0x3f, 0x3e, 0x3e]), { urlSafe: true, padding: false }), "Pz8-Pg");
  assert.deepEqual([...b.base64ToBytes("Pz8-Pg")], [0x3f, 0x3f, 0x3e, 0x3e]);
  assert.equal(b.encodeText(""), "");
  assert.throws(() => b.decodeText("not base64!"), /Not valid Base64/);
  assert.throws(() => b.decodeText("a"), /incomplete/);
  assert.throws(() => b.decodeText("/w=="), /UTF-8/); // 0xFF is not valid UTF-8
  const big = new Uint8Array(100000).fill(65);
  assert.equal(b.base64ToBytes(b.bytesToBase64(big)).length, 100000); // chunking works for large input
});

test("urlcodec", async () => {
  const u = await lib("urlcodec");
  assert.equal(u.encode("a b&c=d/é"), "a%20b%26c%3Dd%2F%C3%A9");
  assert.equal(u.encode("a b", { form: true }), "a+b");
  assert.equal(u.encode("it's (ok)!"), "it%27s%20%28ok%29%21");
  assert.equal(u.encode("https://x.io/a b?q=é", { full: true }), "https://x.io/a%20b?q=%C3%A9");
  assert.equal(u.decode("a%20b%26c"), "a b&c");
  assert.equal(u.decode("a+b", { form: true }), "a b");
  assert.equal(u.decode("a+b"), "a+b");
  assert.throws(() => u.decode("100%"), /Malformed/);
});

test("jwt: decode, claims, status, warnings, errors", async () => {
  const { decodeJwt } = await lib("jwt");
  const seg = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  const token = [seg({ alg: "HS256", typ: "JWT" }), seg({ sub: "1234567890", name: "John Doe", iat: 1516239022, exp: 1516242622 }), "sig"].join(".");
  const t = decodeJwt(token, 1516240000 * 1000);
  assert.equal(t.payload.name, "John Doe");
  assert.equal(t.header.alg, "HS256");
  assert.equal(t.claims.iat.iso, "2018-01-18T01:30:22.000Z");
  assert.equal(t.status, "not expired");
  assert.equal(t.verified, false); // never claims verification
  assert.equal(decodeJwt(token, 1516250000 * 1000).status, "expired");
  const none = decodeJwt([seg({ alg: "none" }), seg({ a: 1 }), ""].join("."));
  assert.match(none.warnings[0], /unsigned/);
  assert.equal(none.status, "no expiry claim");
  const future = decodeJwt([seg({ alg: "HS256" }), seg({ nbf: 2000000000 }), "x"].join("."), 1700000000 * 1000);
  assert.equal(future.status, "not valid yet");
  assert.throws(() => decodeJwt("a.b"), /three/);
  assert.throws(() => decodeJwt("@@@.@@@.x"), /header/);
});

test("hash: standard vectors (FIPS 180, RFC 4231)", async () => {
  const h = await lib("hash");
  assert.equal(await h.digest("abc", "SHA-1"), "a9993e364706816aba3e25717850c26c9cd0d89d");
  assert.equal(await h.digest("abc", "SHA-256"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(await h.digest("abc", "SHA-512"),
    "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f");
  assert.equal(await h.digest("", "SHA-256"), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(await h.hmac("Jefe", "what do ya want for nothing?"), "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  await assert.rejects(() => h.digest("x", "MD5"), /Unsupported/);
});

test("uuid: v4 and v7 layout, ordering, inspect", async () => {
  const u = await lib("uuid");
  for (let i = 0; i < 200; i++) assert.match(u.uuidv4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(u.uuidv4(), u.uuidv4());
  const fixed = () => new Uint8Array(16).fill(0xff);
  assert.equal(u.uuidv7(0x018f_0000_0000, fixed), "018f0000-0000-7fff-bfff-ffffffffffff");
  assert.equal(u.inspect(u.uuidv7(1700000000000)).timestamp, "2023-11-14T22:13:20.000Z");
  assert.ok(u.uuidv7(1000) < u.uuidv7(2000)); // time ordered
  assert.equal(u.inspect("550e8400-e29b-41d4-a716-446655440000").version, 4);
  assert.equal(u.inspect("not-a-uuid"), null);
});

test("password: charset, guarantees, no modulo bias, errors", async () => {
  const p = await lib("password");
  for (let i = 0; i < 100; i++) {
    const { password } = p.generate({ length: 12, sets: ["lower", "upper", "digits"] });
    assert.equal(password.length, 12);
    assert.match(password, /[a-z]/); assert.match(password, /[A-Z]/); assert.match(password, /[0-9]/);
    assert.doesNotMatch(password, /[^a-zA-Z0-9]/);
  }
  assert.doesNotMatch(p.generate({ length: 200, avoidAmbiguous: true }).password, /[O0oIl1|`'"]/);
  assert.equal(p.generate({ length: 10, sets: ["digits"] }).entropyBits, 33.2);
  // Rejection sampling: with max=3, raw values >= 2^32-1 (which would bias the result) must be redrawn
  const seq = [0xffffffff, 4, 8];
  let i = 0;
  assert.equal(p.randomInt(3, a => { a[0] = seq[i++]; }), 1); // 0xffffffff rejected, 4 % 3 = 1
  assert.equal(i, 2);
  const counts = [0, 0, 0, 0, 0, 0];
  for (let n = 0; n < 60000; n++) counts[p.randomInt(6)]++;
  for (const c of counts) assert.ok(c > 9300 && c < 10700, `die roll skew: ${counts}`);
  assert.throws(() => p.generate({ sets: [] }), /at least one/);
  assert.throws(() => p.generate({ length: 2, sets: ["lower", "upper", "digits"] }), /Length/);
  assert.throws(() => p.generate({ sets: ["emoji"] }), /Unknown/);
  assert.match(p.randomToken(16, "hex"), /^[0-9a-f]{32}$/);
  assert.match(p.randomToken(32, "base64url"), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(p.strengthLabel(30), "weak"); assert.equal(p.strengthLabel(130), "excellent");
});

test("json: format, minify, sort, error location", async () => {
  const j = await lib("json");
  assert.equal(j.format('{"b":1,"a":[1,2]}').text, '{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}');
  assert.equal(j.format('{"b":1,"a":{"d":1,"c":2}}', { sort: true, indent: 4 }).text, '{\n    "a": {\n        "c": 2,\n        "d": 1\n    },\n    "b": 1\n}');
  assert.equal(j.format('{"a":1}', { indent: "tab" }).text, '{\n\t"a": 1\n}');
  assert.equal(j.minify('{ "a" : [ 1 , 2 ] }').text, '{"a":[1,2]}');
  const bad = j.format('{\n  "a": 1,\n}');
  assert.equal(bad.ok, false);
  assert.ok(bad.line >= 2, JSON.stringify(bad));
  assert.equal(j.parse("").ok, false);
});

test("time: parsing, units, zones, relative", async () => {
  const t = await import("../../hitchly/ui/lib/time.js");
  assert.equal(t.parseTime("0").toISOString(), "1970-01-01T00:00:00.000Z");
  assert.equal(t.parseTime("1700000000").toISOString(), "2023-11-14T22:13:20.000Z");
  assert.equal(t.parseTime("1700000000000").toISOString(), "2023-11-14T22:13:20.000Z"); // ms auto-detected
  assert.equal(t.parseTime("2026-10-01T12:00:00Z").toISOString(), "2026-10-01T12:00:00.000Z");
  assert.equal(t.parseTime("now", 5000).getTime(), 5000);
  assert.throws(() => t.parseTime("banana"), /understand/);
  const now = Date.UTC(2026, 9, 1, 12);
  assert.equal(t.relative(new Date(now - 3 * 3600e3), now), "3 hours ago");
  assert.equal(t.relative(new Date(now + 86400e3), now), "in 1 day");
  assert.equal(t.relative(new Date(now), now), "now");
  assert.match(t.inZone(new Date(Date.UTC(2026, 0, 1, 12)), "Asia/Tokyo"), /2026-01-01 21:00:00/);
  assert.throws(() => t.inZone(new Date(), "Mars/Base"), /Unknown time zone/);
  const f = t.formats(new Date(1700000000000), "UTC", 1700000000000);
  assert.equal(f["Unix seconds"], "1700000000");
  assert.equal(f["RFC 2822 (UTC)"], "Tue, 14 Nov 2023 22:13:20 GMT");
});

test("color: parse, convert, WCAG contrast", async () => {
  const c = await lib("color");
  assert.deepEqual(c.parseColor("#fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(c.parseColor("2F5BEA"), { r: 47, g: 91, b: 234 });
  assert.deepEqual(c.parseColor("rgb(10, 20, 30)"), { r: 10, g: 20, b: 30 });
  assert.deepEqual(c.parseColor("hsl(0, 100%, 50%)"), { r: 255, g: 0, b: 0 });
  assert.equal(c.toHex({ r: 47, g: 91, b: 234 }), "#2f5bea");
  assert.deepEqual(c.rgbToHsl({ r: 255, g: 0, b: 0 }), { h: 0, s: 100, l: 50 });
  assert.deepEqual(c.rgbToHsl({ r: 128, g: 128, b: 128 }), { h: 0, s: 0, l: 50 });
  const white = c.parseColor("#fff"), black = c.parseColor("#000");
  assert.equal(Math.round(c.contrast(white, black) * 100) / 100, 21);
  assert.equal(c.contrast(white, white), 1);
  const grey = c.contrast(c.parseColor("#767676"), white); // the classic "just passes AA" grey
  assert.ok(grey >= 4.5 && grey < 4.6, String(grey));
  assert.equal(c.wcag(grey).aaNormal, true); assert.equal(c.wcag(grey).aaaNormal, false);
  assert.equal(c.wcag(2.9).aaLarge, false);
  for (const bad of ["", "#12", "rgb(300,0,0)", "blue"]) assert.throws(() => c.parseColor(bad));
  for (const hex of ["#ff8800", "#123456", "#abcdef"]) { // hsl round trip stays within rounding error
    const rgb = c.parseColor(hex), { h, s, l } = c.rgbToHsl(rgb), back = c.hslToRgb(h, s, l);
    for (const k of "rgb") assert.ok(Math.abs(rgb[k] - back[k]) <= 3, `${hex} ${k}`);
  }
});

test("regex: matches, groups, named, zero-length, errors", async () => {
  const { runRegex } = await lib("regex");
  const r = runRegex("(\\d+)-(?<w>[a-z]+)", "g", "12-ab x 7-q");
  assert.equal(r.matches.length, 2);
  assert.deepEqual(r.matches[0].groups, ["12", "ab"]);
  assert.equal(r.matches[1].named.w, "q");
  assert.equal(r.matches[1].index, 8);
  assert.equal(runRegex("a*", "", "baab").matches.length, 4); // zero-length matches terminate
  assert.equal(runRegex("(", "", "x").ok, false);
  assert.equal(runRegex("x", "gg", "x").ok, false); // invalid flags reported, not thrown
  assert.equal(runRegex("a", "g", "a".repeat(1000), 10).truncated, true);
});

test("text: case conversion, slugify, counts", async () => {
  const t = await lib("text");
  assert.equal(t.CASES.camelCase("hello big_world-foo"), "helloBigWorldFoo");
  assert.equal(t.CASES.PascalCase("hello big_world"), "HelloBigWorld");
  assert.equal(t.CASES.snake_case("HelloBigWorld"), "hello_big_world");
  assert.equal(t.CASES["kebab-case"]("HTTPServerError"), "http-server-error");
  assert.equal(t.CASES.CONSTANT_CASE("someValue here"), "SOME_VALUE_HERE");
  assert.equal(t.CASES["Title Case"]("the quick fox"), "The Quick Fox");
  assert.equal(t.slugify("Héllo, Wörld! 2024"), "hello-world-2024");
  assert.equal(t.slugify("  --Crème brûlée--  "), "creme-brulee");
  assert.equal(t.slugify("a".repeat(50) + " b").length <= 32, true);
  assert.equal(t.slugify("!!!"), "");
  const c = t.count("Hello world. How are you?\nFine!");
  assert.deepEqual([c.words, c.lines, c.sentences], [6, 2, 3]);
  assert.equal(t.count("é✓").bytesUtf8, 5);
  assert.equal(t.count("").words, 0);
});

test("radix: conversions, prefixes, bigints, errors", async () => {
  const r = await lib("radix");
  assert.equal(r.parseInBase("ff", 16), 255n);
  assert.equal(r.parseInBase("0xFF", 16), 255n);
  assert.equal(r.parseInBase("0b1010_1010", 2), 170n);
  assert.equal(r.parseInBase("-z", 36), -35n);
  assert.equal(r.parseInBase("18446744073709551616", 10), 2n ** 64n); // beyond Number precision
  assert.deepEqual(r.convertAll("255", 10), { 2: "11111111", 8: "377", 10: "255", 16: "ff", 36: "73" });
  assert.throws(() => r.parseInBase("12", 2), /not a valid base-2/);
  assert.throws(() => r.parseInBase("", 10), /Enter/);
  assert.throws(() => r.parseInBase("1", 1), /Base/);
});

test("utm: build, preserve query/fragment, validation, lint", async () => {
  const m = await lib("utm");
  assert.equal(m.buildUtm("https://example.com/p?a=1#frag", { source: "news", medium: "email", campaign: "spring" }),
    "https://example.com/p?a=1&utm_source=news&utm_medium=email&utm_campaign=spring#frag");
  assert.equal(m.buildUtm("https://example.com/?utm_source=old", { source: "new" }), "https://example.com/?utm_source=new");
  assert.equal(m.buildUtm("https://example.com/?utm_term=x", {}), "https://example.com/"); // empty clears
  assert.throws(() => m.buildUtm("https://example.com", { medium: "email" }), /utm_source is required/);
  assert.throws(() => m.buildUtm("example.com", { source: "a" }), /complete URL/);
  assert.throws(() => m.buildUtm("ftp://x.com", { source: "a" }), /http/);
  assert.equal(m.lintUtm({ source: "News", campaign: "a b" }).length, 2);
  assert.deepEqual(m.lintUtm({ source: "news" }), []);
});

test("urlparse: parse and clean tracking params", async () => {
  const u = await lib("urlparse");
  const p = u.parseUrl("https://user:pw@Example.com:8443/a/b?x=1&utm_source=n&fbclid=abc&x=2#top");
  assert.equal(p.hostname, "example.com"); assert.equal(p.port, "8443"); assert.equal(p.hash, "#top");
  assert.equal(p.password, "(hidden)");
  assert.deepEqual(p.params.map(q => [q.key, q.tracking]), [["x", false], ["utm_source", true], ["fbclid", true], ["x", false]]);
  const c = u.cleanUrl("https://example.com/p?id=7&utm_medium=x&gclid=1&q=a+b#s");
  assert.equal(c.url, "https://example.com/p?id=7&q=a+b#s");
  assert.equal(c.removed, 2);
  assert.equal(u.cleanUrl("https://example.com/p?b=1&a=2#s", { sortParams: true, removeFragment: true }).url, "https://example.com/p?a=2&b=1");
  assert.equal(u.cleanUrl("https://example.com/p?utm_source=x").url, "https://example.com/p");
  assert.throws(() => u.parseUrl("example.com"), /complete URL/);
});
