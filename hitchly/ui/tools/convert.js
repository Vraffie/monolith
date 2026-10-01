import { h, field, textarea, select, output } from "../dom.js";
import { convert } from "../lib/convert.js";

const SAMPLES = { json: '{\n  "name": "Ann",\n  "tags": ["a", "b"],\n  "address": { "city": "Oslo" }\n}', yaml: "name: Ann\ntags:\n  - a\n  - b\naddress:\n  city: Oslo\n",
  xml: '<person id="7"><name>Ann</name><tag>a</tag><tag>b</tag></person>', csv: "name,age\nAnn,31\nBob,27\n" };

export default {
  id: "convert", title: "JSON · YAML · XML · CSV converter", group: "Format & convert", keywords: "convert transform yaml to json xml csv",
  blurb: "Convert between JSON, YAML, XML and CSV in your browser. YAML is read as a documented subset (no anchors, tags or multi-document files) and unsupported input is reported, never guessed.",
  mount(root) {
    const src = textarea({ placeholder: "Paste data…" }), from = select([{ value: "json", label: "JSON" }, { value: "yaml", label: "YAML" }, { value: "xml", label: "XML" }, { value: "csv", label: "CSV" }]),
      to = select([{ value: "yaml", label: "YAML" }, { value: "json", label: "JSON" }, { value: "xml", label: "XML" }, { value: "csv", label: "CSV" }]);
    const out = output(), err = h("div", { class: "err", role: "alert" });
    const run = () => {
      err.textContent = ""; out.set("");
      if (!src.value.trim()) return;
      try { out.set(convert(src.value, from.value, to.value)); } catch (e) { err.textContent = e.message; }
    };
    const swap = h("button", { class: "ghost", type: "button", onclick: () => { [from.value, to.value] = [to.value, from.value]; if (out.get()) src.value = out.get(); run(); } }, "⇄ Swap");
    const sample = h("button", { class: "ghost", type: "button", onclick: () => { src.value = SAMPLES[from.value]; run(); } }, "Load a sample");
    for (const el of [src, from, to]) el.addEventListener("input", run);
    root.append(h("div", { class: "card" }, field("Input", src), h("div", { class: "inline" }, field("From", from), swap, field("To", to), sample), err), h("div", { class: "card" }, h("label", {}, "Output"), out),
      h("p", { class: "muted" }, "XML mapping: attributes become \"@name\" keys, mixed text \"#text\", repeated elements arrays; values from XML are strings. CSV needs an array of objects; nested values are written as JSON."));
  },
};
