import { h, toast } from "./dom.js";
import { tools, GROUPS } from "./tools/index.js";

const KEY = "hitchly_token";
const store = {
  get() { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } },
  set(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* private mode */ } },
};
let token = store.get();
let prefill = "";
// On a static host (GitHub Pages etc.) there is no Hitchly server: only the client-side tools work.
let serverless = false;
fetch("health").then(r => { serverless = !r.ok; }, () => { serverless = true; }).finally(() => route());

export const ctx = {
  origin: location.origin,
  get signedIn() { return !!token; },
  /** Authenticated JSON call. Throws Error(message) on API errors; 401 signs out. */
  async api(path, opts = {}) {
    const headers = { Authorization: "Bearer " + token, ...(opts.body ? { "Content-Type": "application/json" } : {}), ...opts.headers };
    const res = await fetch(path, { ...opts, headers });
    if (res.status === 401) { signOut(); throw new Error("Invalid or expired token"); }
    if (res.status === 429) throw new Error("Too many requests, try again shortly");
    if (res.status === 204) return null;
    const type = res.headers.get("Content-Type") || "";
    const body = type.includes("json") ? await res.json() : await res.text();
    if (!res.ok) throw new Error((body && body.error) || res.statusText);
    return body;
  },
  /** Authenticated download of binary data (e.g. the database backup). */
  async blob(path) {
    const res = await fetch(path, { headers: { Authorization: "Bearer " + token } });
    if (res.status === 401) { signOut(); throw new Error("Invalid or expired token"); }
    if (!res.ok) { let m = res.statusText; try { m = (await res.json()).error || m; } catch { /* not JSON */ } throw new Error(m); }
    return res.blob();
  },
  takePrefill() { const v = prefill; prefill = ""; return v; },
  toast,
};

function signOut() { token = ""; store.set(""); route(); }

function loginCard(onDone) {
  const tokenInput = h("input", { id: "tok", type: "password", autocomplete: "current-password", required: true });
  const err = h("div", { class: "err", role: "alert" });
  const form = h("form", {
    class: "card",
    onsubmit: async e => {
      e.preventDefault();
      err.textContent = "";
      token = tokenInput.value.trim();
      try { await ctx.api("/api/links?limit=1"); store.set(token); onDone(); }
      catch (ex) { token = ""; err.textContent = ex.message; }
    },
  }, h("p", { class: "muted" }, "This tool talks to your Hitchly server. Enter the API token (HITCHLY_TOKEN)."),
  h("label", { for: "tok" }, "API token"), tokenInput, err, h("button", {}, "Sign in"));
  return form;
}

// ---- navigation ------------------------------------------------------------
const nav = document.getElementById("nav");
const navList = document.getElementById("navList");
const menu = document.getElementById("menu");
const main = document.getElementById("main");
const search = document.getElementById("toolSearch");

function buildNav() {
  navList.replaceChildren();
  for (const group of GROUPS) {
    const items = tools.filter(t => t.group === group);
    if (!items.length) continue;
    navList.append(h("h2", {}, group));
    for (const t of items) {
      navList.append(h("a", { href: "#/" + t.id, "data-id": t.id, "data-q": (t.title + " " + (t.keywords || "")).toLowerCase() },
        t.title, t.needsAuth ? h("span", { class: "lock", title: "Needs your API token", "aria-label": "(needs sign-in)" }, " 🔒") : null));
    }
  }
}

function filterNav() {
  const q = search.value.trim().toLowerCase();
  for (const a of nav.querySelectorAll("a")) a.hidden = !!q && !a.dataset.q.includes(q);
  for (const h2 of nav.querySelectorAll("h2")) {
    let el = h2.nextElementSibling, any = false;
    while (el && el.tagName === "A") { any ||= !el.hidden; el = el.nextElementSibling; }
    h2.hidden = !any;
  }
}

function currentId() {
  const hash = location.hash;
  const m = hash.match(/^#new=(.+)$/);
  if (m) { try { prefill = decodeURIComponent(m[1]); } catch { /* ignore malformed */ } history.replaceState(null, "", "#/links"); return "links"; }
  return (hash.match(/^#\/([a-z0-9-]+)/) || [])[1] || (serverless ? "base64" : "links");
}

let routeSeq = 0;
async function route() {
  const seq = ++routeSeq;  // a slower, older navigation must not overwrite a newer one
  const id = currentId();
  const tool = tools.find(t => t.id === id) || tools[0];
  for (const a of nav.querySelectorAll("a")) {
    if (a.dataset.id === tool.id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  document.title = tool.title + " · Hitchly";
  document.getElementById("auth").textContent = token ? "Sign out" : "Sign in";
  main.replaceChildren(h("h1", {}, tool.title), h("p", { class: "blurb" }, tool.blurb));
  const body = h("div");
  main.append(body);
  if (tool.needsAuth && serverless) {
    body.append(h("div", { class: "card" }, h("p", {}, "This tool needs a Hitchly server, and this page is the static toolbox, which has no server behind it."),
      h("p", { class: "muted" }, "Run your own (one command, no dependencies) to get short links, tracking, the redirect tracer and the admin tools. All the other tools on the left work right here.")));
    return;
  }
  if (tool.needsAuth && !token) { body.append(loginCard(route)); return; }
  body.append(h("p", { class: "muted" }, "Loading…"));
  try {
    const mod = await tool.load();  // fetched on first use, so opening one tool does not download all of them
    if (seq !== routeSeq) return;
    body.replaceChildren();
    mod.mount(body, ctx);
  } catch (e) {
    if (seq !== routeSeq) return;
    body.replaceChildren(h("div", { class: "card err" }, "This tool failed to load: " + e.message));
    console.error(e);
  }
}

document.getElementById("auth").addEventListener("click", () => {
  if (token) { signOut(); return; }
  main.replaceChildren(h("h1", {}, "Sign in"), loginCard(route));
});
search.addEventListener("input", filterNav);
menu.addEventListener("click", () => { const open = nav.classList.toggle("open"); menu.setAttribute("aria-expanded", String(open)); });
addEventListener("hashchange", () => { nav.classList.remove("open"); menu.setAttribute("aria-expanded", "false"); route(); });
buildNav();  // the first route() runs once the server probe above has settled, so there is no login flash on static hosts
