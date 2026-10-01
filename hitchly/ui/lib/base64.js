const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });

export function bytesToBase64(bytes, { urlSafe = false, padding = true } = {}) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  let out = btoa(bin);
  if (urlSafe) out = out.replace(/\+/g, "-").replace(/\//g, "_");
  return padding ? out : out.replace(/=+$/, "");
}

export function base64ToBytes(text) {
  let s = text.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error("Not valid Base64: unexpected character");
  s = s.replace(/=+$/, "");
  if (s.length % 4 === 1) throw new Error("Not valid Base64: incomplete data");
  s += "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

export const encodeText = (text, opts) => bytesToBase64(enc.encode(text), opts);

export function decodeText(text) {
  try { return dec.decode(base64ToBytes(text)); }
  catch (e) {
    if (e instanceof TypeError) throw new Error("Decoded bytes are not valid UTF-8 text");
    throw e;
  }
}
