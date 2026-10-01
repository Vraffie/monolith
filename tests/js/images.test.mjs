import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const lib = n => import(`../../hitchly/ui/lib/${n}.js`);
const fx = name => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const indexOfSeq = (hay, needle, from = 0) => { outer: for (let i = from; i <= hay.length - needle.length; i++) { for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer; return i; } return -1; };
const has = (hay, text) => indexOfSeq(hay, new TextEncoder().encode(text)) >= 0;
const sosTail = b => { for (let i = 2; i < b.length - 1; i++) if (b[i] === 0xff && b[i + 1] === 0xda) return b.subarray(i); throw new Error("no SOS"); };

test("jpeg: finds everything hidden in the file", async () => {
  const m = await lib("imgmeta"), info = m.inspect(fx("photo-gps.jpg"));
  assert.equal(info.format, "jpeg"); assert.deepEqual([info.width, info.height], [64, 48]);
  assert.deepEqual(info.exif && { make: info.exif.make, model: info.exif.model, software: info.exif.software, dateTime: info.exif.dateTime, orientation: info.exif.orientation },
    { make: "ACME", model: "Cam 9", software: "Editor 1.2", dateTime: "2024:05:17 14:03:22", orientation: 6 });
  assert.ok(Math.abs(info.exif.gps.lat - 59.9139) < 1e-4 && Math.abs(info.exif.gps.lon - 10.7522) < 1e-4, JSON.stringify(info.exif.gps));
  const labels = info.items.map(i => i.label).join(" | ");
  assert.match(labels, /EXIF/); assert.match(labels, /XMP/); assert.match(labels, /Photoshop/); assert.match(labels, /Comment/);
  const plain = m.inspect(fx("plain.jpg")); assert.deepEqual([plain.items.length, plain.exif, plain.width, plain.height], [0, null, 64, 48]);
});

test("jpeg: lossless strip removes the metadata and leaves the image data byte-identical", async () => {
  const m = await lib("imgmeta"), src = fx("photo-gps.jpg"), r = m.strip(src);
  assert.ok(r.bytes.length < src.length && r.saved === src.length - r.bytes.length);
  for (const secret of ["ACME", "Cam 9", "Jane Doe", "secret note", "Exif", "Photoshop"]) { assert.ok(has(src, secret), "fixture should contain " + secret); assert.ok(!has(r.bytes, secret), "still present: " + secret); }
  assert.deepEqual([r.bytes[0], r.bytes[1], r.bytes[r.bytes.length - 2], r.bytes[r.bytes.length - 1]], [0xff, 0xd8, 0xff, 0xd9]);
  assert.ok(eq(sosTail(r.bytes), sosTail(src)), "scan data must be untouched");
  assert.ok(eq(sosTail(r.bytes), sosTail(fx("plain.jpg"))), "and identical to the same picture saved without metadata");
  const after = m.inspect(r.bytes); assert.deepEqual([after.items.length, after.exif, after.width, after.height], [0, null, 64, 48]);
  assert.equal(r.removed.length, 4); assert.equal(r.exif.orientation, 6);                    // caller can warn that rotation info was removed
  assert.ok(eq(m.strip(r.bytes).bytes, r.bytes), "stripping twice changes nothing");           // idempotent
  assert.ok(eq(m.strip(fx("plain.jpg")).bytes, fx("plain.jpg")), "a clean file is returned unchanged");
});

test("png: text chunks, EXIF and timestamps are removed; pixel data chunks are identical", async () => {
  const m = await lib("imgmeta"), src = fx("meta.png"), info = m.inspect(src);
  assert.deepEqual([info.format, info.width, info.height], ["png", 40, 30]);
  assert.match(info.items.map(i => i.label).join(" | "), /Author: Jane Doe/); assert.match(info.items.map(i => i.label).join(" | "), /Description/);
  assert.ok(info.items.some(i => /EXIF/.test(i.label)) && info.items.some(i => /Last-modified/.test(i.label)));
  assert.equal(info.exif.make, "ACME"); assert.ok(Math.abs(info.exif.gps.lon - 10.7522) < 1e-4);
  const r = m.strip(src);
  for (const secret of ["Jane Doe", "holiday photo", "ACME", "tIME", "eXIf", "tEXt", "iTXt"]) assert.ok(!has(r.bytes, secret), "still present: " + secret);
  const chunks = b => { const out = []; for (let o = 8; o < b.length;) { const len = new DataView(b.buffer, b.byteOffset).getUint32(o); out.push(new TextDecoder().decode(b.subarray(o + 4, o + 8)) + ":" + [...b.subarray(o + 8, o + 8 + len)].join(",")); o += 12 + len; } return out; };
  assert.deepEqual(chunks(r.bytes), chunks(src).filter(c => !/^(tEXt|iTXt|zTXt|eXIf|tIME):/.test(c)));      // exactly the other chunks, in order, byte for byte
  assert.equal(m.inspect(r.bytes).items.length, 0);
});

test("webp: EXIF and XMP chunks removed, flags cleared, container size fixed", async () => {
  const m = await lib("imgmeta"), src = fx("meta.webp"), info = m.inspect(src);
  assert.deepEqual([info.format, info.width, info.height], ["webp", 48, 32]);
  assert.ok(info.items.some(i => /EXIF/.test(i.label)) && info.items.some(i => /XMP/.test(i.label))); assert.equal(info.exif.model, "Cam 9");
  const r = m.strip(src);
  assert.ok(!has(r.bytes, "Jane Doe") && !has(r.bytes, "EXIF") && !has(r.bytes, "XMP "));
  assert.equal(new DataView(r.bytes.buffer, r.bytes.byteOffset).getUint32(4, true), r.bytes.length - 8);      // RIFF size matches the file
  const vp8x = indexOfSeq(r.bytes, new TextEncoder().encode("VP8X")); if (vp8x >= 0) assert.equal(r.bytes[vp8x + 8] & 0x0c, 0);
  const imageChunk = b => { const i = indexOfSeq(b, new TextEncoder().encode("VP8 ")); return i >= 0 ? b.subarray(i, i + 8 + new DataView(b.buffer, b.byteOffset).getUint32(i + 4, true)) : null; };
  if (imageChunk(src)) assert.ok(eq(imageChunk(r.bytes), imageChunk(src)));
  assert.equal(m.inspect(r.bytes).items.length, 0); assert.deepEqual([m.inspect(r.bytes).width, m.inspect(r.bytes).height], [48, 32]);
});

test("hostile, truncated and mutated files fail cleanly and quickly", async () => {
  const m = await lib("imgmeta");
  for (const bytes of [new Uint8Array(0), new Uint8Array([1, 2, 3, 4, 5])]) assert.throws(() => m.inspect(bytes), /Unsupported/);
  assert.throws(() => m.strip(new TextEncoder().encode("GIF89a.....")), /not parsed/); assert.throws(() => m.inspect(new Uint8Array([0xff, 0xd8, 0xff])), /Damaged JPEG/);
  const jpg = fx("photo-gps.jpg"); assert.throws(() => m.inspect(jpg.subarray(0, 40)), /Damaged JPEG/);
  const bogus = jpg.slice(); bogus[4] = 0xff; bogus[5] = 0xff; assert.throws(() => m.inspect(bogus), /Damaged JPEG/);   // a segment length pointing far past the end
  assert.throws(() => m.inspect(fx("meta.png").subarray(0, 30)), /Damaged PNG/); assert.throws(() => m.inspect(fx("meta.webp").subarray(0, 40)), /Damaged WebP/);
  let seed = 5; const rnd = n => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n, started = Date.now();
  for (const name of ["photo-gps.jpg", "meta.png", "meta.webp", "plain.jpg"]) for (let i = 0; i < 300; i++) {
    const b = fx(name).slice(), cut = rnd(4) === 0 ? rnd(b.length) : b.length;
    for (let k = 0; k < 1 + rnd(4); k++) b[rnd(b.length)] = rnd(256);
    try { assert.ok(m.strip(b.subarray(0, cut)).bytes instanceof Uint8Array); } catch (e) { assert.ok(e instanceof Error, "must throw an Error, got " + e); assert.ok(!(e instanceof TypeError), "unexpected TypeError: " + e.message); assert.ok(!(e instanceof RangeError), "unexpected RangeError: " + e.message); }
  }
  assert.ok(Date.now() - started < 8000, "fuzzing took too long: possible hang");
});

test("colour-blindness simulation: neutral colours are preserved, known behaviour of each type", async () => {
  const c = await lib("colorblind");
  for (const type of Object.keys(c.TYPES)) for (const v of [0, 64, 128, 200, 255]) assert.deepEqual(c.simulatePixel([v, v, v], type), [v, v, v], `${type} grey ${v}`);   // rows sum to 1: greys stay grey
  const red = c.simulatePixel([255, 0, 0], "protanopia"), green = c.simulatePixel([0, 255, 0], "protanopia");
  assert.ok(red[0] < 130 && red[1] > 30, "protanopes see red as dark olive: " + red);
  assert.ok(green[0] > 200, "green keeps a strong red channel (yellow-ish): " + green);
  const blueT = c.simulatePixel([0, 0, 255], "tritanopia"); assert.ok(blueT[2] < 255 && blueT[1] > 60, "tritanopes lose the blue/yellow axis: " + blueT);
  const g = c.simulatePixel([255, 0, 0], "achromatopsia"); assert.equal(g[0], g[1]); assert.equal(g[1], g[2]);
  for (let r = 0; r < 256; r += 51) for (let gg = 0; gg < 256; gg += 51) for (let b = 0; b < 256; b += 51) for (const t of Object.keys(c.TYPES)) assert.ok(c.simulatePixel([r, gg, b], t).every(x => Number.isInteger(x) && x >= 0 && x <= 255));
  const px = new Uint8ClampedArray([255, 0, 0, 77, 10, 20, 30, 255]); c.simulateImageData(px, "deuteranopia"); assert.equal(px[3], 77); assert.equal(px[7], 255);   // alpha untouched
  assert.throws(() => c.simulatePixel([1, 2, 3], "nope"), /Unknown/);
});

test("ico builder and zip writer produce files other tools accept", async () => {
  const { buildIco, parseIco } = await lib("ico"), { zip, crc32 } = await lib("zip");
  const pngs = [16, 32, 256].map(n => ({ width: n, height: n, png: Uint8Array.from({ length: 20 + n }, (_, i) => (i * 7 + n) & 255) }));
  const ico = buildIco(pngs), parsed = parseIco(ico);
  assert.deepEqual(parsed.map(p => [p.width, p.height]), [[16, 16], [32, 32], [256, 256]]); assert.ok(parsed.every((p, i) => eq(p.bytes, pngs[i].png)));
  assert.deepEqual([...ico.subarray(0, 6)], [0, 0, 1, 0, 3, 0]); assert.equal(ico[6 + 32], 0);          // 256 is stored as 0
  assert.throws(() => buildIco([]), /1 to 255/); assert.throws(() => buildIco([{ width: 300, height: 1, png: new Uint8Array(1) }]), /1-256/); assert.throws(() => parseIco(new Uint8Array(10)), /Not an ICO/);
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);                                  // the standard CRC-32 check value
  const files = [{ name: "a.txt", data: new TextEncoder().encode("hello") }, { name: "dir/ü.png", data: Uint8Array.from({ length: 5000 }, (_, i) => i & 255) }, { name: "empty.bin", data: new Uint8Array(0) }];
  const z = zip(files); assert.ok(eq(zip(files), z), "reproducible");
  const dir = mkdtempSync(path.join(tmpdir(), "zip-")), zf = path.join(dir, "t.zip"); writeFileSync(zf, z);
  const check = `import zipfile,sys,hashlib;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(sorted(z.namelist()),z.read('a.txt').decode(),hashlib.sha256(z.read('dir/ü.png')).hexdigest(),len(z.read('empty.bin')))`;
  const got = execFileSync("python3", ["-c", check, zf]).toString().trim();
  const want = `['a.txt', 'dir/ü.png', 'empty.bin'] hello ${(await import("node:crypto")).createHash("sha256").update(files[1].data).digest("hex")} 0`;
  assert.equal(got, want);
  assert.throws(() => zip([{ name: "../evil", data: new Uint8Array(1) }]), /Unsafe/); assert.throws(() => zip([{ name: "/abs", data: new Uint8Array(1) }]), /Unsafe/); assert.throws(() => zip([{ name: "a", data: new Uint8Array(1) }, { name: "a", data: new Uint8Array(1) }]), /Duplicate/);
});

test("data URIs: encode, decode, round trips, errors", async () => {
  const d = await lib("datauri");
  assert.equal(d.toDataUri(new TextEncoder().encode("hello"), "text/plain"), "data:text/plain;base64,aGVsbG8=");
  assert.throws(() => d.toDataUri(new Uint8Array(1), "bad type"), /MIME/);
  const big = Uint8Array.from({ length: 100000 }, (_, i) => i & 255), back = d.parseDataUri(d.toDataUri(big, "application/octet-stream"));
  assert.ok(eq(back.bytes, big)); assert.equal(back.mime, "application/octet-stream");
  assert.equal(new TextDecoder().decode(d.parseDataUri("data:,Hello%2C%20World!").bytes), "Hello, World!"); assert.equal(d.parseDataUri("data:,x").mime, "text/plain");
  assert.equal(new TextDecoder().decode(d.parseDataUri("data:text/plain;charset=utf-8;base64,w6Y=").bytes), "æ"); assert.equal(d.parseDataUri("data:image/png;base64,iVBO\nRw0K").base64, true);
  for (const bad of ["", "hello", "data:text/plain", "data:text/plain;base64,@@@", "data:,%E0%A4%A"]) assert.throws(() => d.parseDataUri(bad), undefined, bad);
  assert.equal(d.EXTENSIONS["image/png"], "png");
});
