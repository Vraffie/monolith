export function toDataUri(bytes, mime = "application/octet-stream") {
  if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mime)) throw new Error("That is not a valid MIME type");
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

/** Decode a data: URI (base64 or percent-encoded) into {mime, bytes}. */
export function parseDataUri(text) {
  const m = /^data:([^,;]*)((?:;[^,;]*)*),([\s\S]*)$/.exec(text.trim());
  if (!m) throw new Error("Not a data: URI (expected data:<type>;base64,<data>)");
  const mime = m[1] || "text/plain", params = m[2].split(";").filter(Boolean), base64 = params.includes("base64"), body = m[3];
  let bytes;
  try {
    if (base64) bytes = Uint8Array.from(atob(body.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    else bytes = new TextEncoder().encode(decodeURIComponent(body));
  } catch { throw new Error(base64 ? "The Base64 data is damaged" : "The percent-encoding is damaged"); }
  return { mime, bytes, base64 };
}

export const EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "text/plain": "txt", "application/json": "json", "application/pdf": "pdf" };
