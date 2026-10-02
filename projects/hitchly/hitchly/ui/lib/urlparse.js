export const TRACKING_PARAMS = [
  /^utm_/i, /^fbclid$/i, /^gclid$/i, /^dclid$/i, /^gbraid$/i, /^wbraid$/i, /^msclkid$/i, /^yclid$/i, /^twclid$/i,
  /^mc_cid$/i, /^mc_eid$/i, /^igshid$/i, /^_hsenc$/i, /^_hsmi$/i, /^mkt_tok$/i, /^vero_id$/i,
];

export function parseUrl(text) {
  let u;
  try { u = new URL(text.trim()); } catch { throw new Error("That is not a complete URL (include https://)"); }
  return {
    protocol: u.protocol, username: u.username, password: u.password ? "(hidden)" : "", host: u.host, hostname: u.hostname,
    port: u.port, path: u.pathname, hash: u.hash, origin: u.origin,
    params: [...u.searchParams.entries()].map(([key, value]) => ({ key, value, tracking: TRACKING_PARAMS.some(r => r.test(key)) })),
  };
}

/** Remove tracking parameters (and optionally the fragment / sort what remains). Order is otherwise preserved. */
export function cleanUrl(text, { removeTracking = true, removeFragment = false, sortParams = false } = {}) {
  const u = new URL(text.trim());
  const kept = [...u.searchParams.entries()].filter(([k]) => !(removeTracking && TRACKING_PARAMS.some(r => r.test(k))));
  if (sortParams) kept.sort(([a], [b]) => a.localeCompare(b));
  u.search = "";
  for (const [k, v] of kept) u.searchParams.append(k, v);
  if (removeFragment) u.hash = "";
  return { url: u.toString(), removed: [...new URL(text.trim()).searchParams.keys()].length - kept.length };
}
