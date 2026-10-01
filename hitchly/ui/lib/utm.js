export const UTM_FIELDS = ["source", "medium", "campaign", "term", "content"];

/** Add utm_* parameters to a URL, keeping existing query and fragment. Empty values are skipped. */
export function buildUtm(base, values) {
  let u;
  try { u = new URL(base.trim()); } catch { throw new Error("Enter a complete URL (include https://)"); }
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only http and https URLs");
  for (const f of UTM_FIELDS) {
    const v = (values[f] || "").trim();
    if (v) u.searchParams.set("utm_" + f, v);
    else u.searchParams.delete("utm_" + f);
  }
  if (!u.searchParams.get("utm_source") && UTM_FIELDS.some(f => (values[f] || "").trim())) {
    throw new Error("utm_source is required whenever other UTM fields are used");
  }
  return u.toString();
}

export function lintUtm(values) {
  const tips = [];
  for (const f of UTM_FIELDS) {
    const v = (values[f] || "").trim();
    if (v && v !== v.toLowerCase()) tips.push(`utm_${f}: analytics tools treat "${v}" and "${v.toLowerCase()}" as different values; lower case is safer`);
    if (/\s/.test(v)) tips.push(`utm_${f}: spaces become %20; use hyphens or underscores`);
  }
  return tips;
}
