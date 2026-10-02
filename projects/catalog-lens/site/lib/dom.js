// Tiny DOM helper: everything goes through textContent / setAttribute, never innerHTML.
export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "value" || k === "disabled" || k === "checked") e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : String(kid));
  return e;
}

export function toast(message) {
  const t = document.getElementById("toast");
  t.textContent = message; t.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
}

/** Share text with the native sheet where it exists, otherwise copy it. */
export async function share(text) {
  try {
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text); toast("Copied to clipboard");
  } catch { toast("Could not share: select and copy the result instead"); }
}
