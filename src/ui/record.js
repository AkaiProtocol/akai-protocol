// Register-driven UI: contract slot, socials, ledger, footer flag.
import { byId, deriveHandle, hrefFor } from "../register.js";

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    ok ? resolve() : reject(new Error("copy failed"));
  });
}

export function initContract(register) {
  const rec = byId(register, "contract");
  const btn = document.getElementById("ca-btn");
  const value = document.getElementById("ca-value");
  const hint = document.getElementById("ca-hint");
  const live = document.getElementById("ca-live");
  btn.dataset.state = rec.state;

  if (rec.state === "unconfirmed") {
    hint.textContent = "Unconfirmed";
    btn.setAttribute("aria-label", "Contract address, unconfirmed");
    return;
  }
  if (rec.state !== "stated") return;

  value.textContent = rec.value;
  value.removeAttribute("aria-hidden");
  hint.textContent = "Click to copy";
  btn.disabled = false;
  btn.setAttribute("aria-label", `Contract address ${rec.value}. Click to copy.`);

  let timer = null;
  btn.addEventListener("click", async () => {
    try {
      await copyText(rec.value);
    } catch {
      hint.textContent = "Copy blocked, select the address";
      return;
    }
    btn.classList.add("is-copied");
    hint.textContent = "Copied";
    live.textContent = "Contract address copied";
    clearTimeout(timer);
    timer = setTimeout(() => {
      btn.classList.remove("is-copied");
      hint.textContent = "Click to copy";
      live.textContent = "";
    }, 1800);
  });
}

const SOCIAL_LABEL = { x: "X", github: "GitHub" };

export function initSocials(register) {
  document.querySelectorAll("[data-social]").forEach((btn) => {
    const kind = btn.dataset.social;
    const rec = byId(register, kind);
    const href = hrefFor(rec);
    const handle = href ? deriveHandle(rec.url, kind) : null;
    if (!href || !handle) return;
    const a = document.createElement("a");
    a.className = btn.className;
    a.dataset.social = kind;
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("aria-label", `${SOCIAL_LABEL[kind]}, ${handle}`);
    a.title = handle;
    a.innerHTML = btn.innerHTML;
    btn.replaceWith(a);
  });
}

function ledgerValue(rec) {
  if (rec.state === "absent") return null;
  if (rec.state === "unconfirmed") return rec.note || null;
  let base = rec.value;
  if (rec.id === "x" || rec.id === "github") base = deriveHandle(rec.url, rec.id);
  else if (rec.id === "rpc") base = new URL(rec.value).host;
  return base && rec.date ? `${base} · ${rec.date}` : base;
}

export function initLedger(register) {
  const list = document.getElementById("ledger-list");
  const frag = document.createDocumentFragment();
  register.forEach((rec) => {
    const li = document.createElement("li");
    li.className = "ledger__row";
    li.dataset.record = rec.id;
    const label = document.createElement("span");
    label.className = "ledger__label";
    label.textContent = rec.label;
    const val = document.createElement("span");
    val.className = "ledger__value";
    const text = ledgerValue(rec);
    val.textContent = text || "—";
    if (!text) val.dataset.empty = "true";
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.dataset.state = rec.state;
    badge.textContent = rec.state;
    li.append(label, val, badge);
    frag.append(li);
  });
  list.replaceChildren(frag);
}

export function initFootFlag(register) {
  const flagged = register.filter((r) => (r.id === "palette" || r.id === "mark") && r.state === "unconfirmed");
  const el = document.getElementById("foot-flag");
  el.textContent = flagged.length ? `Unsampled placeholders: ${flagged.map((r) => r.label.toLowerCase()).join(", ")}.` : "";
}
