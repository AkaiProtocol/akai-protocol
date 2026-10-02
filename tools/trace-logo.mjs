// Traces the transparent logo PNG into vector paths from its real pixel grid.
// The PNG carries pure-black RGB under zero alpha, so every resize here is PREMULTIPLIED:
// colour is averaged as (rgb * alpha), alpha is averaged separately, then divided back out.
// Output: tools/logo-mark.json (read by scripts/favicon.mjs and pasted into index.html).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "./sample-brand.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "brand/LOGO AKAI PNG...png";
const FACTOR = 4;
const LIGHT = "#fd394f"; // snapped pixel, brand/LOGO AKAI PNG...png @989,622
const DARK = "#ca0e2f"; // snapped pixel, brand/LOGO AKAI PNG...png @1245,1073
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const buf = fs.readFileSync(path.join(ROOT, SRC));
const ih = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colorType: buf[25], interlace: buf[28] };
const px = decodePng(buf, ih);
const W = Math.floor(ih.width / FACTOR);
const H = Math.floor(ih.height / FACTOR);

// premultiplied box downsample
const alpha = new Float32Array(W * H);
const colour = new Float32Array(W * H * 3); // premultiplied
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let a = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let dy = 0; dy < FACTOR; dy++) {
      for (let dx = 0; dx < FACTOR; dx++) {
        const i = ((y * FACTOR + dy) * ih.width + x * FACTOR + dx) * 4;
        const al = px[i + 3] / 255;
        a += al;
        r += px[i] * al;
        g += px[i + 1] * al;
        b += px[i + 2] * al;
      }
    }
    const n = FACTOR * FACTOR;
    alpha[y * W + x] = a / n;
    colour[(y * W + x) * 3] = r / n;
    colour[(y * W + x) * 3 + 1] = g / n;
    colour[(y * W + x) * 3 + 2] = b / n;
  }
}

const L = rgb(LIGHT);
const D = rgb(DARK);
const dist = (c, t) => (c[0] - t[0]) ** 2 + (c[1] - t[1]) ** 2 + (c[2] - t[2]) ** 2;
const dark = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) {
  if (alpha[i] < 0.02) continue;
  const c = [colour[i * 3] / alpha[i], colour[i * 3 + 1] / alpha[i], colour[i * 3 + 2] / alpha[i]]; // un-premultiply
  dark[i] = dist(c, D) < dist(c, L) ? alpha[i] : 0;
}

function contours(field) {
  const hId = (x, y) => (y * W + x) * 2;
  const vId = (x, y) => (y * W + x) * 2 + 1;
  const pos = new Map();
  const at = (id) => {
    if (pos.has(id)) return pos.get(id);
    const vert = id & 1;
    const cell = id >> 1;
    const x = cell % W;
    const y = Math.floor(cell / W);
    const a = field[y * W + x];
    const b = vert ? field[(y + 1) * W + x] : field[y * W + x + 1];
    const t = a === b ? 0.5 : (0.5 - a) / (b - a);
    const p = vert ? [x, y + t] : [x + t, y];
    pos.set(id, p);
    return p;
  };
  const adj = new Map();
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  };
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = field[y * W + x] >= 0.5 ? 8 : 0;
      const tr = field[y * W + x + 1] >= 0.5 ? 4 : 0;
      const br = field[(y + 1) * W + x + 1] >= 0.5 ? 2 : 0;
      const bl = field[(y + 1) * W + x] >= 0.5 ? 1 : 0;
      const T = hId(x, y);
      const B = hId(x, y + 1);
      const Lf = vId(x, y);
      const R = vId(x + 1, y);
      switch (tl | tr | br | bl) {
        case 1: case 14: link(Lf, B); break;
        case 2: case 13: link(B, R); break;
        case 3: case 12: link(Lf, R); break;
        case 4: case 11: link(T, R); break;
        case 5: link(T, Lf); link(B, R); break;
        case 6: case 9: link(T, B); break;
        case 7: case 8: link(Lf, T); break;
        case 10: link(T, R); link(Lf, B); break;
        default: break;
      }
    }
  }
  const seen = new Set();
  const loops = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = -1;
    let cur = start;
    while (!seen.has(cur)) {
      seen.add(cur);
      loop.push(at(cur));
      const next = adj.get(cur).find((n) => n !== prev && !seen.has(n));
      if (next === undefined) break;
      prev = cur;
      cur = next;
    }
    loops.push(loop);
  }
  return loops;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  let bi = 0;
  let bd = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > bd) {
      bd = d;
      bi = i;
    }
  }
  if (bd <= eps) return [a, b];
  return [...rdp(pts.slice(0, bi + 1), eps).slice(0, -1), ...rdp(pts.slice(bi), eps)];
}

function simplifyClosed(loop, eps) {
  let far = 0;
  let fd = -1;
  for (let i = 0; i < loop.length; i++) {
    const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]);
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const rot = [...loop.slice(far), ...loop.slice(0, far)];
  const half = loop.length - far;
  const first = rdp(rot.slice(0, half + 1), eps);
  const second = rdp([...rot.slice(half), rot[0]], eps);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

const area = (p) => Math.abs(p.reduce((s, q, i) => s + (q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1]), 0) / 2);

function trace(field, minArea) {
  return contours(field)
    .map((l) => simplifyClosed(l, 1.1))
    .filter((p) => p.length >= 3 && area(p) >= minArea);
}

const shape = trace(alpha, 60);
const dk = trace(dark, 60);
const all = shape.flat();
const minX = Math.min(...all.map((p) => p[0]));
const maxX = Math.max(...all.map((p) => p[0]));
const minY = Math.min(...all.map((p) => p[1]));
const maxY = Math.max(...all.map((p) => p[1]));
const scale = 100 / (maxY - minY);
const norm = (p) => [(p[0] - minX) * scale, (p[1] - minY) * scale];
const d = (loops) => loops.map((l) => "M" + l.map(norm).map((q) => q.map((v) => +v.toFixed(2)).join(" ")).join("L") + "Z").join("");

const out = {
  source: SRC,
  method: `premultiplied ${FACTOR}x box downsample of the transparent PNG, marching squares at alpha 0.5, Douglas-Peucker 1.1px`,
  grid: [W, H],
  viewBox: [0, 0, +((maxX - minX) * scale).toFixed(2), 100],
  light: { fill: LIGHT, d: d(shape) },
  dark: { fill: DARK, d: d(dk) },
  loops: { shape: shape.length, dark: dk.length, points: shape.reduce((s, l) => s + l.length, 0) },
};
fs.writeFileSync(path.join(ROOT, "tools/logo-mark.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ viewBox: out.viewBox, loops: out.loops, light: out.light.d, dark: out.dark.d }, null, 1));
