/** RFC 4226 HOTP / RFC 6238 TOTP, base32 (RFC 4648), and otpauth:// URIs. HMAC comes from the browser's WebCrypto. */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(text) {
  const s = text.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  if (!s) throw new Error("Enter the secret");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of s) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error(`'${ch}' is not a Base32 character (use A-Z and 2-7)`);
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Uint8Array.from(out);
}

export function base32Encode(bytes) {
  let out = "", bits = 0, value = 0;
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export const ALGORITHMS = { SHA1: "SHA-1", SHA256: "SHA-256", SHA512: "SHA-512" };

export async function hotp(keyBytes, counter, { digits = 6, algorithm = "SHA1" } = {}) {
  if (!ALGORITHMS[algorithm]) throw new Error("Algorithm must be SHA1, SHA256 or SHA512");
  if (!Number.isInteger(digits) || digits < 6 || digits > 10) throw new Error("Digits must be between 6 and 10");
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setBigUint64(0, BigInt(counter));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: ALGORITHMS[algorithm] }, false, ["sign"]);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export async function totp(keyBytes, unixSeconds = Date.now() / 1000, { period = 30, ...opts } = {}) {
  if (!Number.isInteger(period) || period < 1) throw new Error("Period must be a positive whole number of seconds");
  const counter = Math.floor(unixSeconds / period);
  return { code: await hotp(keyBytes, counter, opts), secondsLeft: period - (Math.floor(unixSeconds) % period) };
}

export function otpauthUri({ secret, account, issuer = "", algorithm = "SHA1", digits = 6, period = 30 }) {
  if (!account) throw new Error("Account name is required");
  base32Decode(secret);  // validates
  const label = (issuer ? encodeURIComponent(issuer) + ":" : "") + encodeURIComponent(account);
  const q = new URLSearchParams({ secret: secret.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "") });
  if (issuer) q.set("issuer", issuer);
  if (algorithm !== "SHA1") q.set("algorithm", algorithm);
  if (digits !== 6) q.set("digits", String(digits));
  if (period !== 30) q.set("period", String(period));
  return `otpauth://totp/${label}?${q.toString().replace(/\+/g, "%20")}`;
}

export function parseOtpauth(uri) {
  let u;
  try { u = new URL(uri.trim()); } catch { throw new Error("That is not an otpauth:// URI"); }
  if (u.protocol !== "otpauth:" || u.hostname !== "totp") throw new Error("Only otpauth://totp/ URIs are supported");
  const label = decodeURIComponent(u.pathname.slice(1)), colon = label.indexOf(":");
  const secret = u.searchParams.get("secret");
  if (!secret) throw new Error("The URI has no secret");
  return {
    secret, account: colon >= 0 ? label.slice(colon + 1) : label, issuer: u.searchParams.get("issuer") || (colon >= 0 ? label.slice(0, colon) : ""),
    algorithm: (u.searchParams.get("algorithm") || "SHA1").toUpperCase(), digits: +(u.searchParams.get("digits") || 6), period: +(u.searchParams.get("period") || 30),
  };
}
