/**
 * Passphrase encryption: PBKDF2-SHA256 -> AES-256-GCM. Output: hx1.<iterations>.<salt>.<iv>.<ciphertext> (Base64URL parts).
 * This protects text you paste somewhere; it is not a replacement for a vetted file-encryption tool, and a weak passphrase is still weak.
 */
const enc = new TextEncoder(), dec = new TextDecoder();
export const DEFAULT_ITERATIONS = 600_000;  // OWASP guidance for PBKDF2-HMAC-SHA256
const MIN_ITER = 100_000, MAX_ITER = 2_000_000;  // a hostile token must not be able to demand hours of CPU

const b64u = bytes => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = s => { const t = s.replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(t + "=".repeat((4 - (t.length % 4)) % 4)), c => c.charCodeAt(0)); };

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptText(plain, password, { iterations = DEFAULT_ITERATIONS } = {}) {
  if (!password) throw new Error("Enter a passphrase");
  if (!Number.isInteger(iterations) || iterations < MIN_ITER || iterations > MAX_ITER) throw new Error(`Iterations must be between ${MIN_ITER} and ${MAX_ITER}`);
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)));
  return ["hx1", iterations, b64u(salt), b64u(iv), b64u(ct)].join(".");
}

export async function decryptText(token, password) {
  const p = token.trim().split(".");
  if (p.length !== 5 || p[0] !== "hx1") throw new Error("This is not text encrypted by this tool (expected hx1.…)");
  const iterations = Number(p[1]);
  if (!Number.isInteger(iterations) || iterations < MIN_ITER || iterations > MAX_ITER) throw new Error("The iteration count in this text is outside the accepted range");
  if (!password) throw new Error("Enter the passphrase");
  let salt, iv, ct;
  try { [salt, iv, ct] = [unb64u(p[2]), unb64u(p[3]), unb64u(p[4])]; } catch { throw new Error("The text is damaged (invalid Base64)"); }
  if (salt.length !== 16 || iv.length !== 12 || ct.length < 16) throw new Error("The text is damaged (wrong lengths)");
  try { return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await deriveKey(password, salt, iterations), ct)); }
  catch { throw new Error("Wrong passphrase, or the text was modified"); }
}
