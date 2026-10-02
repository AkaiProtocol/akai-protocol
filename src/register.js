// REGISTER PATTERN: every external fact is exactly one record.
// state is one of: stated | absent | unconfirmed.
// LINK RULE: only the URL is stored; handles are derived from it.
// Records that are not "stated" never produce an href.

export const STATES = Object.freeze(["stated", "absent", "unconfirmed"]);

const SAMPLED_ON = "2026-10-02";

const BASE = [
  { id: "domain", label: "Domain", state: "stated", value: "akai.lol", url: "https://akai.lol", note: null, date: null },
  { id: "chain-id", label: "Chain id", state: "stated", value: "4663", url: null, note: null, date: null },
  { id: "rpc", label: "Node endpoint", state: "stated", value: "https://rpc.mainnet.chain.robinhood.com", url: "https://rpc.mainnet.chain.robinhood.com", note: null, date: null },
  { id: "contract", label: "Contract", state: "absent", value: null, url: null, note: null, date: null },
  { id: "x", label: "X account", state: "stated", value: null, url: "https://x.com/Akai_Labs", note: null, date: "2026-10-02" },
  { id: "github", label: "GitHub", state: "stated", value: null, url: "https://github.com/AkaiProtocol/akai-protocol", note: null, date: "2026-10-02" },
  { id: "palette", label: "Palette", state: "stated", value: "Sampled from the brand files", url: null, note: "k-means, snapped to real pixels", date: SAMPLED_ON },
  { id: "mark", label: "Mark", state: "stated", value: "Traced from the logo pixel grid", url: null, note: "Premultiplied resize, marching squares", date: SAMPLED_ON },
];

const HOSTS = {
  x: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
  github: ["github.com", "www.github.com"],
};

// Any 20-byte hex address. Plain 0x hex is valid input here, never rejected wholesale.
export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isAddress(v) {
  return typeof v === "string" && ADDRESS_RE.test(v);
}

export function parseHttps(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

// Handle is derived from the stored URL, never stored on its own.
export function deriveHandle(url, kind) {
  const u = parseHttps(url);
  if (!u || !HOSTS[kind] || !HOSTS[kind].includes(u.hostname.toLowerCase())) return null;
  const seg = u.pathname.split("/").filter(Boolean)[0];
  if (!seg || !/^[A-Za-z0-9_-]{1,39}$/.test(seg)) return null;
  return kind === "x" ? `@${seg}` : seg;
}

// A record claims "stated" only if its payload checks out; otherwise it degrades to unconfirmed.
function settle(rec) {
  if (rec.state === "absent") return { ...rec, value: null, url: null, date: null };
  if (rec.state !== "stated") return rec;
  if (rec.id === "contract") return isAddress(rec.value) ? rec : { ...rec, state: "unconfirmed" };
  if (rec.id === "x" || rec.id === "github") return deriveHandle(rec.url, rec.id) ? rec : { ...rec, state: "unconfirmed" };
  return rec;
}

export function loadRegister() {
  const overrides = (typeof window !== "undefined" && window.__AKAI_REGISTER__) || {};
  return BASE.map((r) => settle({ ...r, ...(overrides[r.id] || {}) }));
}

export function byId(register, id) {
  return register.find((r) => r.id === id);
}

export function hrefFor(rec) {
  return rec && rec.state === "stated" && rec.url ? rec.url : null;
}
