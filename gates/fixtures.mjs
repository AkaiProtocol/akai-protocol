// Synthetic fixtures only. Nothing here is real chain data.

export const ADDR = "0x" + "aB3d9F".repeat(6) + "aB3d"; // 40 hex chars, mixed case
export const PAIR_A = "0x" + "ab".repeat(32);
export const PAIR_B = "0x" + "cd".repeat(32);
export const PAIR_C = "0x" + "ef".repeat(32);

export const hex = (n) => "0x" + n.toString(16);

export function rpcBody(reqBody, { block = 4200000, gasWei = 50000000, chainId = 4663 } = {}) {
  const calls = Array.isArray(reqBody) ? reqBody : [reqBody];
  const out = calls.map((c) => {
    switch (c.method) {
      case "eth_chainId":
        return { jsonrpc: "2.0", id: c.id, result: hex(chainId) };
      case "eth_blockNumber":
        return { jsonrpc: "2.0", id: c.id, result: hex(block) };
      case "eth_gasPrice":
        return { jsonrpc: "2.0", id: c.id, result: hex(gasWei) };
      case "eth_feeHistory":
        return {
          jsonrpc: "2.0",
          id: c.id,
          result: { oldestBlock: hex(block - 32), baseFeePerGas: Array.from({ length: 33 }, (_, i) => hex(40000000 + i * 500000 + (i % 3) * 700000)), gasUsedRatio: [] },
        };
      default:
        return { jsonrpc: "2.0", id: c.id, error: { code: -32601, message: "no" } };
    }
  });
  return Array.isArray(reqBody) ? out : out[0];
}

export function llamaBody() {
  const day = 86400;
  const rows = [];
  for (let i = 0; i < 40; i++) rows.push({ date: 1700000000 + i * day, tvl: 0 });
  for (let i = 0; i < 100; i++) rows.push({ date: 1700000000 + (40 + i) * day, tvl: 1000000 + i * 1200000 });
  rows[rows.length - 1].tvl = 123456789;
  return rows;
}

const pair = (addr, base, liq, extra = {}) => ({
  chainId: "robinhood",
  dexId: "synthetic",
  url: `https://dexscreener.com/robinhood/${addr}`,
  pairAddress: addr,
  baseToken: { address: ADDR, name: base, symbol: base },
  quoteToken: { address: ADDR, name: "Ether", symbol: "ETH" },
  priceUsd: "0.00163",
  priceChange: { h24: -2.12 },
  volume: { h24: 41025.14 },
  liquidity: { usd: liq },
  ...extra,
});

export function dexBody({ empty = false } = {}) {
  if (empty) return { pairs: [] };
  return {
    pairs: [
      pair(PAIR_B, "TESTB", 50000),
      pair(PAIR_A, "TESTA", 900000, { priceChange: { h24: 3.4 }, priceUsd: "2450.5" }),
      pair(PAIR_A, "TESTA", 900000),
      pair(PAIR_C, "TESTC", 12000),
      { ...pair(PAIR_C, "OTHER", 99999999), chainId: "elsewhere", pairAddress: "0x" + "12".repeat(32) },
    ],
  };
}

export const EXPECT = {
  block: "4,200,000",
  gas: "0.0500",
  tvl: "123.46M",
  chainid: "4663",
  pairs: ["TESTA/ETH", "TESTB/ETH", "TESTC/ETH"],
};
