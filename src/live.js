// Live data: node RPC, DefiLlama, DexScreener. Every source reports loading | ok | error.

const LLAMA_CHAIN = "Robinhood Chain";
const LLAMA_URL = `https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(LLAMA_CHAIN)}`;
const DEX_URL = "https://api.dexscreener.com/latest/dex/search?q=robinhood";
const DEX_CHAIN = "robinhood";
const TIMEOUT = 9000;
const TRAIL_BLOCKS = 32;

export function createLive({ rpcUrl, expectedChainId }) {
  const state = {
    rpc: { status: "loading", chainId: null, chainOk: null, block: null, gwei: null, trail: [], at: 0 },
    tvl: { status: "loading", value: null, series: [], at: 0 },
    pairs: { status: "loading", list: [], at: 0 },
  };
  const subs = new Set();
  const emit = (name) => subs.forEach((fn) => fn(name, state));

  async function getJson(url, init) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const res = await fetch(url, { ...init, signal: ctl.signal });
      if (!res.ok) throw new Error(`http ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  const hex = (v) => (typeof v === "string" && /^0x[0-9a-fA-F]+$/.test(v) ? Number(BigInt(v)) : NaN);

  async function pollRpc() {
    const body = [
      { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
      { jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] },
      { jsonrpc: "2.0", id: 3, method: "eth_gasPrice", params: [] },
      { jsonrpc: "2.0", id: 4, method: "eth_feeHistory", params: ["0x" + TRAIL_BLOCKS.toString(16), "latest", []] },
    ];
    const out = await getJson(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const by = Object.fromEntries((Array.isArray(out) ? out : []).map((r) => [r.id, r.result]));
    const block = hex(by[2]);
    const gwei = hex(by[3]) / 1e9;
    if (!Number.isFinite(block) || !Number.isFinite(gwei)) throw new Error("bad rpc payload");
    const chainId = hex(by[1]);
    const fees = by[4] && Array.isArray(by[4].baseFeePerGas) ? by[4].baseFeePerGas.slice(0, TRAIL_BLOCKS).map((h) => hex(h) / 1e9).filter(Number.isFinite) : [];
    Object.assign(state.rpc, { status: "ok", chainId, chainOk: Number.isFinite(chainId) ? chainId === expectedChainId : null, block, gwei, trail: fees, at: Date.now() });
  }

  async function pollTvl() {
    const rows = await getJson(LLAMA_URL);
    if (!Array.isArray(rows) || !rows.length) throw new Error("bad tvl payload");
    const series = rows.map((r) => ({ t: r.date * 1000, v: Number(r.tvl) })).filter((r) => Number.isFinite(r.v));
    const last = series[series.length - 1];
    if (!last) throw new Error("empty tvl");
    Object.assign(state.tvl, { status: "ok", value: last.v, series, at: Date.now() });
  }

  async function pollPairs() {
    const out = await getJson(DEX_URL);
    const seen = new Set();
    const list = (out && Array.isArray(out.pairs) ? out.pairs : [])
      .filter((p) => p && p.chainId === DEX_CHAIN && p.baseToken && p.pairAddress && p.liquidity && Number.isFinite(Number(p.liquidity.usd)))
      .filter((p) => (seen.has(p.pairAddress) ? false : seen.add(p.pairAddress)))
      .map((p) => ({
        id: p.pairAddress,
        base: String(p.baseToken.symbol || "?").slice(0, 14),
        quote: String((p.quoteToken && p.quoteToken.symbol) || "?").slice(0, 10),
        price: Number(p.priceUsd),
        change: p.priceChange ? Number(p.priceChange.h24) : NaN,
        liquidity: Number(p.liquidity.usd),
        volume: p.volume ? Number(p.volume.h24) : NaN,
        url: typeof p.url === "string" && p.url.startsWith("https://dexscreener.com/") ? p.url : null,
        img: p.info && typeof p.info.imageUrl === "string" && p.info.imageUrl.startsWith("https://cdn.dexscreener.com/") ? p.info.imageUrl : null,
      }))
      .sort((a, b) => b.liquidity - a.liquidity)
      .slice(0, 12);
    Object.assign(state.pairs, { status: "ok", list, at: Date.now() });
  }

  function poller(key, fn, interval) {
    let timer = null;
    let fails = 0;
    async function tick() {
      timer = null;
      if (document.hidden) return schedule();
      try {
        await fn();
        fails = 0;
      } catch {
        fails += 1;
        state[key].status = "error";
      }
      emit(key);
      schedule();
    }
    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, Math.min(interval * 2 ** Math.min(fails, 3), 60000));
    }
    return {
      start: tick,
      wake() {
        if (timer) clearTimeout(timer);
        tick();
      },
    };
  }

  const pollers = [poller("rpc", pollRpc, 5000), poller("tvl", pollTvl, 60000), poller("pairs", pollPairs, 45000)];

  return {
    state,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    start() {
      pollers.forEach((p) => p.start());
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) pollers.forEach((p) => p.wake());
      });
    },
  };
}
