import { base64ToBytes } from "./base64.js";

const dec = new TextDecoder("utf-8", { fatal: true });

function part(segment, name) {
  try { return JSON.parse(dec.decode(base64ToBytes(segment))); }
  catch { throw new Error(`The ${name} is not valid Base64URL-encoded JSON`); }
}

/**
 * Decode (NOT verify) a JWT. Anyone can read a JWT's contents; only the signature proves who made it,
 * and checking that needs the key, so this tool never claims a token is trustworthy.
 */
export function decodeJwt(token, now = Date.now()) {
  const segments = token.trim().split(".");
  if (segments.length !== 3) throw new Error("A JWT has three dot-separated parts (header.payload.signature)");
  const header = part(segments[0], "header");
  const payload = part(segments[1], "payload");
  const warnings = [];
  if (String(header.alg).toLowerCase() === "none") warnings.push('alg is "none": this token is unsigned and must not be trusted');
  if (segments[2] === "" && String(header.alg).toLowerCase() !== "none") warnings.push("The signature part is empty");
  const claims = {};
  for (const k of ["exp", "nbf", "iat"]) {
    if (typeof payload[k] === "number") claims[k] = { iso: new Date(payload[k] * 1000).toISOString(), at: payload[k] };
  }
  const nowSec = Math.floor(now / 1000);
  let status = "no expiry claim";
  if (claims.exp) status = nowSec >= claims.exp.at ? "expired" : "not expired";
  if (claims.nbf && nowSec < claims.nbf.at) status = "not valid yet";
  return { header, payload, signature: segments[2], claims, status, warnings, verified: false };
}
