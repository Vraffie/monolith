/** Build the text a phone's camera understands for each kind of QR code. Pure functions. */

// Wi-Fi: reserved characters \ ; , : " must be backslash-escaped inside values.
const BS = "\u005c"; // a single backslash
const wifiEsc = v => v.replace(/[\u005c;,:"]/g, m => BS + m);
// vCard 3.0 text values: escape \ ; , and newlines.
const vEsc = v => v.replace(/\u005c/g, BS + BS).replace(/;/g, BS + ";").replace(/,/g, BS + ",").replace(/\r?\n/g, BS + "n");

export function wifi({ ssid, password = "", security = "WPA", hidden = false }) {
  if (!ssid) throw new Error("Network name (SSID) is required");
  if (!["WPA", "WEP", "nopass"].includes(security)) throw new Error("Security must be WPA, WEP or nopass");
  if (security !== "nopass" && !password) throw new Error("A password is required unless the network is open");
  return `WIFI:T:${security};S:${wifiEsc(ssid)};${security === "nopass" ? "" : `P:${wifiEsc(password)};`}${hidden ? "H:true;" : ""};`;
}

export function vcard({ first = "", last = "", org = "", title = "", phone = "", email = "", url = "" }) {
  if (!first && !last && !org) throw new Error("Enter at least a name or an organisation");
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${vEsc(last)};${vEsc(first)};;;`, `FN:${vEsc([first, last].filter(Boolean).join(" ") || org)}`];
  if (org) lines.push(`ORG:${vEsc(org)}`);
  if (title) lines.push(`TITLE:${vEsc(title)}`);
  if (phone) lines.push(`TEL;TYPE=CELL:${vEsc(phone)}`);
  if (email) lines.push(`EMAIL:${vEsc(email)}`);
  if (url) lines.push(`URL:${vEsc(url)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export function email({ to, subject = "", body = "" }) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to || "")) throw new Error("Enter a valid email address");
  const q = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join("&");
  return `mailto:${to}${q ? "?" + q : ""}`;
}

export function sms({ number, message = "" }) {
  const n = (number || "").replace(/[\s()-]/g, "");
  if (!/^\+?\d{3,15}$/.test(n)) throw new Error("Enter a phone number with 3-15 digits (optionally starting with +)");
  return `SMSTO:${n}:${message}`;
}

export function phone(number) {
  const n = (number || "").replace(/[\s()-]/g, "");
  if (!/^\+?\d{3,15}$/.test(n)) throw new Error("Enter a phone number with 3-15 digits (optionally starting with +)");
  return `tel:${n}`;
}

export function geo({ lat, lon }) {
  const a = Number(lat), o = Number(lon);
  if (lat === "" || lon === "" || !Number.isFinite(a) || !Number.isFinite(o) || Math.abs(a) > 90 || Math.abs(o) > 180) {
    throw new Error("Latitude must be -90..90 and longitude -180..180");
  }
  return `geo:${a},${o}`;
}

export function url(text) {
  let u;
  try { u = new URL((text || "").trim()); } catch { throw new Error("Enter a complete URL (include https://)"); }
  return u.toString();
}
