import { h, share } from "../lib/dom.js";
import { loadSpace, loadBridges } from "../lib/data.js";
import { normalise } from "../lib/space.js";
import { Bridge } from "../lib/bridge.js";
import { dayNumber, pick } from "../lib/daily.js";
import { load, save, recordResult } from "../lib/store.js";

const ROUNDS = ["two", "three", "one", "two", "one"];
const TITLES = { two: "Two-word bridge: one word that belongs with both clues", three: "Three-word bridge: one word that fits all three clues", one: "Closest connection: the word nearest in meaning to the clue" };
const SALT = { two: 303, three: 304, one: 305 };

export default {
  id: "bridge", title: "Bridge", blurb: "Each round gives clue words with a gap between them. Type one word that fits all the clues at once. Five rounds, 5000 points.",
  async mount(root, params) {
    const [space, bridges] = await Promise.all([loadSpace(), loadBridges()]);
    const archive = params.get("n"), day = archive ? Math.max(1, parseInt(archive, 10) || 1) : dayNumber(), key = "bridge:" + day;
    const state = load(key, { results: [] });   // [{ word, score }] per finished round
    const used = { two: 0, three: 0, one: 0 };
    const rounds = ROUNDS.map(kind => { const list = bridges[kind], n = used[kind]++; return list[pick(list.length, (day - 1) * 2 + n + 1, SALT[kind])].clues; });
    const board = h("div"), summary = h("div", { class: "summary" });

    function chainRow(clue, value, guessWord) {
      return h("div", { class: "chain" }, h("span", { class: "clue" }, clue),
        h("span", { class: "links", "aria-hidden": "true" }, Array.from({ length: 10 }, (_, i) => h("i", { class: i < Math.round(value / 100) ? "on" : "" }))),
        h("span", { class: "gw" }, guessWord), h("span", { class: "muted" }, ` ${value}`));
    }
    function draw() {
      board.replaceChildren(); summary.replaceChildren();
      const upto = Math.min(state.results.length, ROUNDS.length - 1);
      for (let r = 0; r <= upto && r < ROUNDS.length; r++) {
        const clues = rounds[r], done = state.results[r], b = new Bridge(space, clues);
        const card = h("section", { class: "card" }, h("h2", {}, `Round ${r + 1} of ${ROUNDS.length}`), h("p", { class: "muted" }, TITLES[ROUNDS[r]]),
          h("p", { class: "clues" }, clues.map((c, i) => [i ? h("span", { class: "plus" }, " + ") : null, h("span", { class: "chip" }, c)])));
        if (done) {
          const s = b.score(space.id(done.word));
          card.append(h("div", { class: "result" }, clues.map((c, i) => chainRow(c, s.links[i], done.word)),
            h("p", { class: "total" }, `${done.word}: ${done.score} / 1000`),
            h("p", { class: "muted" }, "Strongest links: " + b.top(5).join(", "))));
        } else {
          const input = h("input", { type: "text", autocomplete: "off", autocapitalize: "none", spellcheck: "false", "aria-label": "Your word", placeholder: "Your word" }), msg = h("p", { class: "msg", role: "status", "aria-live": "polite" });
          card.append(h("form", { onsubmit: e => {
            e.preventDefault();
            const n = normalise(space, input.value);
            if (n.error) { msg.textContent = n.error; return; }
            const s = b.score(space.id(n.word));
            if (s.error) { msg.textContent = s.error; return; }
            state.results.push({ word: n.word, score: s.score }); save(key, state);
            if (state.results.length === ROUNDS.length && !archive) recordResult("bridge", day, state.results.reduce((a, x) => a + x.score, 0));
            draw();
          } }, h("div", { class: "row" }, input, h("button", {}, "Lock in")), msg, h("p", { class: "muted" }, "One guess per round.")));
          setTimeout(() => input.focus(), 0);
        }
        board.append(card);
      }
      if (state.results.length === ROUNDS.length) {
        const total = state.results.reduce((a, r) => a + r.score, 0);
        const text = `Bridge #${day}: ${total} / ${ROUNDS.length * 1000}\n` + state.results.map(r => "🟩".repeat(Math.round(r.score / 200)) + "⬜".repeat(5 - Math.round(r.score / 200)) + " " + r.score).join("\n");
        summary.append(h("h2", {}, `${total} / ${ROUNDS.length * 1000}`), h("div", { class: "row" }, h("button", { type: "button", onclick: () => share(text) }, "Share"),
          h("a", { class: "btn ghost", href: `#/bridge?n=${Math.floor(Math.random() * 900) + 1}` }, "Play another")));
      }
    }
    root.append(board, summary); draw();
  },
};
