/** Key pair generation with WebCrypto, exported as PEM (PKCS#8 private, SPKI public) with a SHA-256 fingerprint. */
const wrap = b64 => b64.match(/.{1,64}/g).join("\n");
const toB64 = buf => { let s = ""; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s); };
export const pem = (label, buf) => `-----BEGIN ${label}-----\n${wrap(toB64(buf))}\n-----END ${label}-----\n`;

export const KINDS = {
  "rsa-2048": { algorithm: { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, usages: ["sign", "verify"], label: "RSA 2048" },
  "rsa-3072": { algorithm: { name: "RSASSA-PKCS1-v1_5", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, usages: ["sign", "verify"], label: "RSA 3072" },
  "rsa-4096": { algorithm: { name: "RSASSA-PKCS1-v1_5", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, usages: ["sign", "verify"], label: "RSA 4096 (slow)" },
  "ecdsa-p256": { algorithm: { name: "ECDSA", namedCurve: "P-256" }, usages: ["sign", "verify"], label: "ECDSA P-256" },
  "ecdsa-p384": { algorithm: { name: "ECDSA", namedCurve: "P-384" }, usages: ["sign", "verify"], label: "ECDSA P-384" },
  "ed25519": { algorithm: { name: "Ed25519" }, usages: ["sign", "verify"], label: "Ed25519 (if your browser supports it)" },
};

export async function generateKeyPair(kind) {
  const k = KINDS[kind];
  if (!k) throw new Error("Unknown key type");
  let pair;
  try { pair = await crypto.subtle.generateKey(k.algorithm, true, k.usages); }
  catch { throw new Error(`${k.label} is not supported by this browser`); }
  const [pub, priv] = await Promise.all([crypto.subtle.exportKey("spki", pair.publicKey), crypto.subtle.exportKey("pkcs8", pair.privateKey)]);
  const fp = new Uint8Array(await crypto.subtle.digest("SHA-256", pub));
  return { kind, publicPem: pem("PUBLIC KEY", pub), privatePem: pem("PRIVATE KEY", priv), fingerprint: Array.from(fp, b => b.toString(16).padStart(2, "0")).join(":") };
}
