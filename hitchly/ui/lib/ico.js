/** Windows .ico container holding PNG images (supported since Windows Vista and by every browser). */
export function buildIco(images) {
  if (!images.length || images.length > 255) throw new Error("An ICO needs 1 to 255 images");
  const head = 6 + 16 * images.length, out = new Uint8Array(head + images.reduce((n, i) => n + i.png.length, 0)), dv = new DataView(out.buffer);
  dv.setUint16(2, 1, true); dv.setUint16(4, images.length, true);
  let offset = head;
  images.forEach((img, i) => {
    if (img.width < 1 || img.width > 256 || img.height < 1 || img.height > 256) throw new Error("ICO images must be 1-256 pixels");
    const e = 6 + 16 * i;
    out[e] = img.width === 256 ? 0 : img.width; out[e + 1] = img.height === 256 ? 0 : img.height;   // 0 means 256
    dv.setUint16(e + 4, 1, true); dv.setUint16(e + 6, 32, true); dv.setUint32(e + 8, img.png.length, true); dv.setUint32(e + 12, offset, true);
    out.set(img.png, offset); offset += img.png.length;
  });
  return out;
}

export function parseIco(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 6 || dv.getUint16(0, true) !== 0 || dv.getUint16(2, true) !== 1) throw new Error("Not an ICO file");
  return Array.from({ length: dv.getUint16(4, true) }, (_, i) => {
    const e = 6 + 16 * i, size = dv.getUint32(e + 8, true), off = dv.getUint32(e + 12, true);
    return { width: b[e] || 256, height: b[e + 1] || 256, bytes: b.subarray(off, off + size) };
  });
}
