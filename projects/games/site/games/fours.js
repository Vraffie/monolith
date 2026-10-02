import { h, share } from "../lib/dom.js";
import { loadFours } from "../lib/data.js";
import { dayNumber, pick, shuffled } from "../lib/daily.js";
import { load, save, recordResult } from "../lib/store.js";
import { judge, MAX_MISTAKES } from "../lib/fours.js";

const SQUARES = ["🟨", "🟩", "🟦", "🟪"];

export default {
  id: "fours", title: "Fours", blurb: "Sixteen words, four hidden groups of four. Select four that belong together. Four mistakes and you are out.",
  async mount(root, params) {
    const puzzles = await loadFours();
    const archive = params.get("n"), day = archive ? Math.max(1, parseInt(archive, 10) || 1) : dayNumber();
    const puzzle = puzzles[pick(puzzles.length, day, 202)], key = "fours:" + day;
    const state = load(key, { solved: [], mistakes: 0, log: [], order: null });
    state.order ||= shuffled(puzzle.groups.flatMap(g => g.words), day * 7919);
    let selected = [];
    const grid = h("div", { class: "grid4" }), solvedBox = h("div"), dots = h("div", { class: "dots", "aria-label": "Mistakes left" });
    const msg = h("p", { class: "msg", role: "status", "aria-live": "polite" }), summary = h("div", { class: "summary" });
    const submit = h("button", { type: "button", onclick: send }, "Submit"), clear = h("button", { type: "button", class: "ghost", onclick: () => { selected = []; draw(); } }, "Deselect all");
    const mix = h("button", { type: "button", class: "ghost", onclick: () => { state.order = shuffled(state.order, Date.now()); draw(); } }, "Shuffle");
    const over = () => state.solved.length === 4 || state.mistakes >= MAX_MISTAKES;

    function send() {
      const r = judge(puzzle, selected);
      if (r.error) { msg.textContent = r.error; return; }
      const levels = selected.map(w => puzzle.groups.findIndex(g => g.words.includes(w)));
      state.log.push(levels);
      if (r.correct) { state.solved.push(r.group.level); msg.textContent = ""; }
      else { state.mistakes++; msg.textContent = r.oneAway ? "One away!" : "Not a group."; }
      selected = []; save(key, state);
      if (over()) { if (state.mistakes >= MAX_MISTAKES) for (const g of puzzle.groups) if (!state.solved.includes(g.level)) state.solved.push(g.level); if (!archive) recordResult("fours", day, state.mistakes); save(key, state); }
      draw();
    }
    function draw() {
      const solvedGroups = state.solved.map(l => puzzle.groups.find(g => g.level === l));
      solvedBox.replaceChildren(...solvedGroups.map(g => h("div", { class: "group lv" + g.level }, h("strong", {}, g.title), h("span", {}, g.words.join(", ")))));
      const left = state.order.filter(w => !solvedGroups.some(g => g.words.includes(w)));
      grid.replaceChildren(...left.map(w => h("button", { type: "button", class: "tile" + (selected.includes(w) ? " on" : ""), "aria-pressed": String(selected.includes(w)),
        onclick: () => { if (over()) return; selected = selected.includes(w) ? selected.filter(x => x !== w) : selected.length < 4 ? [...selected, w] : selected; draw(); } }, w)));
      dots.replaceChildren(...Array.from({ length: MAX_MISTAKES }, (_, i) => h("span", { class: "dot" + (i < MAX_MISTAKES - state.mistakes ? " on" : "") })), h("span", { class: "muted" }, ` ${MAX_MISTAKES - state.mistakes} mistakes left`));
      submit.disabled = selected.length !== 4 || over(); clear.disabled = !selected.length || over(); mix.disabled = over();
      summary.replaceChildren();
      if (over()) {
        const won = state.mistakes < MAX_MISTAKES, text = `Fours #${day} ${won ? "solved" : "failed"} (${state.mistakes} mistake${state.mistakes === 1 ? "" : "s"})\n` + state.log.map(l => l.map(x => SQUARES[x]).join("")).join("\n");
        summary.append(h("h2", {}, won ? "Solved!" : "Out of mistakes"), h("div", { class: "row" }, h("button", { type: "button", onclick: () => share(text) }, "Share"),
          h("a", { class: "btn ghost", href: `#/fours?n=${Math.floor(Math.random() * 900) + 1}` }, "Play another")));
      }
    }
    root.append(h("div", { class: "card" }, solvedBox, grid, msg, dots, h("div", { class: "row" }, submit, clear, mix), h("p", { class: "muted" }, `${archive ? "Puzzle" : "Today's puzzle"} #${day}`)), summary);
    draw();
  },
};
