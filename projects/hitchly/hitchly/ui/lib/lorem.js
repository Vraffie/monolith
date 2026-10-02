const WORDS = ("lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud " +
  "exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat " +
  "cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum").split(" ");
const OPENING = "Lorem ipsum dolor sit amet, consectetur adipiscing elit";

export function mulberry32(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const cap = s => s[0].toUpperCase() + s.slice(1);

function sentence(rand, minWords = 6, maxWords = 14) {
  const n = minWords + Math.floor(rand() * (maxWords - minWords + 1)), w = Array.from({ length: n }, () => WORDS[Math.floor(rand() * WORDS.length)]);
  if (n > 8) w[3 + Math.floor(rand() * (n - 6))] += ",";
  return cap(w.join(" ").replace(/,\s*,/g, ",")) + ".";
}

/** unit: "words" | "sentences" | "paragraphs". The first sentence can start with the classic opening. */
export function lorem({ unit = "paragraphs", count = 3, classicStart = true } = {}, rand = Math.random) {
  if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error("Count must be between 1 and 1000");
  if (unit === "words") {
    const w = Array.from({ length: count }, () => WORDS[Math.floor(rand() * WORDS.length)]);
    if (classicStart) OPENING.toLowerCase().replace(",", "").split(" ").slice(0, count).forEach((x, i) => { w[i] = x; });
    return w.join(" ");
  }
  const makeSentences = n => Array.from({ length: n }, () => sentence(rand));
  if (unit === "sentences") {
    const s = makeSentences(count);
    if (classicStart) s[0] = OPENING + ".";
    return s.join(" ");
  }
  if (unit !== "paragraphs") throw new Error("Unit must be words, sentences or paragraphs");
  return Array.from({ length: count }, (_, i) => {
    const s = makeSentences(3 + Math.floor(rand() * 4));
    if (classicStart && i === 0) s[0] = OPENING + ".";
    return s.join(" ");
  }).join("\n\n");
}
