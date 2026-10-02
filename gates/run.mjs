// npm run gates - 30 gates max, synthetic fixtures only, fast clock, under five minutes.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { ADDR, EXPECT, dexBody, llamaBody, rpcBody } from "./fixtures.mjs";
import { bigramsOf, colorLiterals, fnv } from "./lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const BPS = [
  [360, 740],
  [390, 844],
  [430, 932],
  [1366, 768],
  [1440, 900],
];
const RPC_HOST = "rpc.mainnet.chain.robinhood.com";
const ALLOWED_HOSTS = new Set([RPC_HOST, "api.llama.fi", "api.dexscreener.com"]);
const STATED = {
  contract: { state: "stated", value: ADDR },
  x: { state: "stated", url: "https://x.com/akai_test" },
  github: { state: "stated", url: "https://github.com/akai-test/site" },
};
const HARD_LIMIT_MS = 285000;
setTimeout(() => {
  console.error("gates exceeded the time budget");
  process.exit(2);
}, HARD_LIMIT_MS).unref();

/* ---------- plumbing ---------- */
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
function walk(dir, skip = []) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (["node_modules", "dist"].includes(e.name)) continue;
    if (skip.includes(e.name)) continue;
    if (e.isDirectory()) out.push(...walk(full, skip));
    else out.push(full);
  }
  return out;
}
const rel = (f) => path.relative(ROOT, f).replaceAll("\\", "/");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/") p = "/index.html";
    const file = path.join(DIST, p);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("nope");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

function edgePath() {
  const c = [process.env.EDGE_PATH, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"].filter(Boolean);
  const hit = c.find((p) => fs.existsSync(p));
  assert.ok(hit, "no Chromium-family browser found; set EDGE_PATH");
  return hit;
}

let BASE;
let browser;
let ctx;
const pages = [];
const extra = [];

async function open({ w = 1440, h = 900, reduced = false, scheme = "light", register = null, rpc = "ok", tvl = "ok", pairs = "ok", hold = null, clock = false } = {}) {
  // The fake clock is context-wide, so clock gates get a context of their own.
  let host = ctx;
  if (clock) {
    host = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
    host.setDefaultTimeout(15000);
    extra.push(host);
  }
  const page = await host.newPage();
  pages.push(page);
  await page.bringToFront();
  await page.setViewportSize({ width: w, height: h });
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference", colorScheme: scheme });
  const fx = { block: 4200000, gasWei: 50000000, rpc, tvl, pairs, hold, blocked: [], seen: [], rpcMethods: new Set(), consoleErrors: [], pageErrors: [], failed: [] };
  page.on("console", (m) => m.type() === "error" && fx.consoleErrors.push(m.text()));
  page.on("pageerror", (e) => fx.pageErrors.push(String(e)));
  page.on("requestfailed", (r) => fx.failed.push(`${r.url()} ${r.failure()?.errorText}`));

  await page.route((u) => !u.href.startsWith(BASE), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    fx.seen.push(req.url());
    if (!ALLOWED_HOSTS.has(url.hostname)) {
      fx.blocked.push(req.url());
      return route.abort();
    }
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (fx.hold) await fx.hold;
    const json = (body, status = 200) => route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
    if (url.hostname === RPC_HOST) {
      const body = JSON.parse(req.postData() || "[]");
      (Array.isArray(body) ? body : [body]).forEach((c) => fx.rpcMethods.add(`${req.method()} ${c.method}`));
      return fx.rpc === "fail" ? json({ error: "down" }, 500) : json(rpcBody(body, { block: fx.block, gasWei: fx.gasWei }));
    }
    if (url.hostname === "api.llama.fi") return fx.tvl === "fail" ? json({ error: "down" }, 500) : json(llamaBody());
    return fx.pairs === "fail" ? json({ error: "down" }, 500) : json(dexBody({ empty: fx.pairs === "empty" }));
  });

  if (register) await page.addInitScript((r) => (window.__AKAI_REGISTER__ = r), register);
  if (clock) await page.clock.install();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
  page.fx = fx;
  return page;
}

const settled = (page) =>
  page.waitForFunction(() => document.querySelector('[data-num="block"]')?.dataset.state === "ok" && document.getElementById("pairs-table")?.dataset.state === "ready" && document.getElementById("spark")?.dataset.state === "ready", null, { timeout: 20000 });

let shared = null;
async function std() {
  if (!shared || shared.isClosed()) {
    shared = await open();
    await settled(shared);
  }
  await shared.bringToFront();
  await shared.setViewportSize({ width: 1440, height: 900 });
  await shared.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await shared.evaluate(() => window.scrollTo(0, 0));
  return shared;
}

const results = [];
async function gate(name, fn) {
  const t = Date.now();
  try {
    if (!browser.isConnected()) await launch();
    const limited = () => Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error("gate exceeded 60s")), 60000))]);
    try {
      await limited();
    } catch (e) {
      if (!/has been closed|browser has disconnected/i.test(String(e.message))) throw e;
      while (pages.length) pages.pop();
      shared = null;
      await launch();
      await limited();
    }
    results.push({ name, ok: true });
    console.log(`  PASS  ${name} (${Date.now() - t}ms)`);
  } catch (e) {
    results.push({ name, ok: false, err: e });
    console.log(`  FAIL  ${name} (${Date.now() - t}ms)\n        ${String(e.message).split("\n").join("\n        ")}`);
  } finally {
    while (extra.length) await extra.pop().close().catch(() => {});
    while (pages.length) {
      const p = pages.pop();
      if (p !== shared) await p.close().catch(() => {});
    }
  }
}

/* ---------- gates ---------- */
async function main() {
  const { server, base } = await serve();
  BASE = base;
  console.log("akai gates");

  /* 1 */ await gate("build output is complete", async () => {
    const html = read("dist/index.html");
    const refs = [...html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)].map((m) => m[1]);
    assert.ok(refs.some((r) => r.endsWith(".js")) && refs.some((r) => r.endsWith(".css")), "bundles not referenced");
    for (const r of refs) assert.ok(fs.existsSync(path.join(DIST, r)), `missing ${r}`);
    assert.ok(fs.existsSync(path.join(DIST, "favicon.svg")), "favicon missing");
  });

  /* 2 */ await gate("palette is sampled from the brand files, with provenance", async () => {
    const css = read("src/tokens.css");
    const sample = JSON.parse(read("tools/brand-sample.json"));
    const head = css.slice(0, css.indexOf("*/"));
    for (const word of [/k-means/i, /snap/i, /premultipl/i, /brand\//, /reference\//]) assert.match(head, word, "provenance comment lacks " + word);
    const body = css.slice(css.indexOf("*/") + 2);
    assert.equal(colorLiterals(body.replace(/#[0-9a-fA-F]{6}\b/g, "")).length, 0, "tokens.css holds a literal that is not a sampled hex");
    const stated = [...head.matchAll(/^ \*\s+--[\w-]+\s+(#[0-9a-f]{6})\s+(\S.*?)\s+@(\d+),(\d+)\s*$/gm)];
    assert.ok(stated.length >= 8, "provenance lines missing");
    for (const [, hexv, file, x, y] of stated) {
      const entry = sample.files.find((f) => f.file === file);
      assert.ok(entry, "unknown source file " + file);
      assert.ok(entry.kmeans.some((k) => k.snapped === hexv && k.x === Number(x) && k.y === Number(y)), hexv + " is not a snapped pixel at " + x + "," + y + " of " + file);
    }
    const used = new Set([...body.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()));
    const listed = new Set(stated.map((m) => m[1]));
    assert.deepEqual([...used].filter((u) => !listed.has(u)), [], "literal without provenance");
    const png = sample.files.find((f) => f.file === "brand/LOGO AKAI PNG...png");
    assert.ok(png.pureBlackTransparent > 0, "sampling run did not record the black-transparent region");
    assert.match(JSON.parse(read("tools/logo-mark.json")).method, /premultiplied/, "logo was not resized premultiplied");
  });

  /* 3 */ await gate("color literals live only in tokens.css", async () => {
    const files = [...walk(path.join(ROOT, "src")), path.join(ROOT, "index.html")].filter((f) => !f.endsWith("tokens.css") && /\.(css|js|html)$/.test(f));
    const bad = files.flatMap((f) => colorLiterals(read(rel(f)), { scanNamed: true }).map((h) => `${rel(f)}: ${h}`));
    assert.deepEqual(bad, []);
  });

  /* 4 */ await gate("no ch units anywhere", async () => {
    const files = [...walk(path.join(ROOT, "src")), path.join(ROOT, "index.html")];
    const bad = files.filter((f) => /\d\s?ch\b/.test(read(rel(f))));
    assert.deepEqual(bad.map(rel), []);
  });

  /* 5 */ await gate("repo hygiene (no agent files, no AI attribution)", async () => {
    const all = walk(ROOT);
    const names = all.map((f) => path.basename(f).toLowerCase());
    assert.ok(!names.includes("claude.md"), "CLAUDE.md present");
    assert.ok(!fs.existsSync(path.join(ROOT, ".claude")), ".claude/ present");
    const banned = new RegExp(["clau" + "de", "anthro" + "pic", "co-authored" + "-by", "generated (?:with|by)", "ai[- ]generated", "chat" + "gpt", "copi" + "lot"].join("|"), "i");
    const hits = all.filter((f) => /\.(js|mjs|css|html|json|md|txt|svg)$/.test(f) && !f.endsWith("package-lock.json") && !f.endsWith("run.mjs")).filter((f) => banned.test(fs.readFileSync(f, "utf8")));
    assert.deepEqual(hits.map(rel), []);
  });

  const reg = await import(pathToFileURL(path.join(ROOT, "src/register.js")).href);
  const withOverrides = (o) => {
    globalThis.window = { __AKAI_REGISTER__: o };
    try {
      return reg.loadRegister();
    } finally {
      delete globalThis.window;
    }
  };

  /* 6 */ await gate("register records: one shape, three states", async () => {
    const r = reg.loadRegister();
    assert.equal(new Set(r.map((x) => x.id)).size, r.length, "duplicate ids");
    for (const x of r) {
      assert.deepEqual(Object.keys(x).sort(), ["date", "id", "label", "note", "state", "url", "value"], `shape of ${x.id}`);
      assert.ok(reg.STATES.includes(x.state), `${x.id} state`);
      if (x.state === "absent") assert.ok(x.value === null && x.url === null, `${x.id} absent but carries data`);
      if (x.state === "stated") assert.ok(x.value || x.url, `${x.id} stated without value or url`);
    }
    assert.equal(reg.byId(r, "contract").state, "absent");
    assert.equal(reg.byId(r, "contract").date, null, "a date is attached to an absent record");
    for (const id of ["x", "github"]) {
      assert.equal(reg.byId(r, id).state, "stated");
      assert.equal(reg.byId(r, id).date, "2026-10-02");
    }
    assert.equal(reg.byId(r, "x").url, "https://x.com/Akai_Labs");
    assert.equal(reg.byId(r, "github").url, "https://github.com/AkaiProtocol/akai-protocol");
  });

  /* 7 */ await gate("link rule: URL stored, handle derived, no href unless stated", async () => {
    const none = reg.loadRegister();
    for (const id of ["contract", "palette", "mark"]) assert.equal(reg.hrefFor(reg.byId(none, id)), null, id);
    assert.equal(reg.hrefFor(reg.byId(none, "x")), "https://x.com/Akai_Labs");
    assert.equal(reg.deriveHandle(reg.byId(none, "x").url, "x"), "@Akai_Labs");
    assert.equal(reg.deriveHandle(reg.byId(none, "github").url, "github"), "AkaiProtocol");
    const gone = withOverrides({ x: { state: "absent" }, github: { state: "absent" } });
    for (const id of ["x", "github"]) assert.equal(reg.hrefFor(reg.byId(gone, id)), null, id);
    const on = withOverrides({ x: { state: "stated", url: "https://x.com/akai_test?ref=1" }, github: { state: "stated", url: "https://github.com/akai-test/site" } });
    assert.equal(reg.hrefFor(reg.byId(on, "x")), "https://x.com/akai_test?ref=1");
    assert.equal(reg.deriveHandle(reg.byId(on, "x").url, "x"), "@akai_test");
    assert.equal(reg.deriveHandle(reg.byId(on, "github").url, "github"), "akai-test");
    assert.ok(!on.some((x) => "handle" in x), "a handle was stored");
    const wrongHost = withOverrides({ x: { state: "stated", url: "https://example.org/akai" } });
    assert.equal(reg.byId(wrongHost, "x").state, "unconfirmed");
    assert.equal(reg.hrefFor(reg.byId(wrongHost, "x")), null);
    const insecure = withOverrides({ github: { state: "stated", url: "http://github.com/akai" } });
    assert.equal(reg.byId(insecure, "github").state, "unconfirmed");
    const stale = withOverrides({ x: { state: "absent", url: "https://x.com/leftover" } });
    assert.equal(reg.byId(stale, "x").url, null);
    const html = read("index.html");
    assert.ok(!/<[^>]*data-social[^>]*href=/.test(html) && !/<[^>]*id="ca-btn"[^>]*href=/.test(html), "static markup carries an href for unstated records");
  });

  /* 8 */ await gate("0x hex is never blanket-rejected", async () => {
    for (const ok of [ADDR, ADDR.toLowerCase(), "0x" + "F".repeat(40), "0x" + "0".repeat(40)]) assert.ok(reg.isAddress(ok), ok);
    for (const no of ["0x" + "a".repeat(39), "0x" + "a".repeat(41), "0x" + "g".repeat(40), "a".repeat(40), "0X" + "a".repeat(40)]) assert.ok(!reg.isAddress(no), no);
    assert.deepEqual(colorLiterals(`const n = 0x1f2e3d; const a = "${ADDR}"; const h = "0x${"ab".repeat(32)}";`, { scanNamed: true }), [], "scanner flagged plain 0x hex");
    assert.equal(withOverrides({ contract: { state: "stated", value: ADDR } }).find((r) => r.id === "contract").state, "stated");
    assert.equal(withOverrides({ contract: { state: "stated", value: "0x1234" } }).find((r) => r.id === "contract").state, "unconfirmed");
  });

  /* 9 */ await gate("page loads clean with synthetic data", async () => {
    const page = await std();
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 30));
      }
    });
    assert.deepEqual(page.fx.pageErrors, []);
    assert.deepEqual(page.fx.consoleErrors, []);
    assert.deepEqual(page.fx.failed, []);
  });

  const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  /* 10 */ await gate("no horizontal overflow at 360/390/430/1366/1440", async () => {
    const bad = [];
    for (const register of [null, STATED]) {
      const page = await open({ register });
      await settled(page);
      for (const [w, h] of BPS) {
        await page.setViewportSize({ width: w, height: h });
        await frames(page);
        const found = await page.evaluate(() => {
          const vw = innerWidth;
          const out = [];
          if (document.documentElement.scrollWidth > vw) out.push(`document ${document.documentElement.scrollWidth}`);
          for (const el of document.body.querySelectorAll("*")) {
            if (el.closest("[data-marquee], .hero__bg, .sr-only, .skip")) continue;
            if (!el.checkVisibility({ visibilityProperty: true })) continue;
            const r = el.getBoundingClientRect();
            if (!r.width) continue;
            if (r.right > vw + 0.5 || r.left < -0.5) out.push(`${el.tagName}.${el.className} ${Math.round(r.left)}..${Math.round(r.right)}`);
          }
          return out.slice(0, 5);
        });
        if (found.length) bad.push(`${w}${register ? " stated" : ""}: ${found.join(" | ")}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  /* 11 */ await gate("tap targets are at least 48px at all five widths", async () => {
    const bad = [];
    for (const register of [null, STATED]) {
      const page = await open({ register });
      await settled(page);
      for (const [w, h] of BPS) {
        await page.setViewportSize({ width: w, height: h });
        await frames(page);
        if (w < 900) await page.click("#menu-btn");
        const found = await page.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll('a[href], button, summary, [role="button"], input, select, textarea')) {
            if (!el.checkVisibility({ visibilityProperty: true })) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 47.5 || r.height < 47.5) out.push(`${el.tagName}.${el.className || el.id} ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
          return out.slice(0, 6);
        });
        if (found.length) bad.push(`${w}${register ? " stated" : ""}: ${found.join(" | ")}`);
        if (w < 900) await page.click("#menu-btn");
      }
    }
    assert.deepEqual(bad, []);
  });

  /* 12 */ await gate("contract slot, absent: pinned, full-width, inert, no date", async () => {
    const page = await std();
    for (const [w, h] of [BPS[0], BPS[4]]) {
      await page.setViewportSize({ width: w, height: h });
      await frames(page);
      await page.evaluate(() => navigator.clipboard.writeText("sentinel"));
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const info = await page.evaluate(() => {
        const btn = document.getElementById("ca-btn");
        const bar = document.getElementById("ca-bar").getBoundingClientRect();
        return { disabled: btn.disabled, state: btn.dataset.state, value: document.getElementById("ca-value").textContent, hint: document.getElementById("ca-hint").textContent, top: bar.top, bottom: bar.bottom, href: btn.getAttribute("href"), text: document.body.innerText };
      });
      assert.equal(info.disabled, true);
      assert.equal(info.state, "absent");
      assert.match(info.value, /^0x\u00b7{40}$/, "placeholder must not look like an address");
      assert.equal(info.hint, "Not stated yet");
      assert.ok(info.top >= -0.5 && info.bottom <= 130, `slot not pinned (${info.top}..${info.bottom}) at ${w}`);
      assert.equal(info.href, null);
      await page.click("#ca-btn", { force: true, timeout: 1500 }).catch(() => {});
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "sentinel", "inert slot touched the clipboard");
      assert.equal(await page.evaluate(() => document.getElementById("ca-btn").classList.contains("is-copied")), false);
      const row = await page.evaluate(() => document.getElementById("ca-bar").innerText + " " + document.querySelector('[data-record="contract"]').innerText);
      assert.doesNotMatch(row, /\b20\d{2}\b|\b\d{4}-\d{2}-\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}\b/i, "a date is showing while the record is absent");
    }
  });

  /* 13 */ await gate("contract slot, stated: full address, click copies, resets", async () => {
    const page = await open({ clock: true, register: STATED });
    await settled(page);
    for (const [w, h] of [BPS[0], BPS[4]]) {
      await page.setViewportSize({ width: w, height: h });
      await frames(page);
      const info = await page.evaluate(() => {
        const v = document.getElementById("ca-value");
        const b = document.getElementById("ca-btn");
        return { text: v.textContent, hidden: v.getAttribute("aria-hidden"), clipped: v.scrollWidth > v.clientWidth + 1, right: v.getBoundingClientRect().right, disabled: b.disabled, state: b.dataset.state };
      });
      assert.equal(info.text, ADDR, "address must be shown in full");
      assert.equal(info.hidden, null);
      assert.equal(info.clipped, false);
      assert.ok(info.right <= w, "address escapes the viewport");
      assert.equal(info.disabled, false);
      assert.equal(info.state, "stated");
      await page.evaluate(() => navigator.clipboard.writeText("sentinel"));
      await page.click("#ca-btn");
      await page.waitForFunction(() => document.getElementById("ca-btn").classList.contains("is-copied"));
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), ADDR);
      assert.equal(await page.textContent("#ca-hint"), "Copied");
      await page.clock.runFor(2200);
      await page.waitForFunction(() => !document.getElementById("ca-btn").classList.contains("is-copied"));
      assert.equal(await page.textContent("#ca-hint"), "Click to copy");
    }
  });

  /* 14 */ await gate("socials: icon-only top right, wired from the register", async () => {
    const off = await open({ register: { x: { state: "absent" }, github: { state: "absent" } } });
    const a = await off.evaluate(() => {
      const brand = document.querySelector(".brand").getBoundingClientRect();
      return [...document.querySelectorAll("[data-social]")].map((b) => ({ tag: b.tagName, disabled: b.disabled, href: b.getAttribute("href"), text: b.textContent.trim(), left: b.getBoundingClientRect().left, brandRight: brand.right }));
    });
    assert.equal(a.length, 2);
    for (const s of a) {
      assert.equal(s.tag, "BUTTON");
      assert.equal(s.disabled, true);
      assert.equal(s.href, null);
      assert.equal(s.text, "", "icon-only");
      assert.ok(s.left > 700 && s.left > s.brandRight, "not at the top right");
    }
    const on = await std();
    const b = await on.evaluate(() => {
      const brand = document.querySelector(".brand").getBoundingClientRect();
      return [...document.querySelectorAll("[data-social]")].map((n) => ({ tag: n.tagName, href: n.getAttribute("href"), rel: n.rel, target: n.target, label: n.getAttribute("aria-label"), text: n.textContent.trim(), left: n.getBoundingClientRect().left, brandRight: brand.right }));
    });
    assert.deepEqual(b.map((n) => n.tag), ["A", "A"]);
    assert.equal(b[0].href, "https://x.com/Akai_Labs");
    assert.equal(b[1].href, "https://github.com/AkaiProtocol/akai-protocol");
    assert.match(b[0].label, /@Akai_Labs/);
    assert.match(b[1].label, /AkaiProtocol/);
    for (const n of b) {
      assert.match(n.rel, /noopener/);
      assert.equal(n.target, "_blank");
      assert.equal(n.text, "");
      assert.ok(n.left > 700 && n.left > n.brandRight, "not at the top right");
    }
  });

  /* 15 */ await gate("skeletons first, then live values from fixtures", async () => {
    let release;
    const hold = new Promise((r) => (release = r));
    const page = await open({ hold });
    const during = await page.evaluate(() => ({
      nums: [...document.querySelectorAll(".num")].filter((n) => n.dataset.num !== "chainid").every((n) => n.dataset.state === "loading"),
      trail: document.getElementById("trail").dataset.state,
      spark: document.getElementById("spark").dataset.state,
      table: document.getElementById("pairs-table").dataset.state,
      rows: document.querySelectorAll(".row--skeleton").length,
      chips: document.querySelectorAll(".chip--skeleton").length,
      busy: document.querySelectorAll('[aria-busy="true"]').length,
      pill: document.getElementById("status-pill").dataset.state,
    }));
    assert.deepEqual(during, { nums: true, trail: "loading", spark: "loading", table: "loading", rows: 5, chips: 16, busy: during.busy, pill: "connecting" });
    assert.ok(during.busy >= 5);
    release();
    await settled(page);
    await page.evaluate(() => document.getElementById("pulse").scrollIntoView());
    await page.waitForFunction((e) => document.querySelector('[data-num="block"]').textContent === e.block && document.querySelector('[data-num="gas"]').textContent === e.gas && document.querySelector('[data-num="tvl"]').textContent === e.tvl, EXPECT, { timeout: 8000 });
    const after = await page.evaluate(() => ({
      chain: document.querySelector('[data-num="chainid"]').textContent,
      note: document.getElementById("chain-note").textContent,
      pill: document.getElementById("status-pill").dataset.state,
      pillText: document.getElementById("status-text").textContent,
      names: [...document.querySelectorAll(".row .row__name b")].map((n) => n.textContent),
      sets: document.querySelectorAll(".tape__set").length,
      chips: document.querySelectorAll(".tape__set:first-child .chip").length,
      hiddenSet: document.querySelectorAll('.tape__set[aria-hidden="true"]').length,
      bars: document.querySelectorAll(".trail__bar").length,
      trail: document.getElementById("trail").dataset.state,
      path: document.getElementById("spark-line").getAttribute("d").length,
      busy: document.querySelectorAll('[aria-busy="true"]').length,
    }));
    assert.equal(after.chain, EXPECT.chainid);
    assert.equal(after.note, "Matches the node");
    assert.equal(after.pill, "live");
    assert.equal(after.pillText, "Live");
    assert.deepEqual(after.names, EXPECT.pairs);
    assert.equal(after.sets, 2);
    assert.equal(after.hiddenSet, 1);
    assert.equal(after.chips, 9);
    assert.equal(after.bars, 32);
    assert.equal(after.trail, "ready");
    assert.ok(after.path > 50);
    assert.equal(after.busy, 0);
  });

  /* 16 */ await gate("count-up on first reveal, flash on a changed value (fast clock)", async () => {
    const page = await open({ clock: true });
    await settled(page);
    assert.equal(await page.evaluate(() => document.querySelectorAll(".is-flash").length), 0, "flash before any change");
    await page.evaluate(() => document.getElementById("pulse").scrollIntoView());
    await page.waitForFunction(() => document.querySelector('[data-num="block"]')._counted === true);
    await page.clock.runFor(1500);
    assert.equal(await page.textContent('[data-num="block"]'), EXPECT.block);
    page.fx.block = 4200777;
    await page.clock.runFor(5200);
    await page.waitForFunction(() => document.querySelector('[data-num="block"]').classList.contains("is-flash"));
    await page.clock.runFor(1000);
    await page.waitForFunction(() => document.querySelector('[data-num="block"]').textContent === "4,200,777");
    assert.match(await page.textContent("#sync"), /^Node answered /);
  });

  /* 17 */ await gate("failure and empty states degrade honestly", async () => {
    const down = await open({ rpc: "fail", tvl: "fail", pairs: "fail" });
    await down.waitForFunction(() => document.getElementById("status-pill").dataset.state === "offline", null, { timeout: 20000 });
    const d = await down.evaluate(() => ({
      block: document.querySelector('[data-num="block"]').textContent,
      blockState: document.querySelector('[data-num="block"]').dataset.state,
      tvl: document.querySelector('[data-num="tvl"]').textContent,
      chain: document.querySelector('[data-num="chainid"]').textContent,
      note: document.getElementById("chain-note").textContent,
      empty: !document.getElementById("pairs-empty").hidden,
      tape: document.querySelector(".tape").hidden,
      busy: document.querySelectorAll('[aria-busy="true"]').length,
      text: document.getElementById("status-text").textContent,
      sync: document.getElementById("sync").textContent,
    }));
    assert.deepEqual(d, { block: "\u2014", blockState: "empty", tvl: "\u2014", chain: "4663", note: "Recorded value, node silent", empty: true, tape: true, busy: 0, text: "Offline", sync: "The node is not answering." });
    assert.deepEqual(down.fx.pageErrors, []);

    const none = await open({ pairs: "empty" });
    await none.waitForFunction(() => !document.getElementById("pairs-empty").hidden, null, { timeout: 20000 });
    assert.equal(await none.evaluate(() => document.querySelector(".tape").hidden), true);
    await none.waitForFunction(() => document.getElementById("status-pill").dataset.state === "live");

    const part = await open({ pairs: "fail" });
    await part.waitForFunction(() => document.getElementById("status-pill").dataset.state === "degraded", null, { timeout: 20000 });
    assert.equal(await part.textContent("#status-text"), "Partial");
  });

  /* 18 */ await gate("status pill: pulsing dot while live, still when offline", async () => {
    const live = await std();
    await live.waitForFunction(() => document.getElementById("status-pill").dataset.state === "live");
    assert.ok(await live.evaluate(() => document.querySelector(".pill__dot").getAnimations().some((a) => a.animationName === "pulse" && a.playState === "running")));
    const off = await open({ rpc: "fail", tvl: "fail", pairs: "fail" });
    await off.waitForFunction(() => document.getElementById("status-pill").dataset.state === "offline", null, { timeout: 20000 });
    assert.equal(await off.evaluate(() => document.querySelector(".pill__dot").getAnimations().length), 0);
  });

  /* 19 */ await gate("scroll progress bar and parallax depth", async () => {
    const page = await std();
    await frames(page);
    assert.equal(Number(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--p") || "0")), 0);
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--sy").trim() === "600");
    const ty = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector(".hero__disc")).transform).m42);
    assert.ok(ty < -250 && ty > -350, `disc translateY ${ty}`);
    const tyBack = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector(".hero__grid")).transform).m42);
    assert.ok(Math.abs(tyBack) < Math.abs(ty), "layers must move at different depths");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.getElementById("progress")).transform).a > 0.98);
  });

  /* 20 */ await gate("scroll reveal with staggered entrances", async () => {
    const page = await open();
    await settled(page);
    assert.equal(await page.evaluate(() => document.querySelectorAll(".step.is-in").length), 0, "below-fold steps revealed too early");
    await page.evaluate(() => document.getElementById("method").scrollIntoView());
    await page.waitForFunction(() => document.querySelectorAll(".step.is-in").length === 4, null, { timeout: 5000 });
    const delays = await page.evaluate(() => [...document.querySelectorAll(".step")].map((s) => parseFloat(getComputedStyle(s).transitionDelay)));
    assert.ok(delays.every((d, i) => i === 0 || d > delays[i - 1]) || delays.every((d) => d === 0), `delays ${delays}`);
    const hero = await page.evaluate(() => [...document.querySelectorAll(".hero [data-reveal]")].map((e) => e.style.getPropertyValue("--i")));
    assert.deepEqual(hero, ["0", "1", "2", "3"]);
    await page.waitForFunction(() => document.querySelectorAll(".step.is-done").length === 4, null, { timeout: 5000 });
  });

  /* 21 */ await gate("prefers-reduced-motion: everything lands instantly", async () => {
    const page = await open({ reduced: true });
    await settled(page);
    await page.waitForFunction(() => document.getAnimations().length === 0, null, { timeout: 4000 }).catch(() => {});
    const r = await page.evaluate(() => ({
      reveal: [...document.querySelectorAll("[data-reveal]")].every((e) => e.classList.contains("is-in") && getComputedStyle(e).opacity === "1" && getComputedStyle(e).transform === "none"),
      anims: document.getAnimations().length,
      trans: Math.max(...[...document.querySelectorAll(".btn, .chip, .card, .nav__link")].map((e) => parseFloat(getComputedStyle(e).transitionDuration))),
      track: getComputedStyle(document.getElementById("tape-track")).animationName,
      dupSet: getComputedStyle(document.querySelector('.tape__set[aria-hidden="true"]')).display,
      block: document.querySelector('[data-num="block"]').textContent,
      counted: document.querySelector('[data-num="block"]')._counted,
      flash: document.querySelectorAll(".is-flash").length,
    }));
    assert.equal(r.reveal, true);
    assert.equal(r.anims, 0, "running animations under reduced motion");
    assert.ok(r.trans <= 0.001, `transition ${r.trans}`);
    assert.equal(r.track, "none");
    assert.equal(r.dupSet, "none");
    assert.equal(r.block, EXPECT.block);
    assert.equal(r.counted, true);
    await page.evaluate(() => window.scrollTo(0, 700));
    await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".hero__disc")).transform), "none");
  });

  /* 22 */ await gate("theme: light, dark, system; persisted", async () => {
    const page = await open({ scheme: "dark" });
    const get = () => page.evaluate(() => ({ theme: document.documentElement.dataset.theme, pref: document.documentElement.dataset.pref, stored: localStorage.getItem("akai-theme"), bg: getComputedStyle(document.body).backgroundColor, meta: document.querySelector('meta[name="theme-color"]').content }));
    const first = await get();
    assert.deepEqual([first.theme, first.pref, first.stored], ["dark", "system", null]);
    assert.ok(first.meta.length > 3, "theme-color not set");
    await page.locator('[data-theme-set="light"]').evaluate((b) => b.click());
    const light = await get();
    assert.deepEqual([light.theme, light.stored], ["light", "light"]);
    assert.notEqual(light.bg, first.bg);
    await page.reload();
    assert.equal((await get()).theme, "light");
    assert.equal(await page.getAttribute('[data-theme-set="light"]', "aria-pressed"), "true");
    await page.locator('[data-theme-set="dark"]').evaluate((b) => b.click());
    assert.equal((await get()).theme, "dark");
    await page.locator('[data-theme-set="system"]').evaluate((b) => b.click());
    const sys = await get();
    assert.deepEqual([sys.theme, sys.stored], ["dark", null]);
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
  });

  /* 23 */ await gate("faq accordion opens and closes", async () => {
    const page = await std();
    await page.evaluate(() => document.getElementById("faq").scrollIntoView());
    const items = page.locator(".faq__item");
    await items.nth(0).locator("summary").click();
    await page.waitForFunction(() => document.querySelector(".faq__item").open && document.querySelector(".faq__item").classList.contains("is-open"));
    await items.nth(1).locator("summary").click();
    await page.waitForFunction(() => document.querySelectorAll(".faq__item.is-open").length === 2);
    const h = await page.evaluate(() => document.querySelector(".faq__item .faq__a").getBoundingClientRect().height);
    assert.ok(h > 20, "answer has no height when open");
    await items.nth(0).locator("summary").click();
    await page.waitForFunction(() => !document.querySelector(".faq__item").open, null, { timeout: 3000 });
    assert.equal(await page.evaluate(() => document.querySelectorAll(".faq__item[open]").length), 1);
  });

  /* 24 */ await gate("menu: collapsed on phones, inline on desktop", async () => {
    const phone = await open({ w: 360, h: 740 });
    const vis = (sel) => phone.evaluate((s) => document.querySelector(s).checkVisibility({ visibilityProperty: true }), sel);
    assert.equal(await vis("#menu-btn"), true);
    assert.equal(await vis("#menu"), false);
    await phone.click("#menu-btn");
    await phone.waitForFunction(() => document.getElementById("menu").checkVisibility({ visibilityProperty: true }));
    assert.equal(await phone.getAttribute("#menu-btn", "aria-expanded"), "true");
    await phone.keyboard.press("Escape");
    await phone.waitForFunction(() => document.getElementById("menu-btn").getAttribute("aria-expanded") === "false");
    await phone.click("#menu-btn");
    await phone.click('#menu a[href="#faq"]');
    await phone.waitForFunction(() => document.getElementById("menu-btn").getAttribute("aria-expanded") === "false");
    const desk = await std();
    assert.equal(await desk.evaluate(() => document.getElementById("menu-btn").checkVisibility({ visibilityProperty: true })), false);
    assert.equal(await desk.evaluate(() => [...document.querySelectorAll("#menu a")].every((a) => a.checkVisibility({ visibilityProperty: true }))), true);
  });

  /* 25 */ await gate("network: only the three live sources, nothing else", async () => {
    const page = await std();
    await page.waitForTimeout(300);
    assert.deepEqual(page.fx.blocked, []);
    const hosts = new Set(page.fx.seen.map((u) => new URL(u).host));
    const extra = [...hosts].filter((h) => !h.startsWith("127.0.0.1") && !ALLOWED_HOSTS.has(h));
    assert.deepEqual(extra, []);
    for (const h of ALLOWED_HOSTS) assert.ok(hosts.has(h), `${h} never called`);
    for (const m of ["POST eth_chainId", "POST eth_blockNumber", "POST eth_gasPrice", "POST eth_feeHistory"]) assert.ok(page.fx.rpcMethods.has(m), m);
    assert.ok(!page.fx.seen.some((u) => /[?&](address|wallet|addr)=/i.test(u)));
  });

  /* 26 */ await gate("accessibility basics", async () => {
    const page = await open();
    const r = await page.evaluate(() => {
      const names = [];
      for (const el of document.querySelectorAll("a[href], button, summary")) {
        const n = (el.getAttribute("aria-label") || el.textContent || "").trim();
        if (!n) names.push(el.outerHTML.slice(0, 60));
      }
      const levels = [...document.querySelectorAll("h1,h2,h3")].map((h) => Number(h.tagName[1]));
      const jumps = levels.filter((l, i) => i && l - levels[i - 1] > 1);
      return {
        lang: document.documentElement.lang,
        h1: document.querySelectorAll("h1").length,
        landmarks: ["main", "header", "footer", "nav"].map((t) => document.querySelectorAll(t).length > 0),
        unnamed: names,
        jumps,
        skipFirst: document.querySelector("a[href], button").classList.contains("skip"),
        imgNoAlt: [...document.images].filter((i) => !i.hasAttribute("alt")).length,
      };
    });
    assert.equal(r.lang, "en");
    assert.equal(r.h1, 1);
    assert.deepEqual(r.landmarks, [true, true, true, true]);
    assert.deepEqual(r.unnamed, []);
    assert.deepEqual(r.jumps, []);
    assert.equal(r.skipFirst, true);
    assert.equal(r.imgNoAlt, 0);
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement);
      return { cls: document.activeElement.className, outline: cs.outlineStyle, w: parseFloat(cs.outlineWidth) };
    });
    assert.ok(focus.cls.includes("skip") && focus.outline !== "none" && focus.w >= 2, JSON.stringify(focus));
  });

  /* 27 */ await gate("rendered colors stay inside the sampled hue family, both themes", async () => {
    const css = read("src/tokens.css");
    const hues = [...new Set([...css.slice(css.indexOf("*/")).matchAll(/#([0-9a-f]{6})\b/gi)].map((m) => m[1]))]
      .map((h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)))
      .map(([r, gg, b]) => {
        const max = Math.max(r, gg, b);
        const min = Math.min(r, gg, b);
        if ((max - min) / 255 < 0.08) return null;
        const d = max - min;
        const h = max === r ? ((gg - b) / d) % 6 : max === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
        return (h * 60 + 360) % 360;
      })
      .filter((h) => h !== null);
    assert.ok(hues.length >= 4, "no chromatic tokens found");
    const page = await std();
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForFunction((s) => document.documentElement.dataset.theme === s, scheme);
      const bad = await page.evaluate((allowed) => {
        const cx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
        cx.canvas.width = cx.canvas.height = 1;
        const rgba = (c) => {
          cx.clearRect(0, 0, 1, 1);
          cx.fillStyle = "#000";
          cx.fillStyle = c;
          cx.fillRect(0, 0, 1, 1);
          return cx.getImageData(0, 0, 1, 1).data;
        };
        const out = new Set();
        for (const el of document.body.querySelectorAll("*")) {
          const cs = getComputedStyle(el);
          const probes = [["color", cs.color], ["bg", cs.backgroundColor]];
          if (parseFloat(cs.borderTopWidth) > 0) probes.push(["border", cs.borderTopColor]);
          if (cs.fill && cs.fill !== "none") probes.push(["fill", cs.fill]);
          if (cs.stroke && cs.stroke !== "none") probes.push(["stroke", cs.stroke]);
          for (const [k, v] of probes) {
            if (!/^(rgb|oklch|color)/.test(v)) continue;
            const d = rgba(v);
            if (d[3] < 64) continue;
            const [r, gg, b] = d;
            const max = Math.max(r, gg, b);
            const min = Math.min(r, gg, b);
            if ((max - min) / 255 < 0.08) continue;
            const dd = max - min;
            const hh = max === r ? ((gg - b) / dd) % 6 : max === gg ? (b - r) / dd + 2 : (r - gg) / dd + 4;
            const hue = (hh * 60 + 360) % 360;
            const near = allowed.some((a) => Math.min(Math.abs(a - hue), 360 - Math.abs(a - hue)) <= 25);
            if (!near) out.add(el.tagName + "." + el.className + " " + k + " " + v + " hue " + Math.round(hue));
          }
        }
        return [...out].slice(0, 5);
      }, hues);
      assert.deepEqual(bad, [], scheme);
    }
  });

  /* 28 */ await gate("copy shares no two-word run with the reference", async () => {
    const page = await open({ register: STATED });
    await settled(page);
    const lines = await page.evaluate(() => {
      const out = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) {
        const n = w.currentNode;
        if (["SCRIPT", "STYLE"].includes(n.parentElement.tagName)) continue;
        if (n.parentElement.closest("[data-marquee], .row, .ledger__value, #ca-value")) continue;
        out.push(n.textContent);
      }
      document.querySelectorAll("[aria-label], [title], [alt]").forEach((e) => ["aria-label", "title", "alt"].forEach((a) => e.getAttribute(a) && out.push(e.getAttribute(a))));
      document.querySelectorAll("meta[name=description], meta[property^='og:']").forEach((m) => out.push(m.content));
      out.push(document.title);
      return out.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
    });
    assert.ok(lines.length > 60, "too little text collected");
    const ref = new Set(JSON.parse(read("gates/ref-bigrams.json")));
    const shared = bigramsOf(lines).filter((b) => ref.has(fnv(b)));
    assert.deepEqual(shared, [], "shared two-word runs");
  });

  /* 29 */ await gate("document head: title, description, social tags, icon", async () => {
    const page = await std();
    const h = await page.evaluate(() => ({
      title: document.title,
      desc: document.querySelector('meta[name="description"]')?.content,
      ogt: document.querySelector('meta[property="og:title"]')?.content,
      ogd: document.querySelector('meta[property="og:description"]')?.content,
      canon: document.querySelector('link[rel="canonical"]')?.href,
      icon: document.querySelector('link[rel="icon"]')?.getAttribute("href"),
      viewport: document.querySelector('meta[name="viewport"]')?.content,
    }));
    assert.ok(h.title.length >= 8 && h.title.length <= 70);
    assert.ok(h.desc && h.desc.length >= 60 && h.desc.length <= 200);
    assert.ok(h.ogt && h.ogd);
    assert.equal(h.canon, "https://akai.lol/");
    assert.equal(h.icon, "/favicon.svg");
    assert.match(h.viewport, /width=device-width/);
    const res = await page.request.get(BASE + h.icon);
    assert.equal(res.status(), 200);
  });

  /* 30 */ await gate("gate budget respected (30 or fewer)", async () => {
    assert.ok(results.length + 1 <= 30, `${results.length + 1} gates`);
  });

  await browser?.close().catch(() => {});
  server.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} gates passed`);
  process.exit(failed.length ? 1 : 0);
}

async function launch() {
  await browser?.close().catch(() => {});
  for (let attempt = 1; ; attempt++) {
    try {
      browser = await chromium.launch({ executablePath: edgePath(), headless: true, timeout: 60000 });
      break;
    } catch (e) {
      if (attempt >= 2) throw e;
    }
  }
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  ctx.setDefaultTimeout(15000);
}

await launch();
main().catch((e) => {
  console.error(e);
  process.exit(2);
});
