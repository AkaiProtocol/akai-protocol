// Reads every file in brand/ and reference/, reports container facts, and samples a palette.
// PNG: decoded here (IHDR, alpha histogram, RGB under zero alpha). JPEG: decoded by the browser.
// Palette: k-means (k=8, RGB, deterministic farthest-point init, 12 iterations), each centroid
// snapped to the nearest real pixel (file + x,y). Output: tools/brand-sample.json
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["brand", "reference"];
const K = 8;
const hex = (r, g, b) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

function ihdr(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colorType: buf[25], interlace: buf[28] };
}

function jpegInfo(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), components: buf[i + 9], progressive: m === 0xc2 };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

export function decodePng(buf, h) {
  if (h.bitDepth !== 8 || h.interlace !== 0) throw new Error(`unsupported PNG: depth ${h.bitDepth}, interlace ${h.interlace}`);
  const chunks = [];
  let plte = null;
  let trns = null;
  for (let p = 8; p < buf.length; ) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IDAT") chunks.push(data);
    if (type === "PLTE") plte = data;
    if (type === "tRNS") trns = data;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[h.colorType];
  const bpp = ch;
  const stride = h.width * ch;
  const out = Buffer.alloc(stride * h.height);
  for (let y = 0; y < h.height; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  const rgba = new Uint8Array(h.width * h.height * 4);
  for (let i = 0; i < h.width * h.height; i++) {
    let r;
    let g;
    let b;
    let a = 255;
    if (h.colorType === 6) [r, g, b, a] = [out[i * 4], out[i * 4 + 1], out[i * 4 + 2], out[i * 4 + 3]];
    else if (h.colorType === 2) [r, g, b] = [out[i * 3], out[i * 3 + 1], out[i * 3 + 2]];
    else if (h.colorType === 0) r = g = b = out[i];
    else if (h.colorType === 4) {
      r = g = b = out[i * 2];
      a = out[i * 2 + 1];
    } else {
      const idx = out[i];
      [r, g, b] = [plte[idx * 3], plte[idx * 3 + 1], plte[idx * 3 + 2]];
      a = trns && idx < trns.length ? trns[idx] : 255;
    }
    rgba.set([r, g, b, a], i * 4);
  }
  return rgba;
}

export async function decodeJpeg(browser, buf) {
  const page = await browser.newPage();
  const res = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/jpeg;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let bin = "";
    for (let i = 0; i < d.length; i += 0x8000) bin += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
    return { w: c.width, h: c.height, data: btoa(bin) };
  }, buf.toString("base64"));
  await page.close();
  return { w: res.w, h: res.h, rgba: new Uint8Array(Buffer.from(res.data, "base64")) };
}

function kmeans(rgba, w, h) {
  const step = Math.max(1, Math.floor((w * h) / 30000));
  const pts = [];
  for (let i = 0; i < w * h; i += step) if (rgba[i * 4 + 3] > 0) pts.push([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);
  const d2 = (p, c) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
  let cent = [pts[0].slice()];
  while (cent.length < K) {
    let best = null;
    let bd = -1;
    for (const p of pts) {
      const d = Math.min(...cent.map((c) => d2(p, c)));
      if (d > bd) {
        bd = d;
        best = p;
      }
    }
    cent.push(best.slice());
  }
  let count = new Array(K).fill(0);
  for (let it = 0; it < 12; it++) {
    const sum = cent.map(() => [0, 0, 0]);
    count = new Array(K).fill(0);
    for (const p of pts) {
      let bi = 0;
      let bd = Infinity;
      cent.forEach((c, i) => {
        const d = d2(p, c);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      sum[bi][0] += p[0];
      sum[bi][1] += p[1];
      sum[bi][2] += p[2];
      count[bi]++;
    }
    cent = cent.map((c, i) => (count[i] ? sum[i].map((s) => s / count[i]) : c));
  }
  return cent
    .map((c, i) => {
      let bi = 0;
      let bd = Infinity;
      for (let p = 0; p < w * h; p++) {
        if (rgba[p * 4 + 3] < 255) continue;
        const d = d2([rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]], c);
        if (d < bd) {
          bd = d;
          bi = p;
        }
      }
      const [r, g, b] = [rgba[bi * 4], rgba[bi * 4 + 1], rgba[bi * 4 + 2]];
      return { share: +(count[i] / pts.length).toFixed(4), centroid: hex(...c.map(Math.round)), snapped: hex(r, g, b), x: bi % w, y: Math.floor(bi / w) };
    })
    .sort((a, b) => b.share - a.share);
}

async function main() {
  const report = [];
  let browser = null;
  for (const dir of DIRS) {
    for (const name of fs.readdirSync(path.join(ROOT, dir)).sort()) {
      const file = path.join(ROOT, dir, name);
      if (!fs.statSync(file).isFile()) continue;
      const buf = fs.readFileSync(file);
      const entry = { file: `${dir}/${name}`, bytes: buf.length };
      let px;
      const h = ihdr(buf);
      if (h) {
        entry.container = "png";
        entry.ihdr = h;
        px = { w: h.width, h: h.height, rgba: decodePng(buf, h) };
        const hist = new Array(8).fill(0);
        let blackClear = 0;
        let clear = 0;
        for (let i = 0; i < px.w * px.h; i++) {
          const a = px.rgba[i * 4 + 3];
          hist[a >> 5]++;
          if (a === 0) {
            clear++;
            if (!px.rgba[i * 4] && !px.rgba[i * 4 + 1] && !px.rgba[i * 4 + 2]) blackClear++;
          }
        }
        entry.alphaHistogram8 = hist;
        entry.fullyTransparent = clear;
        entry.pureBlackTransparent = blackClear;
      } else {
        entry.container = "jpeg";
        entry.jpeg = jpegInfo(buf);
        browser ||= await chromium.launch({ executablePath: process.env.EDGE_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true, timeout: 90000 });
        px = await decodeJpeg(browser, buf);
      }
      entry.size = [px.w, px.h];
      entry.kmeans = kmeans(px.rgba, px.w, px.h);
      report.push(entry);
      console.log(entry.file, entry.container, entry.size.join("x"), h ? `colourType=${h.colorType} depth=${h.bitDepth} alpha0=${entry.fullyTransparent} blackClear=${entry.pureBlackTransparent} alphaHist=${entry.alphaHistogram8}` : "");
      console.log("    ", entry.kmeans.map((k) => `${k.snapped}@${k.x},${k.y} ${(k.share * 100).toFixed(1)}%`).join("  "));
    }
  }
  await browser?.close();
  fs.writeFileSync(path.join(ROOT, "tools/brand-sample.json"), JSON.stringify({ method: "k-means k=8 RGB, farthest-point init, 12 iterations, snapped to nearest real pixel", files: report }, null, 1));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
