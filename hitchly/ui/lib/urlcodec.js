/** Percent-encoding helpers. `form` mode treats '+' as a space (application/x-www-form-urlencoded). */
export function encode(text, { form = false, full = false } = {}) {
  let out = full ? encodeURI(text) : encodeURIComponent(text);
  // encodeURIComponent leaves !'()* alone; encode them for stricter consumers
  if (!full) out = out.replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return form ? out.replace(/%20/g, "+") : out;
}

export function decode(text, { form = false } = {}) {
  const input = form ? text.replace(/\+/g, " ") : text;
  try { return decodeURIComponent(input); }
  catch { throw new Error("Malformed percent-encoding (a % is not followed by two hex digits, or the bytes are not UTF-8)"); }
}
