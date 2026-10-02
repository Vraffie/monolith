// Read a .zip in the browser (or Node 18+): stored and deflated entries, via the platform's DecompressionStream. Nothing is uploaded.
const MAX_ENTRIES = 5000, MAX_TOTAL = 256 * 1024 * 1024;
const td = new TextDecoder("utf-8");
const CRC = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

async function inflate(bytes) {
  const out = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Returns Map(path -> Uint8Array) for every file entry. Throws Error with a readable message on anything unsupported or damaged. */
export async function readZip(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("This is not a zip file (no end-of-archive record).");
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  if (count > MAX_ENTRIES) throw new Error(`The zip has ${count} entries; the limit is ${MAX_ENTRIES}.`);
  const files = new Map(); let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > b.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error("The zip's directory is damaged.");
    const crc = dv.getUint32(p + 16, true), flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = td.decode(b.subarray(p + 46, p + 46 + nlen)); p += 46 + nlen + elen + clen;
    if (name.endsWith("/")) continue;
    if (flags & 1) throw new Error(`"${name}" is encrypted; encrypted zips are not supported.`);
    total += usize; if (total > MAX_TOTAL) throw new Error("The zip expands to more than 256 MB; refusing to open it.");
    if (off + 30 > b.length || dv.getUint32(off, true) !== 0x04034b50) throw new Error(`The entry "${name}" is damaged.`);
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), raw = b.subarray(start, start + csize);
    if (raw.length !== csize) throw new Error(`The entry "${name}" is truncated.`);
    let data;
    if (method === 0) data = raw; else if (method === 8) { try { data = await inflate(raw); } catch { throw new Error(`The entry "${name}" could not be unpacked (damaged data).`); } } else throw new Error(`"${name}" uses compression method ${method}, which is not supported.`);
    if (data.length !== usize) throw new Error(`The entry "${name}" has the wrong size after unpacking.`);
    if (crc32(data) !== crc) throw new Error(`The entry "${name}" is damaged (checksum mismatch).`);
    files.set(name.replace(/\\/g, "/"), data);
  }
  return files;
}

export const decodeText = bytes => td.decode(bytes).replace(/^﻿/, "");
