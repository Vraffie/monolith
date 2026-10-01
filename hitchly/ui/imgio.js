// Shared plumbing for the image tools: everything stays in the browser (files are read with File.arrayBuffer, never uploaded).
export const fileBytes = async file => new Uint8Array(await file.arrayBuffer());

/** Decode to a bitmap. Browsers apply the EXIF orientation here, so the pixels match what people see. */
export async function loadBitmap(blob) {
  try { return await createImageBitmap(blob); } catch { throw new Error("This browser could not decode that image"); }
}

export function canvasFor(width, height) {
  const c = document.createElement("canvas");
  c.width = width; c.height = height;
  return c;
}

export const toBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error(`This browser cannot encode ${type}`))), type, quality));

export const humanSize = n => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);
