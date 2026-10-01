// QR Code encoder (byte mode, level M, versions 1-40). A port of hitchly/qr.py; tests/js/qr.test.mjs checks that
// both produce identical matrices. Runs in the browser, so QR contents (Wi-Fi passwords, contact cards) never leave it.
const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26,
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21,
  23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
export const MAX_VERSION = 40;

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z;
}
function rsDivisor(degree) {
  const result = new Array(degree).fill(0); result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) { result[j] = gfMul(result[j], root); if (j + 1 < degree) result[j] ^= result[j + 1]; }
    root = gfMul(root, 2);
  }
  return result;
}
function rsRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => { result[i] ^= gfMul(coef, factor); });
  }
  return result;
}

function rawDataModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) { const n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
  return r;
}
const dataCodewords = ver => Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];

function alignmentPositions(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.floor((ver * 4 + n * 2 + 1) / (n * 2 - 2)) * 2;
  const size = ver * 4 + 17;
  return [6, ...Array.from({ length: n - 1 }, (_, i) => size - 7 - i * step)].sort((a, b) => a - b);
}

function encodeData(bytes) {
  let ver = 1, countBits = 8;
  for (; ver <= MAX_VERSION; ver++) {
    countBits = ver <= 9 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCodewords(ver) * 8) break;
  }
  if (ver > MAX_VERSION) throw new Error("Too much data for a QR code (limit is about 2,300 bytes)");
  const capacityBits = dataCodewords(ver) * 8, bits = [];
  const put = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  put(0b0100, 4); put(bytes.length, countBits);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, capacityBits - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; data.length < capacityBits / 8; pad ^= 0xec ^ 0x11) data.push(pad);
  return [ver, data];
}

function addEccAndInterleave(ver, data) {
  const nBlocks = NUM_BLOCKS[ver], eccLen = ECC_PER_BLOCK[ver], raw = Math.floor(rawDataModules(ver) / 8);
  const nShort = nBlocks - (raw % nBlocks), shortLen = Math.floor(raw / nBlocks), divisor = rsDivisor(eccLen);
  const blocks = [];
  let k = 0;
  for (let i = 0; i < nBlocks; i++) {
    let dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < nShort) dat = dat.concat([0]);
    blocks.push(dat.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((blk, j) => { if (i !== shortLen - eccLen || j >= nShort) out.push(blk[i]); });
  return out;
}

class Grid {
  constructor(ver) {
    this.ver = ver; this.size = ver * 4 + 17;
    this.m = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    this.fn = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
  }
  setFn(x, y, dark) { this.m[y][x] = dark; this.fn[y][x] = true; }
  drawFunctionPatterns() {
    const s = this.size;
    for (let i = 0; i < s; i++) { this.setFn(6, i, i % 2 === 0); this.setFn(i, 6, i % 2 === 0); }
    for (const [cx, cy] of [[3, 3], [s - 4, 3], [3, s - 4]]) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < s && y >= 0 && y < s) this.setFn(x, y, ![2, 4].includes(Math.max(Math.abs(dx), Math.abs(dy))));
      }
    }
    const pos = alignmentPositions(this.ver), last = pos.length - 1;
    pos.forEach((px, i) => pos.forEach((py, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.setFn(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    this.drawFormat(0); this.drawVersion();
  }
  drawFormat(mask) {
    const data = mask; let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412, bit = i => ((bits >>> i) & 1) === 1, s = this.size;
    for (let i = 0; i < 6; i++) this.setFn(8, i, bit(i));
    this.setFn(8, 7, bit(6)); this.setFn(8, 8, bit(7)); this.setFn(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.setFn(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.setFn(s - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.setFn(8, s - 15 + i, bit(i));
    this.setFn(8, s - 8, true);
  }
  drawVersion() {
    if (this.ver < 7) return;
    let rem = this.ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1, a = this.size - 11 + (i % 3), b = Math.floor(i / 3);
      this.setFn(a, b, dark); this.setFn(b, a, dark);
    }
  }
  drawCodewords(data) {
    let i = 0; const s = this.size;
    for (let right = s - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < s; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, y = ((right + 1) & 2) === 0 ? s - 1 - vert : vert;
        if (!this.fn[y][x] && i < data.length * 8) { this.m[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
      }
    }
  }
  applyMask(mask) {
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
      const inv = [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
        ((x * y) % 2) + ((x * y) % 3) === 0, (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (((x + y) % 2) + ((x * y) % 3)) % 2 === 0][mask];
      if (inv && !this.fn[y][x]) this.m[y][x] = !this.m[y][x];
    }
  }
  penalty() {
    const s = this.size, m = this.m; let score = 0;
    const lines = [...m, ...Array.from({ length: s }, (_, x) => m.map(row => row[x]))];
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i < s; i++) {
        if (line[i] === line[i - 1]) { run++; if (run === 5) score += 3; else if (run > 5) score += 1; } else run = 1;
      }
      const text = line.map(v => (v ? "1" : "0")).join("");
      for (const pat of ["10111010000", "00001011101"]) {
        let at = text.indexOf(pat);
        while (at !== -1) { score += 40; at = text.indexOf(pat, at + 1); }
      }
    }
    for (let y = 0; y < s - 1; y++) for (let x = 0; x < s - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
    const dark = m.reduce((a, row) => a + row.filter(Boolean).length, 0), total = s * s;
    return score + (Math.floor((Math.abs(dark * 20 - total * 10) + total - 1) / total) - 1) * 10;
  }
}

/** Returns the module matrix (true = dark), without quiet zone. Throws if the text does not fit. */
export function encode(text) {
  const [ver, data] = encodeData(new TextEncoder().encode(text));
  const grid = new Grid(ver);
  grid.drawFunctionPatterns();
  grid.drawCodewords(addEccAndInterleave(ver, data));
  let best = 0, bestScore = null;
  for (let mask = 0; mask < 8; mask++) {
    grid.applyMask(mask); grid.drawFormat(mask);
    const score = grid.penalty();
    grid.applyMask(mask);
    if (bestScore === null || score < bestScore) { best = mask; bestScore = score; }
  }
  grid.applyMask(best); grid.drawFormat(best);
  return grid.m;
}

export function toSvg(matrix, { border = 4, scale = 8, dark = "#000", light = "#fff" } = {}) {
  const n = matrix.length + border * 2, parts = [];
  matrix.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      const start = x;
      while (x < row.length && row[x]) x++;
      parts.push(`M${start + border},${y + border}h${x - start}v1h-${x - start}z`);
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${n * scale}" height="${n * scale}" shape-rendering="crispEdges">` +
    `<rect width="${n}" height="${n}" fill="${light}"/><path d="${parts.join("")}" fill="${dark}"/></svg>`;
}

/** Render to a PNG data URL via canvas (browser only). */
export function toPngDataUrl(matrix, { border = 4, scale = 8 } = {}) {
  const n = matrix.length + border * 2, canvas = document.createElement("canvas");
  canvas.width = canvas.height = n * scale;
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#000";
  matrix.forEach((row, y) => row.forEach((v, x) => { if (v) g.fillRect((x + border) * scale, (y + border) * scale, scale, scale); }));
  return canvas.toDataURL("image/png");
}
