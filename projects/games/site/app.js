import { h } from "./lib/dom.js";
import { dayNumber } from "./lib/daily.js";
import { load } from "./lib/store.js";

// Games are loaded on demand: opening one does not download the others.
const GAMES = {
  nearest: { title: "Nearest", blurb: "Guess the secret word. Every guess is ranked by closeness in meaning.", load: () => import("./games/nearest.js") },
  fours: { title: "Fours", blurb: "Sort sixteen words into four hidden groups.", load: () => import("./games/fours.js") },
  bridge: { title: "Bridge", blurb: "Find the word that connects the clues. Five rounds, 5000 points.", load: () => import("./games/bridge.js") },
};
const main = document.getElementById("main");
let seq = 0;

function home() {
  document.title = "Wordplay";
  main.replaceChildren(h("h1", {}, "Wordplay"), h("p", { class: "blurb" }, `Three daily word games, the same puzzle for everyone (day ${dayNumber()}). Everything runs in your browser.`),
    h("div", { class: "cards" }, Object.entries(GAMES).map(([id, g]) => {
      const s = load("stats:" + id, null);
      return h("a", { class: "card game", href: "#/" + id }, h("h2", {}, g.title), h("p", {}, g.blurb),
        h("p", { class: "muted" }, s ? `Played ${s.played} · streak ${s.streak} (best ${s.best})` : "Not played yet"));
    })));
}

async function route() {
  const my = ++seq, [path, query] = location.hash.replace(/^#\/?/, "").split("?"), id = path || "", params = new URLSearchParams(query || "");
  for (const a of document.querySelectorAll("header nav a")) a.toggleAttribute("aria-current", a.getAttribute("href") === "#/" + id);
  if (!GAMES[id]) { home(); return; }
  const g = GAMES[id];
  document.title = g.title + " · Wordplay";
  const body = h("div", {}, h("p", { class: "muted" }, "Loading…"));
  main.replaceChildren(h("h1", {}, g.title), h("p", { class: "blurb" }, g.blurb), body);
  try {
    const mod = (await g.load()).default, inner = h("div");
    await mod.mount(inner, params);
    if (my === seq) body.replaceChildren(inner);
  } catch (e) {
    if (my === seq) body.replaceChildren(h("div", { class: "card err" }, "This game failed to load: " + e.message));
    console.error(e);
  }
}
addEventListener("hashchange", route);
route();
