/**
 * Find and remove hidden metadata (EXIF/GPS, XMP, comments, text chunks) from JPEG, PNG and WebP files by editing the file's
 * structure directly. Nothing is re-encoded, so the pixels are bit-for-bit unchanged. Hostile or truncated files raise an Error.
 */
const MAX_BYTES = 200 * 1024 * 1024;
const td = new TextDecoder("utf-8", { fatal: false });
const fourcc = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const fail = msg => { throw new Error(msg); };
const concat = parts => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

export function detectFormat(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && u32(b, 0) === 0x89504e47 && u32(b, 4) === 0x0d0a1a0a) return "png";
  if (b.length >= 12 && fourcc(b, 0) === "RIFF" && fourcc(b, 8) === "WEBP") return "webp";
  if (b.length >= 6 && fourcc(b, 0).startsWith("GIF8")) return "gif";
  return null;
}

// ---- EXIF / TIFF -------------------------------------------------------------------------------
const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

/** Parse a TIFF block (the payload of an EXIF segment). Invalid pointers are skipped, never followed out of bounds. */
export function parseTiff(b) {
  if (b.length < 8) return null;
  const le = b[0] === 0x49 && b[1] === 0x49;
  if (!le && !(b[0] === 0x4d && b[1] === 0x4d)) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const g16 = o => dv.getUint16(o, le), g32 = o => dv.getUint32(o, le);
  if (g16(2) !== 42) return null;
  const readIfd = off => {
    const tags = {};
    if (off + 2 > b.length) return { tags, next: 0 };
    const n = Math.min(g16(off), 500);
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      if (e + 12 > b.length) break;
      const tag = g16(e), type = g16(e + 2), count = g32(e + 4), size = (TYPE_SIZE[type] || 0) * count;
      if (!size || count > 1e6) continue;
      const at = size <= 4 ? e + 8 : g32(e + 8);
      if (at + size > b.length) continue;
      let v;
      if (type === 2) v = td.decode(b.subarray(at, at + size)).replace(/\0.*$/s, "").trim();
      else if (type === 3) v = Array.from({ length: count }, (_, k) => g16(at + k * 2));
      else if (type === 4) v = Array.from({ length: count }, (_, k) => g32(at + k * 4));
      else if (type === 5) v = Array.from({ length: Math.min(count, 8) }, (_, k) => [g32(at + k * 8), g32(at + k * 8 + 4)]);
      else continue;
      tags[tag] = v;
    }
    const nextAt = off + 2 + n * 12;
    return { tags, next: nextAt + 4 <= b.length ? g32(nextAt) : 0 };
  };
  const ifd0 = readIfd(g32(4)), exif = ifd0.tags[0x8769] ? readIfd(ifd0.tags[0x8769][0]).tags : {}, gps = ifd0.tags[0x8825] ? readIfd(ifd0.tags[0x8825][0]).tags : {};
  const ifd1 = ifd0.next ? readIfd(ifd0.next).tags : {};
  const deg = (r, ref) => { if (!r || r.length < 3 || r.some(x => !x[1])) return null; const v = r[0][0] / r[0][1] + r[1][0] / r[1][1] / 60 + r[2][0] / r[2][1] / 3600; return ref === "S" || ref === "W" ? -v : v; };
  const lat = deg(gps[2], gps[1]), lon = deg(gps[4], gps[3]);
  return {
    make: ifd0.tags[0x010f] || "", model: ifd0.tags[0x0110] || "", software: ifd0.tags[0x0131] || "", artist: ifd0.tags[0x013b] || "", copyright: ifd0.tags[0x8298] || "",
    dateTime: exif[0x9003] || ifd0.tags[0x0132] || "", orientation: ifd0.tags[0x0112] ? ifd0.tags[0x0112][0] : 1,
    gps: lat !== null && lon !== null ? { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 } : null, hasThumbnail: 0x0201 in ifd1,
  };
}

// ---- JPEG --------------------------------------------------------------------------------------
const JPEG_NAMES = { 0xe0: "JFIF header", 0xe1: "EXIF/XMP", 0xe2: "ICC colour profile / MPF", 0xed: "Photoshop / IPTC", 0xee: "Adobe", 0xfe: "Comment" };

/** Split a JPEG into header segments (before the first scan) and an opaque tail (scan data onward). */
export function parseJpeg(b) {
  if (detectFormat(b) !== "jpeg") fail("Not a JPEG file");
  const segs = [];
  let o = 2;
  for (;;) {
    while (o < b.length && b[o] === 0xff && b[o + 1] === 0xff) o++;           // fill bytes
    if (o + 2 > b.length || b[o] !== 0xff) fail("Damaged JPEG: expected a marker");
    const m = b[o + 1];
    if (m === 0xd9) return { segs, tail: o };                                  // EOI before any scan
    if (m === 0xda) return { segs, tail: o };                                  // start of scan: the rest is image data
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { o += 2; continue; }          // markers without a length
    if (o + 4 > b.length) fail("Damaged JPEG: truncated segment header");
    const len = u16(b, o + 2);
    if (len < 2 || o + 2 + len > b.length) fail("Damaged JPEG: a segment runs past the end of the file");
    segs.push({ marker: m, start: o, end: o + 2 + len, payload: b.subarray(o + 4, o + 2 + len) });
    o += 2 + len;
  }
}

const isIcc = s => s.marker === 0xe2 && td.decode(s.payload.subarray(0, 11)) === "ICC_PROFILE";
const isExif = s => s.marker === 0xe1 && td.decode(s.payload.subarray(0, 4)) === "Exif";
const isXmp = s => s.marker === 0xe1 && td.decode(s.payload.subarray(0, 29)).startsWith("http://ns.adobe.com/xap/1.0/");
const jpegLabel = s => (isExif(s) ? "EXIF (camera, date, GPS, thumbnail)" : isXmp(s) ? "XMP metadata" : s.marker === 0xe2 ? (isIcc(s) ? "ICC colour profile" : "MPF / extra data") : JPEG_NAMES[s.marker] || `APP${s.marker - 0xe0}`);
const jpegRemovable = (s, keepIcc) => (s.marker === 0xfe) || (s.marker >= 0xe1 && s.marker <= 0xef && s.marker !== 0xee && !(keepIcc && isIcc(s)));

function jpegSize(b, segs) {
  // dimensions live in a start-of-frame segment, which our header scan has skipped past: find it directly
  for (let o = 2; o + 9 < b.length;) {
    if (b[o] !== 0xff) { o++; continue; }
    const m = b[o + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { height: u16(b, o + 5), width: u16(b, o + 7) };
    if (m === 0xda || m === 0xd9) break;
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { o += m === 0xff ? 1 : 2; continue; }
    o += 2 + u16(b, o + 2);
  }
  return {};
}

// ---- PNG ---------------------------------------------------------------------------------------
const PNG_METADATA = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);
function* pngChunks(b) {
  if (detectFormat(b) !== "png") fail("Not a PNG file");
  let o = 8;
  while (o < b.length) {
    if (o + 12 > b.length) fail("Damaged PNG: truncated chunk");
    const len = u32(b, o);
    if (len > 0x7fffffff || o + 12 + len > b.length) fail("Damaged PNG: a chunk runs past the end of the file");
    yield { type: fourcc(b, o + 4), start: o, end: o + 12 + len, data: b.subarray(o + 8, o + 8 + len) };
    o += 12 + len;
  }
}
const pngLabel = c => {
  if (c.type === "tEXt" || c.type === "iTXt") { const t = td.decode(c.data.subarray(0, 80)).replace(/\0/g, ": ").replace(/[^\x20-\x7e -￿]/g, ""); return `Text “${t.slice(0, 60)}”`; }
  return { zTXt: "Compressed text", eXIf: "EXIF (camera, date, GPS)", tIME: "Last-modified time" }[c.type] || c.type;
};

// ---- WebP --------------------------------------------------------------------------------------
function webpChunks(b) {
  if (detectFormat(b) !== "webp") fail("Not a WebP file");
  const total = le32(b, 4) + 8;
  if (total > b.length) fail("Damaged WebP: the file is shorter than its header says");
  const out = [];
  for (let o = 12; o < total;) {
    if (o + 8 > total) fail("Damaged WebP: truncated chunk");
    const size = le32(b, o + 4), end = o + 8 + size + (size & 1);
    if (end > total) fail("Damaged WebP: a chunk runs past the end of the file");
    out.push({ type: fourcc(b, o), start: o, end, data: b.subarray(o + 8, o + 8 + size) });
    o = end;
  }
  return out;
}
const WEBP_METADATA = new Set(["EXIF", "XMP "]);

function webpSize(chunks) {
  const v = chunks.find(c => c.type === "VP8X"), l = chunks.find(c => c.type === "VP8L"), k = chunks.find(c => c.type === "VP8 ");
  if (v && v.data.length >= 10) return { width: 1 + (v.data[4] | (v.data[5] << 8) | (v.data[6] << 16)), height: 1 + (v.data[7] | (v.data[8] << 8) | (v.data[9] << 16)) };
  if (l && l.data.length >= 5) { const bits = l.data[1] | (l.data[2] << 8) | (l.data[3] << 16) | (l.data[4] << 24); return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }; }
  if (k && k.data.length >= 10) return { width: (k.data[6] | (k.data[7] << 8)) & 0x3fff, height: (k.data[8] | (k.data[9] << 8)) & 0x3fff };
  return {};
}

// ---- public API --------------------------------------------------------------------------------
/** What is hidden in this file? {format, width, height, exif, items:[{label, bytes}]}; items are exactly what strip() would remove. */
export function inspect(bytes) {
  if (bytes.length > MAX_BYTES) fail("File is too large (limit 200 MB)");
  const format = detectFormat(bytes);
  if (!format) fail("Unsupported file: choose a JPEG, PNG or WebP image");
  const items = []; let exif = null, size = {};
  if (format === "jpeg") {
    const { segs } = parseJpeg(bytes);
    for (const s of segs) {
      if (jpegRemovable(s, true)) items.push({ label: jpegLabel(s), bytes: s.end - s.start });
      if (isExif(s)) exif = parseTiff(s.payload.subarray(6));
    }
    size = jpegSize(bytes);
  } else if (format === "png") {
    const chunks = [...pngChunks(bytes)], hdr = chunks.find(c => c.type === "IHDR");
    for (const c of chunks) if (PNG_METADATA.has(c.type)) { items.push({ label: pngLabel(c), bytes: c.end - c.start }); if (c.type === "eXIf") exif = parseTiff(c.data); }
    if (hdr) size = { width: u32(hdr.data, 0), height: u32(hdr.data, 4) };
  } else if (format === "webp") {
    const chunks = webpChunks(bytes);
    for (const c of chunks) if (WEBP_METADATA.has(c.type)) {
      items.push({ label: c.type === "EXIF" ? "EXIF (camera, date, GPS)" : "XMP metadata", bytes: c.end - c.start });
      if (c.type === "EXIF") exif = parseTiff(td.decode(c.data.subarray(0, 4)) === "Exif" ? c.data.subarray(6) : c.data);
    }
    size = webpSize(chunks);
  } else return { format, ...size, exif: null, items: [], note: "GIF comments and extensions are not parsed; use the converter to re-encode the image instead." };
  return { format, ...size, exif, items };
}

/** Remove metadata without re-encoding. Returns {bytes, removed:[{label, bytes}], saved}. */
export function strip(bytes, { keepIcc = true } = {}) {
  const info = inspect(bytes);
  if (info.format === "gif") fail(info.note);
  const removed = [];
  let out;
  if (info.format === "jpeg") {
    const { segs, tail } = parseJpeg(bytes), parts = [bytes.subarray(0, 2)];
    let at = 2;
    for (const s of segs) {
      if (jpegRemovable(s, keepIcc)) { parts.push(bytes.subarray(at, s.start)); removed.push({ label: jpegLabel(s), bytes: s.end - s.start }); at = s.end; }
    }
    parts.push(bytes.subarray(at));
    out = concat(parts);
    void tail;
  } else if (info.format === "png") {
    const parts = [bytes.subarray(0, 8)];
    for (const c of pngChunks(bytes)) { if (PNG_METADATA.has(c.type)) removed.push({ label: pngLabel(c), bytes: c.end - c.start }); else parts.push(bytes.subarray(c.start, c.end)); }
    out = concat(parts);
  } else {
    const parts = [], chunks = webpChunks(bytes);
    for (const c of chunks) {
      if (WEBP_METADATA.has(c.type)) { removed.push({ label: c.type === "EXIF" ? "EXIF (camera, date, GPS)" : "XMP metadata", bytes: c.end - c.start }); continue; }
      if (c.type === "VP8X") { const copy = bytes.slice(c.start, c.end); copy[8] &= ~(0x08 | 0x04); parts.push(copy); }  // clear the "has EXIF" and "has XMP" flags
      else parts.push(bytes.subarray(c.start, c.end));
    }
    const body = concat(parts), head = new Uint8Array(12);
    head.set(bytes.subarray(0, 12)); const size = body.length + 4;
    head[4] = size & 255; head[5] = (size >> 8) & 255; head[6] = (size >> 16) & 255; head[7] = (size >>> 24) & 255;
    out = concat([head, body]);
  }
  return { bytes: out, removed, saved: bytes.length - out.length, exif: info.exif };
}
