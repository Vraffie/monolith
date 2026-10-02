export const ALGORITHMS = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];
const enc = new TextEncoder();

export const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

export async function digest(data, algorithm = "SHA-256") {
  if (!ALGORITHMS.includes(algorithm)) throw new Error("Unsupported algorithm " + algorithm);
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  return toHex(await crypto.subtle.digest(algorithm, bytes));
}

export async function hmac(key, data, algorithm = "SHA-256") {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: algorithm }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
