import { h, share } from "../lib/dom.js";
import { loadSpace, loadSecrets } from "../lib/data.js";
import { normalise } from "../lib/space.js";
import { dayNumber, pick } from "../lib/daily.js";
import { load, save, recordResult } from "../lib/store.js";

// Rank thresholds scale with the vocabulary (Contexto-style 300 / 1500 of 60k, here out of ~14k).
const tier = (rank, n) => (rank <= n * 0.007 ? "hot" : rank <= n * 0.035 ? "warm" : "cold");
const emoji = { hot: "🟩", warm: "🟨", cold: "🟥" };

export default {
  id: "nearest", title: "Nearest", blurb: "Find the secret word. Every guess is ranked by how close it is in meaning: rank 1 is the answer.",
  async mount(root, params) {
    const [space, secrets] = await Promise.all([loadSpace(), loadSecrets()]);
    const archive = params.get("n"), day = archive ? Math.max(1, parseInt(archive, 10) || 1) : dayNumber();
    const secret = space.id(secrets[pick(secrets.length, day, 101)]);
    const { rankOf, order } = space.ranking(secret);
    const key = "nearest:" + day;
    const state = load(key, { guesses: [], hints: 0, gaveUp: false });
    const guessed = () => new Set(state.guesses.map(g => g.id));
    const solved = () => state.guesses.some(g => g.rank === 1);
    const done = () => solved() || state.gaveUp;

    const input = h("input", { type: "text", autocomplete: "off", autocapitalize: "none", spellcheck: "false", "aria-label": "Your guess", placeholder: "Type a word" });
    const msg = h("p", { class: "msg", role: "status", "aria-live": "polite" });
    const list = h("ol", { class: "guesses" }), summary = h("div", { class: "summary" });
    const hintBtn = h("button", { type: "button", class: "ghost", onclick: hint }, "Hint");
    const giveBtn = h("button", { type: "button", class: "ghost", onclick: giveUp }, "Give up");

    function add(id) {
      if (guessed().has(id)) { msg.textContent = `You already tried "${space.words[id]}" (rank ${rankOf[id].toLocaleString()}).`; return; }
      state.guesses.push({ id, rank: rankOf[id] }); save(key, state);
      if (state.guesses.at(-1).rank === 1) finish(true);
      draw(id);
    }
    function guess(text) {
      const r = normalise(space, text);
      if (r.error) { msg.textContent = r.error; return; }
      msg.textContent = r.from ? `Counted "${r.from}" as "${r.word}".` : "";
      add(space.id(r.word));
    }
    function hint() {
      const best = Math.min(...state.guesses.map(g => g.rank), space.n), have = guessed();
      let target = Math.max(2, Math.floor(best / 2));
      while (target < space.n && have.has(order[target - 1])) target++;
      state.hints++; add(order[target - 1]);
    }
    function giveUp() { state.gaveUp = true; save(key, state); finish(false); draw(); }
    function finish(win) {
      if (!archive) recordResult("nearest", day, win ? state.guesses.length : 0);
      save(key, state);
    }
    function row(g, latest) {
      const t = tier(g.rank, space.n), width = Math.max(2, 100 * (1 - Math.log(g.rank) / Math.log(space.n)));
      const bar = h("span", { class: "bar", "aria-hidden": "true" });
      bar.style.width = width.toFixed(1) + "%";   // set through the CSSOM: an inline style attribute would be blocked by the CSP
      return h("li", { class: "guess " + t + (latest ? " latest" : "") }, bar,
        h("span", { class: "w" }, space.words[g.id]), h("span", { class: "r" }, g.rank.toLocaleString()));
    }
    function draw(latestId) {
      list.replaceChildren();
      const latest = state.guesses.find(g => g.id === latestId);
      if (latest) list.append(row(latest, true));
      for (const g of [...state.guesses].sort((a, b) => a.rank - b.rank)) if (g.id !== latestId) list.append(row(g, false));
      const over = done();
      input.disabled = over; hintBtn.disabled = over; giveBtn.disabled = over;
      summary.replaceChildren();
      if (over) {
        const count = state.guesses.length, tiers = state.guesses.reduce((m, g) => (m[tier(g.rank, space.n)]++, m), { hot: 0, warm: 0, cold: 0 });
        const text = `Nearest #${day} ${solved() ? `solved in ${count} guesses` : "gave up"}${state.hints ? `, ${state.hints} hint${state.hints > 1 ? "s" : ""}` : ""}\n` +
          Object.entries(tiers).filter(([, n]) => n).map(([k, n]) => emoji[k].repeat(Math.min(n, 12)) + (n > 12 ? `+${n - 12}` : "")).join(" ");
        summary.append(h("h2", {}, solved() ? "Found it!" : "The word was"), h("p", { class: "answer" }, space.words[secret]),
          !solved() ? h("p", { class: "muted" }, "Closest words: " + order.slice(1, 13).map(i => space.words[i]).join(", ")) : null,
          h("div", { class: "row" }, h("button", { type: "button", onclick: () => share(text) }, "Share"),
            h("a", { class: "btn ghost", href: `#/nearest?n=${Math.floor(Math.random() * 900) + 1}` }, "Play another")));
      }
    }
    root.append(h("form", { class: "card", onsubmit: e => { e.preventDefault(); if (input.value.trim()) { guess(input.value); input.value = ""; } input.focus(); } },
      h("div", { class: "row" }, input, h("button", {}, "Guess")), msg, h("div", { class: "row" }, hintBtn, giveBtn,
        h("span", { class: "muted" }, `${archive ? "Puzzle" : "Today's puzzle"} #${day} · ${space.n.toLocaleString()} words`))),
      summary, list);
    draw(); if (!done()) input.focus();
  },
};
