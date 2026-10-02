// Shared helpers for gates: bigram hashing and color-literal scanning.

export function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function tokens(line) {
  return line
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

// Each input line is its own sequence; bigrams never cross lines.
export function bigramsOf(lines) {
  const out = new Map();
  for (const line of lines) {
    const t = tokens(line);
    for (let i = 0; i < t.length - 1; i++) out.set(`${t[i]} ${t[i + 1]}`, true);
  }
  return [...out.keys()];
}

// Color literals: hex colors, color functions, named colors. Plain 0x hex numbers are NOT colors.
const FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;
const HEX = /(^|[^0-9A-Za-z_&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const NAMED = /(?<![\w-])(?:white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|navy|teal|maroon|olive|lime|aqua|fuchsia|brown|gold|crimson|coral|salmon|tomato)(?![\w-])/gi;

export function colorLiterals(src, { scanNamed = false } = {}) {
  const hits = [];
  for (const re of [FN, HEX, ...(scanNamed ? [NAMED] : [])]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) hits.push(m[0].trim());
  }
  return hits;
}
