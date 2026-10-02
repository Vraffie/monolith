import test from "node:test";
import assert from "node:assert/strict";
const lib = n => import(`../../hitchly/ui/lib/${n}.js`);
const BS = String.fromCharCode(92);  // one backslash

// ---------- TOTP / HOTP ----------
test("hotp: RFC 4226 Appendix D vectors", async () => {
  const t = await lib("totp"), key = new TextEncoder().encode("12345678901234567890");
  const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  for (let c = 0; c < 10; c++) assert.equal(await t.hotp(key, c), expected[c], `counter ${c}`);
});

test("totp: RFC 6238 Appendix B vectors (SHA-1, SHA-256, SHA-512, 8 digits)", async () => {
  const t = await lib("totp"), enc = s => new TextEncoder().encode(s);
  const keys = { SHA1: enc("12345678901234567890"), SHA256: enc("12345678901234567890123456789012"), SHA512: enc("1234567890123456789012345678901234567890123456789012345678901234") };
  const times = [59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000];
  const want = {
    SHA1: ["94287082", "07081804", "14050471", "89005924", "69279037", "65353130"],
    SHA256: ["46119246", "68084774", "67062674", "91819424", "90698825", "77737706"],
    SHA512: ["90693936", "25091201", "99943326", "93441116", "38618901", "47863826"],
  };
  for (const algo of Object.keys(keys)) for (let i = 0; i < times.length; i++)
    assert.equal((await t.totp(keys[algo], times[i], { digits: 8, algorithm: algo })).code, want[algo][i], `${algo} @ ${times[i]}`);
  const r = await t.totp(keys.SHA1, 59, { digits: 6 });
  assert.deepEqual([r.code, r.secondsLeft], ["287082", 1]);                        // 59 s into a 30 s period: 1 s left
  assert.equal((await t.totp(keys.SHA1, 60)).secondsLeft, 30);
  assert.equal((await t.totp(keys.SHA1, 120, { period: 60 })).secondsLeft, 60);
  await assert.rejects(() => t.hotp(keys.SHA1, 0, { digits: 5 }), /Digits/);
  await assert.rejects(() => t.hotp(keys.SHA1, 0, { algorithm: "MD5" }), /Algorithm/);
});

test("base32 and otpauth URIs", async () => {
  const t = await lib("totp");
  assert.equal(t.base32Encode(new TextEncoder().encode("foobar")), "MZXW6YTBOI");        // RFC 4648 test vector
  assert.equal(t.base32Encode(new TextEncoder().encode("fooba")), "MZXW6YTB");
  assert.equal(new TextDecoder().decode(t.base32Decode("MZXW6YTBOI======")), "foobar");
  assert.equal(new TextDecoder().decode(t.base32Decode("mzxw 6ytb-oi")), "foobar");       // case, spaces and dashes tolerated
  assert.deepEqual([...t.base32Decode(t.base32Encode(Uint8Array.from([0, 255, 1, 128, 7])))], [0, 255, 1, 128, 7]);
  assert.throws(() => t.base32Decode("MZXW1"), /not a Base32/); assert.throws(() => t.base32Decode(""), /Enter the secret/);
  assert.equal(t.otpauthUri({ secret: "jbsw y3dp ehpk 3pxp", account: "alice@example.com", issuer: "Example Co" }),
    "otpauth://totp/Example%20Co:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example%20Co");
  assert.match(t.otpauthUri({ secret: "JBSWY3DPEHPK3PXP", account: "a", algorithm: "SHA256", digits: 8, period: 60 }), /algorithm=SHA256&digits=8&period=60$/);
  const parsed = t.parseOtpauth(t.otpauthUri({ secret: "JBSWY3DPEHPK3PXP", account: "alice@example.com", issuer: "Example Co", digits: 8 }));
  assert.deepEqual(parsed, { secret: "JBSWY3DPEHPK3PXP", account: "alice@example.com", issuer: "Example Co", algorithm: "SHA1", digits: 8, period: 30 });
  assert.throws(() => t.parseOtpauth("otpauth://hotp/x?secret=AA"), /totp/); assert.throws(() => t.parseOtpauth("https://x"), /totp/); assert.throws(() => t.parseOtpauth("otpauth://totp/x"), /no secret/);
  assert.throws(() => t.otpauthUri({ secret: "AAAA", account: "" }), /Account/); assert.throws(() => t.otpauthUri({ secret: "!!", account: "a" }), /Base32/);
});

// ---------- subnet ----------
test("subnet: IPv4 CIDR facts", async () => {
  const s = await lib("subnet");
  const a = s.cidr("192.168.1.130/26");
  assert.deepEqual([a.network, a.broadcast, a.first, a.last, a.mask, a.wildcard, a.total, a.usable], ["192.168.1.128", "192.168.1.191", "192.168.1.129", "192.168.1.190", "255.255.255.192", "0.0.0.63", 64n, 62n]);
  assert.equal(a.binaryMask, "11111111.11111111.11111111.11000000"); assert.equal(a.class, "C"); assert.equal(a.private, true);
  const b = s.cidr("10.0.0.0/8"); assert.deepEqual([b.last, b.usable, b.class, b.private], ["10.255.255.254", 16777214n, "A", true]);
  const p2p = s.cidr("203.0.113.4/31"); assert.deepEqual([p2p.first, p2p.last, p2p.usable], ["203.0.113.4", "203.0.113.5", 2n]);   // RFC 3021: both addresses usable
  const host = s.cidr("8.8.8.8"); assert.deepEqual([host.prefix, host.total, host.usable, host.private], [32, 1n, 1n, false]);
  const all = s.cidr("0.0.0.0/0"); assert.deepEqual([all.total, all.mask, all.last], [4294967296n, "0.0.0.0", "255.255.255.254"]);
  assert.equal(s.cidr("172.16.5.4/12").network, "172.16.0.0"); assert.equal(s.cidr("172.31.0.1/32").private, true); assert.equal(s.cidr("172.32.0.1/32").private, false);
  assert.equal(s.cidr("224.0.0.1/4").class, "D (multicast)");
  for (const bad of ["300.1.1.1/24", "1.2.3/24", "1.2.3.4/33", "1.2.3.4/-1", "1.2.3.4/x", "1.2.3.4/24/1", "01.2.3.4/24", " "]) assert.throws(() => s.cidr(bad), undefined, bad);
});

test("subnet: IPv6 parsing, RFC 5952 compression, CIDR", async () => {
  const s = await lib("subnet");
  const rt = (txt, want) => assert.equal(s.formatIPv6(s.parseIPv6(txt)), want, txt);
  rt("2001:0db8:0000:0000:0000:0000:0000:0001", "2001:db8::1"); rt("::", "::"); rt("::1", "::1"); rt("1::", "1::"); rt("2001:db8:0:0:1:0:0:1", "2001:db8::1:0:0:1");
  rt("2001:db8:0:1:1:1:1:1", "2001:db8:0:1:1:1:1:1");           // a single zero group is NOT compressed
  rt("::ffff:192.0.2.128", "::ffff:c000:280"); rt("FE80::1%eth0", "fe80::1"); rt("1:0:0:2:0:0:0:3", "1:0:0:2::3");   // longest zero run wins
  assert.equal(s.formatIPv6(s.parseIPv6("2001:db8::1"), { expand: true }), "2001:0db8:0000:0000:0000:0000:0000:0001");
  const c = s.cidr("2001:db8:abcd:12::1/64");
  assert.deepEqual([c.network, c.first, c.last, c.total, c.version], ["2001:db8:abcd:12::", "2001:db8:abcd:12::", "2001:db8:abcd:12:ffff:ffff:ffff:ffff", 2n ** 64n, 6]);
  assert.equal(s.cidr("2001:db8::/32").total, 2n ** 96n); assert.equal(s.cidr("::1/128").total, 1n); assert.equal(s.cidr("::/0").total, 2n ** 128n);
  for (const bad of ["1::2::3", "12345::", "1:2:3:4:5:6:7", "g::1", "1:2:3:4:5:6:7:8:9", ":1:2:3:4:5:6:7", "::/129"]) assert.throws(() => (bad.includes("/") ? s.cidr(bad) : s.parseIPv6(bad)), undefined, bad);
});

test("subnet: range to minimal CIDR list (checked by re-expanding)", async () => {
  const s = await lib("subnet");
  assert.deepEqual(s.rangeToCidrs("192.168.0.5", "192.168.0.20"), ["192.168.0.5/32", "192.168.0.6/31", "192.168.0.8/29", "192.168.0.16/30", "192.168.0.20/32"]);
  assert.deepEqual(s.rangeToCidrs("10.0.0.0", "10.0.0.255"), ["10.0.0.0/24"]);
  assert.deepEqual(s.rangeToCidrs("0.0.0.0", "255.255.255.255"), ["0.0.0.0/0"]);
  assert.deepEqual(s.rangeToCidrs("1.2.3.4", "1.2.3.4"), ["1.2.3.4/32"]);
  assert.deepEqual(s.rangeToCidrs("2001:db8::", "2001:db8::ffff"), ["2001:db8::/112"]);
  let seed = 3; const rnd = n => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
  for (let i = 0; i < 200; i++) {                                        // property: blocks are contiguous, aligned, and exactly cover [a, b]
    const a = BigInt(rnd(100000)), b = a + BigInt(rnd(5000)), base = 0x0a000000n;
    const list = s.rangeToCidrs(s.formatIPv4(base + a), s.formatIPv4(base + b));
    let next = base + a;
    for (const c of list) { const info = s.cidr(c); const net = BigInt(info.network.split(".").reduce((x, y) => x * 256 + +y, 0)); assert.equal(net, next, c); assert.equal(info.network, info.address); next = net + info.total; }
    assert.equal(next, base + b + 1n);
  }
  assert.throws(() => s.rangeToCidrs("10.0.0.9", "10.0.0.1"), /after the end/); assert.throws(() => s.rangeToCidrs("10.0.0.1", "::1"), /both/);
});

// ---------- ULID ----------
test("ulid: spec example, ordering, decoding, validation", async () => {
  const u = await lib("ulid");
  assert.equal(u.encodeTime(1469918176385), "01ARYZ6S41");            // the ULID README's example timestamp
  // independent cross-check: base32hex digits (Node's toString(32)) translated to Crockford's alphabet
  const hexToCrockford = s => [...s].map(ch => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"["0123456789abcdefghijklmnopqrstuv".indexOf(ch)]).join("");
  for (const ms of [0, 1, 31, 32, 1469918176385, 1700000000000, 2 ** 48 - 1, 281474976710655 - 12345]) assert.equal(u.encodeTime(ms), hexToCrockford(ms.toString(32).padStart(10, "0")), "time " + ms);
  assert.equal(u.encodeTime(0), "0000000000"); assert.equal(u.encodeTime(2 ** 48 - 1), "7ZZZZZZZZZ");
  assert.equal(u.encodeRandom(new Uint8Array(10)), "0000000000000000"); assert.equal(u.encodeRandom(new Uint8Array(10).fill(255)), "ZZZZZZZZZZZZZZZZ");
  assert.equal(u.ulid(1469918176385, a => a.fill(0)), "01ARYZ6S410000000000000000");
  assert.match(u.ulid(), /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  assert.ok(u.ulid(1000, a => a.fill(255)) < u.ulid(1001, a => a.fill(0)));        // sorts by time first
  const d = u.decodeUlid("01aryz6s410000000000000000"); assert.deepEqual([d.timestamp, d.iso], [1469918176385, "2016-07-30T22:36:16.385Z"]);   // lower case accepted
  for (const ms of [0, 1469918176385, 1700000000000, 2 ** 48 - 1]) assert.equal(u.decodeUlid(u.ulid(ms, a => a.fill(7))).timestamp, ms);   // decode inverts encode
  for (const bad of ["", "01ARZ3NDEK", "81ARZ3NDEK0000000000000000", "01ARZ3NDEI0000000000000000", "01ARZ3NDEK000000000000000U"]) assert.throws(() => u.decodeUlid(bad), /valid ULID/, bad);
  assert.throws(() => u.encodeTime(-1), /between/); assert.throws(() => u.encodeTime(1.5), /whole/); assert.throws(() => u.encodeTime(2 ** 48), /between/);
});

// ---------- lorem ----------
test("lorem: deterministic with a seed, units, limits", async () => {
  const l = await lib("lorem"), mk = () => l.mulberry32(42);
  assert.equal(l.lorem({ unit: "words", count: 5 }, mk()), "lorem ipsum dolor sit amet");
  assert.equal(l.lorem({ unit: "words", count: 3, classicStart: false }, mk()).split(" ").length, 3);
  const s = l.lorem({ unit: "sentences", count: 4 }, mk());
  assert.ok(s.startsWith("Lorem ipsum dolor sit amet, consectetur adipiscing elit.")); assert.equal(s.match(/\./g).length, 4);
  const p = l.lorem({ unit: "paragraphs", count: 3 }, mk());
  assert.equal(p.split("\n\n").length, 3); assert.ok(p.startsWith("Lorem ipsum"));
  assert.equal(l.lorem({ unit: "paragraphs", count: 3 }, mk()), p);                  // same seed, same text
  assert.notEqual(l.lorem({ unit: "paragraphs", count: 3 }, l.mulberry32(43)), p);
  assert.ok(!l.lorem({ unit: "sentences", count: 2, classicStart: false }, mk()).startsWith("Lorem ipsum dolor"));
  assert.ok(/^[A-Z]/.test(l.lorem({ unit: "sentences", count: 1, classicStart: false }, mk())));
  assert.throws(() => l.lorem({ count: 0 }), /between/); assert.throws(() => l.lorem({ count: 1001 }), /between/); assert.throws(() => l.lorem({ unit: "pages" }), /Unit/);
});

// ---------- chmod ----------
test("chmod: octal, symbolic, special bits, round trips, errors", async () => {
  const c = await lib("chmod");
  const cases = { 755: "rwxr-xr-x", 644: "rw-r--r--", 600: "rw-------", 777: "rwxrwxrwx", "000": "---------", 4755: "rwsr-xr-x", 2755: "rwxr-sr-x", 1777: "rwxrwxrwt", 4644: "rwSr--r--", 1666: "rw-rw-rwT", 7777: "rwsrwsrwt" };
  for (const [oct, sym] of Object.entries(cases)) {
    assert.equal(c.toSymbolic(c.fromOctal(String(oct))), sym, oct);
    assert.equal(c.toOctal(c.fromSymbolic(sym)), String(oct).replace(/^0+(?=\d{3}$)/, ""), sym);
  }
  assert.equal(c.toOctal(c.fromOctal("0644")), "644"); assert.equal(c.toOctal(c.fromOctal("755")), "755");
  assert.deepEqual(c.fromSymbolic("-rwxr-xr--").other, { r: true, w: false, x: false });   // `ls -l` style with the type character
  assert.equal(c.toOctal(c.fromSymbolic("drwxrwxrwt")), "1777");
  assert.match(c.describe(c.fromOctal("4750")), /owner: read, write, execute; group: read, execute; other: no access; setuid/);
  for (const bad of ["", "78", "8", "12345", "abc", "75"]) if (bad !== "75") assert.throws(() => c.fromOctal(bad), /octal/, bad);
  for (const bad of ["rwxrwx", "rwxrwxrwxx", "rwxrwxrwa", "rwxrwxrwS", "xwxrwxrwx"]) assert.throws(() => c.fromSymbolic(bad), undefined, bad);
});

// ---------- entities / escapes ----------
test("entities and string escapes", async () => {
  const e = await lib("entities");
  assert.equal(e.htmlEncode(`<a href="x">Tom & 'Jerry'</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;");
  assert.equal(e.htmlEncode("é✓😀", { all: true }), "&#233;&#10003;&#128512;"); assert.equal(e.htmlEncode("é"), "é");
  assert.equal(e.htmlDecode("&lt;b&gt; &amp;amp; &copy; &#65;&#x42; &eur; &#xD800; &hellip;"), "<b> &amp; © AB &eur; &#xD800; …");   // unknown/invalid references untouched
  assert.equal(e.htmlDecode(e.htmlEncode(`<&>"'`)), `<&>"'`);
  assert.equal(e.jsEscape(`a"b${BS}c\n\t\u0001é😀`), `a${BS}"b${BS}${BS}c${BS}n${BS}t${BS}u0001é😀`);
  assert.equal(e.jsEscape("é😀", { ascii: true }), `${BS}u00e9${BS}u{1f600}`);
  assert.equal(e.jsEscape(`it's`, { quote: "'" }), `it${BS}'s`);
  assert.equal(e.jsUnescape(`a${BS}nb${BS}u00e9${BS}u{1F600}${BS}x41${BS}"${BS}${BS}`), `a\nbé😀A"${BS}`);
  assert.throws(() => e.jsUnescape(`${BS}u{110000}`), /Invalid code point/);
  const s = `line1\nTab\t"quoted" ${BS} é😀`;
  assert.equal(e.jsUnescape(e.jsEscape(s)), s); assert.equal(e.jsonUnescape(e.jsonEscape(s)), s);
  assert.equal(e.jsonEscape('a"b\n'), `a${BS}"b${BS}n`); assert.throws(() => e.jsonUnescape('bad"quote'), /valid JSON string/);
  assert.equal(e.sqlEscape("O'Brien"), "O''Brien");
});

// ---------- text encodings ----------
test("text <-> bytes, code points, NATO", async () => {
  const t = await lib("textenc");
  assert.equal(t.textToBytes("Hi", 2), "01001000 01101001"); assert.equal(t.textToBytes("Hi", 16), "48 69"); assert.equal(t.textToBytes("Hi", 10), "072 105"); assert.equal(t.textToBytes("Hi", 8), "110 151");
  assert.equal(t.textToBytes("é", 16), "c3 a9"); assert.equal(t.textToBytes("😀", 16, ""), "f09f9880");
  for (const base of [2, 8, 10, 16]) assert.equal(t.bytesToText(t.textToBytes("Héllo 😀", base), base), "Héllo 😀", "base " + base);
  assert.equal(t.bytesToText("48656c6c6f", 16), "Hello"); assert.equal(t.bytesToText("0x48, 0x69", 16), "Hi"); assert.equal(t.bytesToText("0100100001101001", 2), "Hi");
  assert.throws(() => t.bytesToText("zz", 16), /not a valid base-16/); assert.throws(() => t.bytesToText("256", 10), /larger than one byte/); assert.throws(() => t.bytesToText("c3", 16), /not valid UTF-8/); assert.throws(() => t.textToBytes("x", 3), /Base/);
  const cp = t.codePoints("a😀");
  assert.deepEqual(cp.map(c => [c.notation, c.utf8, c.utf16]), [["U+0061", "61", "0061"], ["U+1F600", "f0 9f 98 80", "d83d de00"]]);
  assert.equal(cp[1].escape, BS + "u{1f600}");
  assert.equal(t.toNato("Abc 12!"), "Alfa Bravo Charlie / One Two !"); assert.equal(t.toNato("Zoë"), "Zulu Oscar Echo");
});

// ---------- units ----------
test("roman numerals, percentages, temperatures, unit conversions", async () => {
  const u = await lib("units");
  for (const [n, r] of [[1, "I"], [4, "IV"], [9, "IX"], [14, "XIV"], [40, "XL"], [90, "XC"], [400, "CD"], [1994, "MCMXCIV"], [2026, "MMXXVI"], [3999, "MMMCMXCIX"]]) { assert.equal(u.toRoman(n), r); assert.equal(u.fromRoman(r), n); assert.equal(u.fromRoman(r.toLowerCase()), n); }
  for (let n = 1; n <= 3999; n++) assert.equal(u.fromRoman(u.toRoman(n)), n);       // every value round-trips
  for (const bad of ["", "IIII", "VX", "IC", "MMMM", "ABC", "IVI", "XIIII"]) assert.throws(() => u.fromRoman(bad), undefined, bad);
  assert.throws(() => u.toRoman(0), /1 to 3999`?/); assert.throws(() => u.toRoman(4000), /1 to 3999/); assert.throws(() => u.toRoman(1.5), /1 to 3999/);
  assert.equal(u.percentOf(15, 200), 30); assert.equal(u.whatPercent(30, 200), 15); assert.equal(u.percentChange(80, 100), 25); assert.equal(u.percentChange(100, 80), -20); assert.equal(u.percentChange(-50, -25), 50);
  assert.throws(() => u.whatPercent(1, 0), /zero/); assert.throws(() => u.percentChange(0, 5), /zero/);
  assert.equal(u.temperature(0, "C", "F"), 32); assert.equal(u.temperature(100, "C", "F"), 212); assert.equal(u.temperature(-40, "C", "F"), -40); assert.equal(u.tidy(u.temperature(0, "K", "C")), -273.15);
  assert.equal(u.tidy(u.temperature(98.6, "F", "C")), 37); assert.throws(() => u.temperature(-300, "C", "K"), /absolute zero/); assert.throws(() => u.temperature(1, "X", "C"), /C, F or K/);
  const cv = (v, a, b, k) => u.tidy(u.convertUnit(v, a, b, k));
  assert.equal(cv(1, "mi", "m", "length"), 1609.344); assert.equal(cv(1, "in", "mm", "length"), 25.4); assert.equal(cv(1, "nmi", "km", "length"), 1.852); assert.equal(cv(12, "in", "ft", "length"), 1);
  assert.equal(cv(1, "lb", "kg", "mass"), 0.45359237); assert.equal(cv(16, "oz", "lb", "mass"), 1); assert.equal(cv(1, "st", "lb", "mass"), 14);
  assert.equal(cv(1, "GiB", "B", "data"), 1073741824); assert.equal(cv(1, "GB", "MB", "data"), 1000); assert.equal(cv(1, "KiB", "B", "data"), 1024); assert.equal(cv(8, "bit", "B", "data"), 1);
  assert.equal(cv(1, "wk", "h", "time"), 168); assert.equal(cv(90, "min", "h", "time"), 1.5);
  assert.throws(() => u.convertUnit(1, "m", "kg", "length"), /Units for length/); assert.throws(() => u.convertUnit(1, "m", "m", "speed"), /Unknown kind/);
  assert.equal(u.tidy(0.1 + 0.2), 0.3);
});

// ---------- validators ----------
test("IBAN, email normalisation, Basic auth", async () => {
  const v = await lib("validators");
  for (const ok of ["GB82 WEST 1234 5698 7654 32", "DE89 3704 0044 0532 0130 00", "FR14 2004 1010 0505 0001 3M02 606", "NO93 8601 1117 947", "NL91 ABNA 0417 1643 00",
    "ES91 2100 0418 4502 0005 1332", "CH93 0076 2011 6238 5295 7", "IT60 X054 2811 1010 0000 0123 456", "SE45 5000 0000 0583 9825 7466", "BE68 5390 0754 7034", "gb82west12345698765432"]) {
    const r = v.validateIban(ok); assert.equal(r.valid, true, ok); assert.equal(r.lengthChecked, true);
  }
  assert.equal(v.validateIban("GB82 WEST 1234 5698 7654 32").formatted, "GB82 WEST 1234 5698 7654 32");
  assert.match(v.validateIban("GB82 WEST 1234 5698 7654 33").reason, /check digits/);        // one digit off
  assert.match(v.validateIban("GB82 WEST 1234 5698 7654 3").reason, /22 characters/); assert.match(v.validateIban("DE89").reason, /characters|2 letters/); assert.match(v.validateIban("12345").reason, /2 letters/);
  assert.equal(v.validateIban("GB82WEST12345698765432" + "0").valid, false);
  assert.equal(v.normalizeEmail("  John.Doe+news@GMail.com "), "johndoe@gmail.com"); assert.equal(v.normalizeEmail("a.b+x@googlemail.com"), "ab@gmail.com");
  assert.equal(v.normalizeEmail("A.B+tag@Example.COM"), "a.b@example.com"); assert.equal(v.normalizeEmail("A.B+tag@Example.COM", { lowerLocal: false, stripPlus: false }), "A.B+tag@example.com");
  assert.equal(v.normalizeEmail("a.b@gmail.com", { gmailDots: false }), "a.b@gmail.com");
  for (const bad of ["", "nope", "a@", "@b.com", "a b@c.com", "a@b", "a@@b.com", "+x@gmail.com", "a@-b.com"]) assert.throws(() => v.normalizeEmail(bad), undefined, bad);
  assert.equal(v.basicAuthHeader("Aladdin", "open sesame"), "Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==");    // RFC 7617 example
  assert.equal(v.basicAuthHeader("user", "pä:ss"), "Authorization: Basic " + Buffer.from("user:pä:ss").toString("base64"));   // UTF-8, colon allowed in the password
  assert.throws(() => v.basicAuthHeader("a:b", "x"), /cannot contain ':'/);
  assert.deepEqual(v.parseBasicAuth("Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ=="), { user: "Aladdin", password: "open sesame" });
  assert.deepEqual(v.parseBasicAuth(v.basicAuthHeader("u", "pä:ss")), { user: "u", password: "pä:ss" });
  for (const bad of ["Bearer abc", "Basic !!!", "Basic " + Buffer.from("nocolon").toString("base64"), "Basic " + Buffer.from([0xff, 0x3a, 0x41]).toString("base64")]) assert.throws(() => v.parseBasicAuth(bad), undefined, bad);
});

// ---------- keys ----------
test("key pairs: PEM structure, re-importable, sign/verify round trip", async () => {
  const k = await lib("keys");
  for (const kind of ["ecdsa-p256", "rsa-2048"]) {
    const pair = await k.generateKeyPair(kind);
    assert.match(pair.publicPem, /^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+-----END PUBLIC KEY-----\n$/); assert.match(pair.privatePem, /^-----BEGIN PRIVATE KEY-----\n/);
    assert.ok(pair.publicPem.split("\n").every(l => l.length <= 64 || l.startsWith("-----")));
    assert.match(pair.fingerprint, /^([0-9a-f]{2}:){31}[0-9a-f]{2}$/);
    const der = pem => Buffer.from(pem.split("\n").filter(l => !l.startsWith("-----")).join(""), "base64");
    const alg = kind === "rsa-2048" ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } : { name: "ECDSA", namedCurve: "P-256" };
    const priv = await crypto.subtle.importKey("pkcs8", der(pair.privatePem), alg, false, ["sign"]), pub = await crypto.subtle.importKey("spki", der(pair.publicPem), alg, false, ["verify"]);
    const sigAlg = kind === "rsa-2048" ? "RSASSA-PKCS1-v1_5" : { name: "ECDSA", hash: "SHA-256" }, msg = new TextEncoder().encode("hello");
    const sig = await crypto.subtle.sign(sigAlg, priv, msg);
    assert.equal(await crypto.subtle.verify(sigAlg, pub, sig, msg), true); assert.equal(await crypto.subtle.verify(sigAlg, pub, sig, new TextEncoder().encode("hellO")), false);
    assert.notEqual((await k.generateKeyPair(kind)).fingerprint, pair.fingerprint);   // fresh randomness every time
  }
  await assert.rejects(() => k.generateKeyPair("dsa-512"), /Unknown key type/);
  assert.equal(k.pem("X", new Uint8Array(100).buffer).split("\n")[1].length, 64);
});

// ---------- passphrase encryption ----------
test("text encryption: round trip, tamper/wrong-password detection, format and limits", async () => {
  const x = await lib("encrypt"), fast = { iterations: 100_000 };
  const token = await x.encryptText("Hemmelig melding ✓ 😀", "correct horse", fast);
  assert.match(token, /^hx1\.100000\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{20,}$/);
  assert.equal(await x.decryptText(token, "correct horse"), "Hemmelig melding ✓ 😀");
  assert.equal(await x.decryptText(await x.encryptText("", "pw", fast), "pw"), "");
  assert.notEqual(await x.encryptText("same", "pw", fast), await x.encryptText("same", "pw", fast));      // random salt and IV
  await assert.rejects(() => x.decryptText(token, "wrong"), /Wrong passphrase, or the text was modified/);
  const parts = token.split("."), flip = s => s.slice(0, -2) + (s.endsWith("AA") ? "BB" : "AA");
  await assert.rejects(() => x.decryptText([...parts.slice(0, 4), flip(parts[4])].join("."), "correct horse"), /modified/);            // ciphertext tampered
  await assert.rejects(() => x.decryptText([parts[0], parts[1], flip(parts[2]), parts[3], parts[4]].join("."), "correct horse"), /modified/); // salt tampered
  await assert.rejects(() => x.decryptText(["hx1", "100001", ...parts.slice(2)].join("."), "correct horse"), /modified/);                 // iteration count is bound to the key
  for (const [bad, msg] of [["hello", /not text encrypted/], ["hx2.100000.a.b.c", /not text encrypted/], ["hx1.99.a.b.c", /outside the accepted range/], ["hx1.999999999.a.b.c", /outside the accepted range/],
    ["hx1.100000.!!.b.c", /damaged/], ["hx1.100000.AAAA.AAAA.AAAA", /damaged/]]) await assert.rejects(() => x.decryptText(bad, "pw"), msg, bad);
  await assert.rejects(() => x.encryptText("x", "", fast), /Enter a passphrase/); await assert.rejects(() => x.encryptText("x", "pw", { iterations: 10 }), /Iterations/);
  await assert.rejects(() => x.decryptText(token, ""), /Enter the passphrase/);
  assert.equal(x.DEFAULT_ITERATIONS, 600000);
});
