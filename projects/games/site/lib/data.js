import { Space } from "./space.js";

const getJson = url => fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); });
const getText = url => fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.text(); });
let spacePromise;

/** The word vectors (2.2 MB, fetched once and cached by the browser). */
export function loadSpace() {
  spacePromise ||= Promise.all([getText("data/words.txt"), fetch("data/vectors.bin").then(r => { if (!r.ok) throw new Error("vectors.bin: HTTP " + r.status); return r.arrayBuffer(); })])
    .then(([words, buf]) => Space.parse(words, new Uint8Array(buf)));
  return spacePromise;
}
export const loadSecrets = () => getText("data/secrets.txt").then(t => t.split("\n").filter(Boolean));
export const loadBridges = () => getJson("data/bridges.json");
export const loadFours = () => getJson("data/fours.json");
