// Tiny DOM helpers. Everything goes through textContent / setAttribute: never innerHTML.
const PROPS = new Set(["value", "checked", "textContent", "disabled", "readOnly", "selected", "indeterminate"]);

export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (PROPS.has(k)) e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : String(kid));
  return e;
}

let uid = 0;
/** A labelled control. Returns the wrapper; the control is `wrapper.control`. */
export function field(label, control, cls = "") {
  const id = control.id || (control.id = "f" + ++uid);
  const w = h("div", { class: cls }, h("label", { for: id }, label), control);
  w.control = control;
  return w;
}

export const input = (props = {}) => h("input", { type: "text", autocomplete: "off", spellcheck: "false", ...props });
export const textarea = (props = {}) => h("textarea", { spellcheck: "false", ...props });
export const select = (options, props = {}) =>
  h("select", props, options.map(o => (typeof o === "string" ? h("option", { value: o }, o) : h("option", { value: o.value }, o.label))));

export function toast(message) {
  const t = document.getElementById("toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 1600);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied");
  } catch {
    toast("Copy failed: select the text and copy manually");
  }
}

/** A read-only output block with a Copy button. `set(text)` updates it. */
export function output(initial = "") {
  const pre = h("pre", {}, initial);
  const btn = h("button", { class: "ghost small copy", type: "button", onclick: () => copyText(pre.textContent) }, "Copy");
  const box = h("div", { class: "out" }, pre, btn);
  box.set = text => { pre.textContent = text; };
  box.get = () => pre.textContent;
  return box;
}

export function download(filename, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function debounce(fn, ms = 150) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
