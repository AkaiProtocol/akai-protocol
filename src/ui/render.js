// Binds live state to the page. Text goes in via textContent only.
import { DASH, fmtAgo, fmtCompactUsd, fmtFixed, fmtInt, fmtPct, fmtPrice } from "../format.js";
import { byId } from "../register.js";
import { countFromZero, setEmpty, setNum } from "./num.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

const gweiFmt = (n) => fmtFixed(n, n < 1 ? 4 : 2);
const compactFmt = (n) => fmtCompactUsd(n).replace("$", "");

function settleCard(name) {
  const card = document.querySelector(`[data-card="${name}"]`);
  if (card) card.setAttribute("aria-busy", "false");
}

/* ---------- gas trail ---------- */
const TRAIL_SLOTS = 32;

function buildTrail() {
  const trail = $("trail");
  const frag = document.createDocumentFragment();
  for (let i = 0; i < TRAIL_SLOTS; i++) {
    const bar = el("span", "trail__bar");
    bar.style.setProperty("--k", String(i));
    bar.style.setProperty("--h", `${28 + Math.round(36 * Math.abs(Math.sin(i * 0.9 + 1)))}%`);
    frag.append(bar);
  }
  trail.replaceChildren(frag);
}

function renderTrail(values) {
  const trail = $("trail");
  if (!values.length) {
    trail.dataset.state = "empty";
    $("trail-meta").textContent = "No fee history returned";
    trail.setAttribute("aria-label", "Recent gas readings, unavailable");
    trail.querySelectorAll(".trail__bar").forEach((b) => b.style.setProperty("--h", "6%"));
    return;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const bars = trail.querySelectorAll(".trail__bar");
  const offset = TRAIL_SLOTS - values.length;
  const wasLoading = trail.dataset.state === "loading";
  trail.dataset.state = "ready";
  bars.forEach((bar, i) => {
    const v = values[i - offset];
    if (v === undefined) {
      bar.style.setProperty("--h", "6%");
      bar.style.setProperty("--o", "0.12");
      return;
    }
    const norm = max === min ? 0.5 : (v - min) / (max - min);
    bar.style.setProperty("--h", `${(18 + 82 * norm).toFixed(1)}%`);
    bar.style.setProperty("--o", (0.3 + 0.65 * ((i - offset + 1) / values.length)).toFixed(2));
    if (wasLoading) bar.classList.add("is-new");
  });
  $("trail-meta").textContent = `Base fee, last ${values.length} blocks`;
  trail.setAttribute("aria-label", `Base fee over the last ${values.length} blocks, from ${gweiFmt(min)} to ${gweiFmt(max)} gwei`);
}

/* ---------- tvl sparkline ---------- */
function renderSpark(series) {
  const spark = $("spark");
  const pts = series.slice(series.findIndex((p) => p.v > 0)).slice(-90);
  if (pts.length < 2) {
    spark.dataset.state = "empty";
    $("tvl-meta").textContent = DASH;
    spark.setAttribute("aria-label", "Daily locked value, unavailable");
    return;
  }
  const W = 400;
  const H = 120;
  const pad = 8;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  const xy = pts.map((p, i) => [(i / (pts.length - 1)) * W, H - pad - ((p.v - min) / span) * (H - pad * 2)]);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  $("spark-line").setAttribute("d", line);
  $("spark-area").setAttribute("d", `${line} L${W} ${H} L0 ${H} Z`);
  spark.dataset.state = "ready";
  $("tvl-meta").textContent = `${pts.length} days, latest ${fmtCompactUsd(pts[pts.length - 1].v)}`;
  spark.setAttribute("aria-label", `Daily locked value over ${pts.length} days, from ${fmtCompactUsd(pts[0].v)} to ${fmtCompactUsd(pts[pts.length - 1].v)}`);
}

/* ---------- pairs: tape + table ---------- */
function logo(pair, big) {
  const wrap = el("span", big ? "logo logo--lg" : "logo");
  wrap.append(el("span", null, pair.base.slice(0, 1).toUpperCase()));
  if (pair.img) {
    const img = document.createElement("img");
    img.src = pair.img;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => img.remove());
    wrap.append(img);
  }
  return wrap;
}

function chip(pair, hidden) {
  const node = pair.url ? el("a", "chip") : el("span", "chip");
  if (pair.url) {
    node.href = pair.url;
    node.target = "_blank";
    node.rel = "noopener noreferrer";
    if (hidden) node.tabIndex = -1;
  }
  node.append(logo(pair, false), el("span", "chip__name", `${pair.base}/${pair.quote}`), el("span", "chip__price", fmtPrice(pair.price)), el("span", "chip__chg", fmtPct(pair.change)));
  return node;
}

function skeletonChips(hidden) {
  const set = el("div", "tape__set");
  if (hidden) set.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 8; i++) {
    const c = el("span", "chip chip--skeleton");
    c.append(el("span", "skeleton chip__sk"));
    c.firstChild.style.cssText = "width:100%;height:24px";
    set.append(c);
  }
  return set;
}

function renderTape(list) {
  const tape = $("tape");
  const track = $("tape-track");
  if (list === null) {
    track.replaceChildren(skeletonChips(false), skeletonChips(true));
    return;
  }
  if (!list.length) {
    tape.dataset.state = "empty";
    track.replaceChildren();
    tape.parentElement.hidden = true;
    return;
  }
  tape.parentElement.hidden = false;
  tape.dataset.state = "ready";
  const reps = Math.max(1, Math.ceil(8 / list.length));
  const makeSet = (hidden) => {
    const set = el("div", "tape__set");
    if (hidden) set.setAttribute("aria-hidden", "true");
    for (let r = 0; r < reps; r++) list.forEach((p) => set.append(chip(p, hidden || r > 0)));
    return set;
  };
  track.replaceChildren(makeSet(false), makeSet(true));
  const half = track.scrollWidth / 2;
  track.style.setProperty("--tape-dur", `${Math.max(30, Math.round(half / 45))}s`);
}

function shortAddr(a) {
  return /^0x[0-9a-fA-F]{40,}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a.slice(0, 12);
}

function skeletonRows() {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 5; i++) {
    const row = el("div", "row row--skeleton");
    row.setAttribute("aria-hidden", "true");
    row.append(el("span", "skeleton"));
    frag.append(row);
  }
  return frag;
}

function renderTable(list) {
  const table = $("pairs-table");
  const body = $("pairs-body");
  const empty = $("pairs-empty");
  table.setAttribute("aria-busy", "false");
  if (!list.length) {
    table.dataset.state = "empty";
    body.replaceChildren();
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  table.dataset.state = "ready";
  const frag = document.createDocumentFragment();
  list.slice(0, 8).forEach((p) => {
    const row = el("div", "row");
    row.setAttribute("role", "row");
    const pairCell = p.url ? el("a", "row__pair") : el("div", "row__pair");
    if (p.url) {
      pairCell.href = p.url;
      pairCell.target = "_blank";
      pairCell.rel = "noopener noreferrer";
    }
    pairCell.setAttribute("role", "cell");
    const name = el("span", "row__name");
    name.append(el("b", null, `${p.base}/${p.quote}`), el("small", null, shortAddr(p.id)));
    pairCell.append(logo(p, true), name);
    const cell = (label, text) => {
      const c = el("span", "cell", text);
      c.dataset.label = label;
      c.setAttribute("role", "cell");
      return c;
    };
    row.append(pairCell, cell("Price", fmtPrice(p.price)), cell("24h", fmtPct(p.change)), cell("Liquidity", fmtCompactUsd(p.liquidity)), cell("Volume 24h", fmtCompactUsd(p.volume)));
    frag.append(row);
  });
  body.replaceChildren(frag);
}

/* ---------- status pill + sync line ---------- */
const PILL = { connecting: "Connecting", live: "Live", degraded: "Partial", offline: "Offline" };

function pillState(s) {
  const all = [s.rpc.status, s.tvl.status, s.pairs.status];
  if (all.every((x) => x === "loading")) return "connecting";
  if (all.every((x) => x === "error")) return "offline";
  if (s.rpc.status === "ok" && all.every((x) => x !== "error")) return "live";
  if (s.rpc.status === "loading" && all.every((x) => x !== "error")) return "connecting";
  return "degraded";
}

function renderPill(s) {
  const st = pillState(s);
  const pill = $("status-pill");
  if (pill.dataset.state !== st) {
    pill.dataset.state = st;
    $("status-text").textContent = PILL[st];
  }
}

function renderSync(s) {
  const node = $("sync");
  if (s.rpc.status === "ok" && s.rpc.at) node.textContent = `Node answered ${fmtAgo(Date.now() - s.rpc.at)}.`;
  else if (s.rpc.status === "error") node.textContent = s.rpc.at ? "Node went quiet, holding the last reading." : "The node is not answering.";
}

/* ---------- binding ---------- */
export function bindLive(live, register) {
  const num = (k) => document.querySelector(`[data-num="${k}"]`);
  const chainRec = byId(register, "chain-id");
  buildTrail();
  renderTape(null);
  $("pairs-body").replaceChildren(skeletonRows());

  function onRpc(s) {
    if (s.rpc.status === "ok") {
      setNum(num("block"), s.rpc.block, fmtInt);
      setNum(num("gas"), s.rpc.gwei, gweiFmt);
      const id = Number.isFinite(s.rpc.chainId) ? s.rpc.chainId : Number(chainRec.value);
      setNum(num("chainid"), id, (n) => String(Math.round(n)));
      $("chain-note").textContent = s.rpc.chainOk === true ? "Matches the node" : s.rpc.chainOk === false ? "Node reports another id" : "Node did not say";
      renderTrail(s.rpc.trail);
    } else if (s.rpc.status === "error" && !s.rpc.at) {
      setEmpty(num("block"));
      setEmpty(num("gas"));
      setNum(num("chainid"), Number(chainRec.value), (n) => String(Math.round(n)));
      $("chain-note").textContent = "Recorded value, node silent";
      renderTrail([]);
    }
    ["block", "gas", "chain", "trail"].forEach(settleCard);
  }

  function onTvl(s) {
    if (s.tvl.status === "ok") {
      setNum(num("tvl"), s.tvl.value, compactFmt);
      renderSpark(s.tvl.series);
    } else if (!s.tvl.at) {
      setEmpty(num("tvl"));
      renderSpark([]);
    }
    ["tvl", "tvl-series"].forEach(settleCard);
  }

  function onPairs(s) {
    if (s.pairs.status === "ok") {
      renderTape(s.pairs.list);
      renderTable(s.pairs.list);
    } else if (!s.pairs.at) {
      renderTape([]);
      renderTable([]);
    }
  }

  live.subscribe((key, s) => {
    if (key === "rpc") onRpc(s);
    if (key === "tvl") onTvl(s);
    if (key === "pairs") onPairs(s);
    renderPill(s);
    renderSync(s);
  });

  setInterval(() => renderSync(live.state), 1000);

  document.addEventListener("akai:revealed", (e) => {
    e.target.querySelectorAll?.(".num").forEach(countFromZero);
  });
}
