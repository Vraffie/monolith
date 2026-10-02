const words = text => text
  .normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
  .split(/[^A-Za-z0-9]+/).filter(Boolean);

export const CASES = {
  camelCase: t => words(t).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join(""),
  PascalCase: t => words(t).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(""),
  snake_case: t => words(t).map(w => w.toLowerCase()).join("_"),
  "kebab-case": t => words(t).map(w => w.toLowerCase()).join("-"),
  CONSTANT_CASE: t => words(t).map(w => w.toUpperCase()).join("_"),
  "Title Case": t => words(t).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" "),
  lowercase: t => t.toLowerCase(),
  UPPERCASE: t => t.toUpperCase(),
};

/** URL slug: lower-case ASCII letters, digits and single hyphens (fits Hitchly's slug rules once trimmed to 32). */
export function slugify(text, maxLength = 32) {
  return words(text).map(w => w.toLowerCase()).join("-").slice(0, maxLength).replace(/-+$/, "");
}

export function count(text) {
  const trimmed = text.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  return {
    characters: [...text].length,
    charactersNoSpaces: [...text.replace(/\s/g, "")].length,
    bytesUtf8: new TextEncoder().encode(text).length,
    words: wordCount,
    lines: text ? text.split("\n").length : 0,
    sentences: (trimmed.match(/[^.!?]+[.!?]+(\s|$)/g) || (trimmed ? [trimmed] : [])).length,
    readingMinutes: Math.max(wordCount ? 1 : 0, Math.round(wordCount / 230)),
  };
}
