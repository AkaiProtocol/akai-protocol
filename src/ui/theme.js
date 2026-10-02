const KEY = "akai-theme";
const dark = window.matchMedia("(prefers-color-scheme: dark)");

function stored() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(pref) {
  const root = document.documentElement;
  root.setAttribute("data-pref", pref);
  root.setAttribute("data-theme", pref === "system" ? (dark.matches ? "dark" : "light") : pref);
  document.querySelectorAll("[data-theme-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeSet === pref)));
  const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && bg) meta.setAttribute("content", bg);
}

export function initTheme() {
  apply(stored());
  document.querySelectorAll("[data-theme-set]").forEach((b) =>
    b.addEventListener("click", () => {
      const pref = b.dataset.themeSet;
      try {
        if (pref === "system") localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, pref);
      } catch {
        /* storage may be blocked; the choice still applies for this visit */
      }
      apply(pref);
    }),
  );
  dark.addEventListener("change", () => {
    if (stored() === "system") apply("system");
  });
}
