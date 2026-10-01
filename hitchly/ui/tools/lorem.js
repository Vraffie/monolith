import { h, field, input, select, output } from "../dom.js";
import { lorem } from "../lib/lorem.js";

export default {
  id: "lorem", title: "Lorem ipsum generator", group: "Generate", keywords: "placeholder text dummy filler paragraphs",
  blurb: "Placeholder text by the word, sentence or paragraph.",
  mount(root) {
    const unit = select([{ value: "paragraphs", label: "Paragraphs" }, { value: "sentences", label: "Sentences" }, { value: "words", label: "Words" }]);
    const count = input({ type: "number", value: "3", min: "1", max: "1000" }), classic = h("input", { type: "checkbox", checked: true });
    const out = output(), err = h("div", { class: "err", role: "alert" });
    const run = () => { err.textContent = ""; try { out.set(lorem({ unit: unit.value, count: Number(count.value), classicStart: classic.checked })); } catch (e) { out.set(""); err.textContent = e.message; } };
    for (const el of [unit, count, classic]) el.addEventListener("input", run);
    root.append(h("div", { class: "card" }, h("div", { class: "inline" }, field("Unit", unit), field("How many", count), h("label", {}, classic, "Start with “Lorem ipsum”"), h("button", { onclick: run }, "Regenerate")), err), h("div", { class: "card" }, out));
    run();
  },
};
