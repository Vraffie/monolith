import { h, field, input, textarea, debounce } from "../dom.js";

const TIMEOUT_MS = 1500;

/** Run in a Worker so a catastrophic pattern (e.g. (a+)+$) can be terminated instead of freezing the tab. */
function runInWorker(pattern, flags, text) {
  return new Promise(resolve => {
    const w = new Worker(new URL("../lib/regex-worker.js", import.meta.url), { type: "module" });
    const timer = setTimeout(() => { w.terminate(); resolve({ ok: false, error: `Stopped after ${TIMEOUT_MS} ms: this pattern may backtrack catastrophically` }); }, TIMEOUT_MS);
    w.onmessage = e => { clearTimeout(timer); w.terminate(); resolve(e.data); };
    w.onerror = () => { clearTimeout(timer); w.terminate(); resolve({ ok: false, error: "The regex engine failed" }); };
    w.postMessage({ pattern, flags, text });
  });
}

export default {
  id: "regex", title: "Regex tester", group: "Format & convert", keywords: "regular expression match groups javascript",
  blurb: "Test a JavaScript regular expression against text. Matches, capture groups and named groups are listed; runaway patterns are stopped.",
  mount(root) {
    const pattern = input({ placeholder: "(\\d+)-(?<word>[a-z]+)" }), flags = input({ value: "g", maxlength: "8" });
    const text = textarea({ placeholder: "Text to search…" });
    const results = h("div"), status = h("div", { class: "muted" });
    let seq = 0;
    const run = debounce(async () => {
      const mine = ++seq;
      results.replaceChildren();
      if (!pattern.value) { status.textContent = ""; return; }
      status.textContent = "Running…";
      const r = await runInWorker(pattern.value, flags.value, text.value);
      if (mine !== seq) return; // a newer run superseded this one
      if (!r.ok) { status.className = "err"; status.textContent = r.error; return; }
      status.className = "muted"; status.textContent = `${r.matches.length} match${r.matches.length === 1 ? "" : "es"}` + (r.truncated ? " (list truncated)" : "");
      const rows = r.matches.map((m, i) => h("tr", {}, h("td", {}, i + 1), h("td", { class: "mono" }, JSON.stringify(m.text)), h("td", {}, m.index),
        h("td", { class: "mono" }, m.groups.map(g => JSON.stringify(g ?? null)).join(", ") + (m.named ? " " + JSON.stringify(m.named) : ""))));
      if (rows.length) results.append(h("table", {}, h("tr", {}, ["#", "Match", "Index", "Groups"].map(t => h("th", {}, t))), rows));
    }, 200);
    for (const el of [pattern, flags, text]) el.addEventListener("input", run);
    root.append(h("div", { class: "card grid" }, field("Pattern", pattern), field("Flags", flags), field("Text", text, "full"), h("div", { class: "full" }, status)),
      h("div", { class: "card" }, results));
  },
};
