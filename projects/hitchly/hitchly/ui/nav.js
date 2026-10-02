// How the tools are presented. Tools that do the same kind of job are bundled into one navigation entry with tabs
// (each tab is still a tool with its own URL, so #/base64 keeps working); the rest are listed as they are.
// `sub` is the sub-heading under a group. Pure data + one function, so tests can check it against the manifest.
export const COMBOS = [
  { id: "short-links", title: "Short links", group: "Links", sub: "", blurb: "Create, search, edit and track short links, or shorten a whole list at once.",
    parts: [["links", "Links"], ["bulk", "Bulk shorten"]] },
  { id: "url-tools", title: "URL builder & cleaner", group: "QR & URLs", sub: "Make", blurb: "Add campaign parameters to a URL, or take one apart and strip tracking parameters.",
    parts: [["utm", "UTM builder"], ["url-parser", "Parser & cleaner"]] },
  { id: "encoders", title: "Text encoders", group: "Encode & decode", sub: "Encodings", blurb: "Base64, URL encoding, escape sequences, bytes and Unicode.",
    parts: [["base64", "Base64"], ["url-encode", "URL"], ["escape", "Escape"], ["textenc", "Bytes & Unicode"]] },
  { id: "crypto", title: "Hash, JWT & encryption", group: "Encode & decode", sub: "Crypto", blurb: "Hashes and HMAC, JWT inspection, and passphrase encryption.",
    parts: [["hash", "Hash & HMAC"], ["jwt", "JWT"], ["encrypt", "Encrypt"]] },
  { id: "secrets", title: "IDs, passwords & keys", group: "Generate", sub: "IDs & secrets", blurb: "UUIDs and ULIDs, passwords and tokens, 2FA codes and key pairs.",
    parts: [["uuid", "UUID & ULID"], ["password", "Password"], ["totp", "TOTP"], ["keys", "Key pairs"]] },
  { id: "data-formats", title: "Data formats", group: "Format & convert", sub: "Data", blurb: "Format and validate JSON, convert between JSON, YAML, XML and CSV, and diff two texts.",
    parts: [["json", "JSON"], ["convert", "Convert"], ["diff", "Diff"]] },
  { id: "text-regex", title: "Text & regex", group: "Format & convert", sub: "Data", blurb: "Clean up and count text, and test regular expressions.",
    parts: [["text", "Text utilities"], ["regex", "Regex"]] },
  { id: "converters", title: "Converters", group: "Format & convert", sub: "Values", blurb: "Timestamps, number bases, units, percentages and Roman numerals.",
    parts: [["time", "Timestamps"], ["radix", "Number bases"], ["units", "Units"]] },
  { id: "image-tools", title: "Image converter & icons", group: "Images", sub: "Images", blurb: "Convert, resize and compress images, or turn one into a full set of favicons.",
    parts: [["image-convert", "Convert & resize"], ["favicon", "Favicons"]] },
  { id: "http-network", title: "HTTP & network", group: "Network & web", sub: "", blurb: "HTTP status codes, subnets and Basic auth headers.",
    parts: [["http", "Status & MIME"], ["subnet", "Subnets"], ["basicauth", "Basic auth"]] },
  { id: "import-export", title: "Import & export", group: "Admin", sub: "", blurb: "Move links in from another shortener, or download them all.",
    parts: [["import", "Import"], ["export", "Export"]] },
];

// Standalone tools only need a sub-heading when their group has more than one.
export const SUBS = {
  qr: "Make", tracer: "Inspect", lorem: "Placeholder",
  color: "Values", validate: "Values", cron: "Developer helpers", chmod: "Developer helpers",
  "image-privacy": "Images", "colour-blindness": "Images", "data-uri": "Images",
};

/** Navigation entries per group, plus lookups for the router. */
export function structure(tools, groups) {
  const byId = Object.fromEntries(tools.map(t => [t.id, t]));
  const comboOf = {};
  const combos = COMBOS.map(c => {
    const parts = c.parts.map(([id, tab]) => byId[id]);
    for (const [id, tab] of c.parts) comboOf[id] = { combo: c, tab };
    return { ...c, tools: parts, needsAuth: parts.every(p => p.needsAuth), keywords: parts.map(p => p.title + " " + p.keywords).join(" ") };
  });
  const items = tools.filter(t => !comboOf[t.id]).map(t => ({ id: t.id, title: t.title, group: t.group, sub: SUBS[t.id] || "", needsAuth: t.needsAuth, keywords: t.keywords, first: t.id }));
  for (const c of combos) items.push({ id: c.id, title: c.title, group: c.group, sub: c.sub, needsAuth: c.needsAuth, keywords: c.keywords, first: c.parts[0][0] });
  const order = g => groups.indexOf(g);
  items.sort((a, b) => order(a.group) - order(b.group));   // stable: keeps manifest order inside a group
  return { items, combos, comboOf, byId };
}
