import { h, field, input, select } from "../dom.js";
import { searchStatus, searchMime } from "../lib/httpref.js";

export default {
  id: "http", title: "HTTP status & MIME reference", group: "Network & web", keywords: "status code 404 301 302 redirect mime content-type extension",
  blurb: "Look up what an HTTP status code means (and which redirect to use), or find the MIME type for a file extension.",
  mount(root) {
    const kind = select([{ value: "status", label: "Status codes" }, { value: "mime", label: "MIME types" }]);
    const q = input({ placeholder: "404, redirect, teapot, json, png…", "aria-label": "Search", type: "search" });
    const body = h("div", { class: "card scroll" });
    const klass = c => (c === "Success" ? "good" : c === "Client error" || c === "Server error" ? "bad" : "");
    const run = () => {
      body.replaceChildren();
      if (kind.value === "status") {
        const rows = searchStatus(q.value);
        body.append(rows.length ? h("table", {}, h("tr", {}, ["Code", "Name", "Meaning"].map(t => h("th", {}, t))),
          rows.map(r => h("tr", {}, h("td", { class: "mono" }, h("span", { class: "pill " + klass(r.class), title: r.class }, String(r.code))), h("td", {}, r.name), h("td", {}, r.meaning)))) : h("p", { class: "muted" }, "No match."));
      } else {
        const rows = searchMime(q.value);
        body.append(rows.length ? h("table", {}, h("tr", {}, ["Extension", "MIME type"].map(t => h("th", {}, t))), rows.map(r => h("tr", {}, h("td", { class: "mono" }, "." + r.ext), h("td", { class: "mono" }, r.type)))) : h("p", { class: "muted" }, "No match."));
      }
    };
    for (const el of [kind, q]) el.addEventListener("input", run);
    root.append(h("div", { class: "card grid" }, field("Reference", kind), field("Search", q)),
      h("p", { class: "muted" }, "Redirects: 301/308 are permanent and cached by browsers; 302/307 are temporary; 307 and 308 keep the request method, 301/302 may turn POST into GET."), body);
    run();
  },
};
