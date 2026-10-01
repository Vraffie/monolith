// ISO 13616 IBAN lengths by country (registry subset covering the widely used countries).
const IBAN_LEN = { AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24,
  FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20,
  LU: 20, LV: 21, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24,
  SM: 27, TL: 23, TN: 24, TR: 26, UA: 29, VG: 24, XK: 20 };

export function validateIban(text) {
  const iban = text.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(iban)) return { valid: false, reason: "An IBAN is 2 letters, 2 check digits, then letters and digits" };
  const country = iban.slice(0, 2), expected = IBAN_LEN[country];
  if (expected && iban.length !== expected) return { valid: false, country, reason: `${country} IBANs have ${expected} characters, this has ${iban.length}` };
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) for (const d of String(/[A-Z]/.test(ch) ? ch.charCodeAt(0) - 55 : ch)) rem = (rem * 10 + +d) % 97;
  if (rem !== 1) return { valid: false, country, reason: "The check digits do not match (a typo, or not a real IBAN)" };
  return { valid: true, country, formatted: iban.replace(/(.{4})/g, "$1 ").trim(), lengthChecked: !!expected, note: expected ? "" : `Checksum is valid; ${country} is not in our length table` };
}

/** Normalise an email for de-duplication. Always: trim, lower-case the domain. Optional: lower-case the local part, strip +tags, Gmail dot rules. */
export function normalizeEmail(text, { lowerLocal = true, stripPlus = true, gmailDots = true } = {}) {
  const t = text.trim(), at = t.lastIndexOf("@");
  if (at < 1 || at === t.length - 1 || /\s/.test(t) || t.indexOf("@") !== at) throw new Error("Enter an email address like name@example.com");
  let local = t.slice(0, at), domain = t.slice(at + 1).toLowerCase();
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(domain)) throw new Error("The domain part does not look valid");
  if (lowerLocal) local = local.toLowerCase();
  if (domain === "googlemail.com") domain = "gmail.com";
  if (stripPlus) local = local.replace(/\+.*$/, "");
  if (gmailDots && domain === "gmail.com") local = local.replace(/\./g, "");
  if (!local) throw new Error("Nothing is left of the local part after normalising");
  return `${local}@${domain}`;
}

const enc = new TextEncoder();
export function basicAuthHeader(user, password) {
  if (user.includes(":")) throw new Error("The user name cannot contain ':' (RFC 7617)");
  let bin = "";
  for (const b of enc.encode(`${user}:${password}`)) bin += String.fromCharCode(b);
  return `Authorization: Basic ${btoa(bin)}`;
}

export function parseBasicAuth(header) {
  const m = /^(?:Authorization:\s*)?Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header.trim());
  if (!m) throw new Error("Expected 'Basic <base64>'");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(m[1]), c => c.charCodeAt(0))); } catch { throw new Error("The credentials are not valid Base64 / UTF-8"); }
  const i = text.indexOf(":");
  if (i < 0) throw new Error("The decoded value has no ':' between user and password");
  return { user: text.slice(0, i), password: text.slice(i + 1) };
}
