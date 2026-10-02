const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

export const DASH = "—";

export function fmtInt(n) {
  return Number.isFinite(n) ? int.format(n) : DASH;
}

export function fmtFixed(n, decimals) {
  if (!Number.isFinite(n)) return DASH;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

export function fmtCompactUsd(n) {
  return Number.isFinite(n) ? `$${compact.format(n)}` : DASH;
}

export function fmtPrice(n) {
  if (!Number.isFinite(n)) return DASH;
  if (n >= 1000) return `$${int.format(n)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n === 0) return "$0";
  return `$${n.toFixed(Math.min(10, Math.max(4, 2 - Math.floor(Math.log10(n)))))}`;
}

export function fmtPct(n) {
  if (!Number.isFinite(n)) return DASH;
  const arrow = n > 0 ? "▲" : n < 0 ? "▼" : "●";
  return `${arrow} ${Math.abs(n).toFixed(2)}%`;
}

export function fmtAgo(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 2) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}
