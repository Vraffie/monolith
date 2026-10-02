import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Space, normalise } from "../site/lib/space.js";
import { Bridge } from "../site/lib/bridge.js";
import { dayNumber, pick, permutation, shuffled, EPOCH } from "../site/lib/daily.js";
import { validate, judge } from "../site/lib/fours.js";

const D = new URL("../site/data/", import.meta.url);
const text = f => readFileSync(new URL(f, D), "utf8");
const space = Space.parse(text("words.txt"), new Uint8Array(readFileSync(new URL("vectors.bin", D))));
const near = (w, k = 10) => { const r = space.ranking(space.id(w)); return r.order.slice(1, k + 1).map(i => space.words[i]); };

test("space: sizes agree and vectors are unit length", () => {
  assert.equal(space.n * space.dim, readFileSync(new URL("vectors.bin", D)).length);
  assert.ok(space.n > 10000);
  for (const i of [0, 77, space.n - 1]) assert.ok(Math.abs(space.sim(i, i) - 1) < 1e-5);
  assert.throws(() => Space.parse("a\nb\n", new Uint8Array(5), 2), /expected 4/);
});

test("space: neighbours are sensible", () => {
  assert.ok(near("violin").includes("cello"));
  assert.ok(near("doctor", 6).includes("physician"));
  assert.ok(near("winter", 6).includes("summer"));
  const r = space.ranking(space.id("river"));
  assert.equal(r.rankOf[space.id("river")], 1);
  assert.ok(r.rankOf[space.id("stream")] < 100 && r.rankOf[space.id("piano")] > 1000);
  assert.deepEqual([...new Set(r.order)].length, space.n, "ranking is a permutation");
});

test("normalise: plurals map to the base word, junk is rejected with a message", () => {
  assert.deepEqual(normalise(space, " Dogs "), { word: "dog", from: "dogs" });
  assert.deepEqual(normalise(space, "river"), { word: "river" });
  for (const bad of ["", "two words", "r2d2", "zzzzqqq", "a".repeat(30)]) assert.ok(normalise(space, bad).error, bad);
});

test("daily: day numbers, deterministic permutations that cover every puzzle before repeating", () => {
  assert.equal(dayNumber(new Date(EPOCH)), 1);
  assert.equal(dayNumber(new Date(EPOCH + 864e5 * 40 + 3600e3)), 41);
  const p = permutation(17, 5); assert.deepEqual([...p].sort((a, b) => a - b), Array.from({ length: 17 }, (_, i) => i));
  assert.deepEqual(permutation(17, 5), p); assert.notDeepEqual(permutation(17, 6), p);
  assert.equal(new Set(Array.from({ length: 17 }, (_, i) => pick(17, i + 1, 9))).size, 17);
  assert.equal(pick(17, 18, 9), pick(17, 1, 9));
  assert.deepEqual(shuffled([1, 2, 3, 4, 5, 6], 3), shuffled([1, 2, 3, 4, 5, 6], 3));
});

test("bridge: the best word scores 1000, clue words are refused, unrelated words score near zero", () => {
  const b = new Bridge(space, ["pizza", "pasta"]);
  assert.equal(b.score(b.best).score, 1000);
  assert.ok(b.score(space.id("pizza")).error);
  assert.ok(b.score(space.id("cheese")).score > 600);
  assert.ok(b.score(space.id("telescope")).score < 80);
  const t = new Bridge(space, ["bank", "flow", "bridge"]);
  assert.ok(t.top(8).includes("river"), t.top(8).join());
  assert.ok(t.score(space.id("river")).score > t.score(space.id("banana")).score);
  assert.equal(t.score(space.id("river")).links.length, 3);
});

test("bridge: a word that fits one clue but not the other scores low", () => {
  const b = new Bridge(space, ["pizza", "violin"]);
  assert.ok(b.score(space.id("cheese")).score < b.score(b.best).score);
  assert.ok(b.score(space.id("cheese")).links[0] > 3 * b.score(space.id("cheese")).links[1] || b.score(space.id("cheese")).links[1] < 100);
  assert.throws(() => new Bridge(space, ["zzzzqq"]), /not in the word list/);
});

test("fours: validation and judging", () => {
  const p = { groups: [0, 1, 2, 3].map(l => ({ title: "t" + l, level: l, words: ["a", "b", "c", "d"].map(x => x + l) })) };
  assert.deepEqual(validate(p), []);
  assert.ok(validate({ groups: p.groups.slice(1) }).length);
  const dup = structuredClone(p); dup.groups[1].words[0] = "a0"; assert.ok(validate(dup).some(e => /duplicate/.test(e)));
  assert.equal(judge(p, ["a0", "b0", "c0", "d0"]).correct, true);
  assert.deepEqual(judge(p, ["a0", "b0", "c0", "a1"]), { correct: false, oneAway: true });
  assert.deepEqual(judge(p, ["a0", "b0", "a1", "b1"]), { correct: false, oneAway: false });
  assert.ok(judge(p, ["a0", "a0", "b0", "c0"]).error);
});

test("shipped puzzle data is consistent", () => {
  const fours = JSON.parse(text("fours.json")); assert.ok(fours.length >= 15);
  fours.forEach((p, i) => assert.deepEqual(validate(p), [], "fours puzzle " + (i + 1)));
  const secrets = text("secrets.txt").split("\n").filter(Boolean); assert.ok(secrets.length > 1000);
  for (const s of secrets.slice(0, 300)) assert.ok(space.id(s) >= 0, s);
  const bridges = JSON.parse(text("bridges.json"));
  for (const [kind, n] of [["two", 2], ["three", 3], ["one", 1]]) {
    assert.ok(bridges[kind].length >= 40, kind);
    for (const p of bridges[kind]) { assert.equal(p.clues.length, n); for (const c of p.clues) assert.ok(space.id(c) >= 0, c); }
  }
});

test("shipped bridge puzzles: the game's own scoring agrees with the generator", () => {
  for (const kind of ["two", "three", "one"]) {
    for (const p of bridges(kind).filter((_, i) => i % 9 === 0)) {
      const b = new Bridge(space, p.clues);
      assert.ok(b.top(3).includes(p.answer), `${p.clues.join("+")} -> ${p.answer}, game says ${b.top(3).join()}`);
    }
  }
});
function bridges(kind) { return JSON.parse(text("bridges.json"))[kind]; }
