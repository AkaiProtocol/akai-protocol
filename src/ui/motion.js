// Motion plumbing: reveal, scroll progress, parallax. Everything short-circuits under reduced motion.

const query = window.matchMedia("(prefers-reduced-motion: reduce)");
export const reduced = () => query.matches;

export function initReveal() {
  const els = [...document.querySelectorAll("[data-reveal]")];
  const settle = (el) => el.classList.add("is-done");

  const show = (el) => {
    if (el.classList.contains("is-in")) return;
    el.classList.add("is-in");
    el.dispatchEvent(new CustomEvent("akai:revealed", { bubbles: true }));
    if (reduced()) return settle(el);
    const onEnd = (e) => {
      if (e.target !== el || e.propertyName !== "opacity") return;
      el.removeEventListener("transitionend", onEnd);
      settle(el);
    };
    el.addEventListener("transitionend", onEnd);
  };

  if (reduced() || !("IntersectionObserver" in window)) {
    els.forEach((el) => {
      el.classList.add("is-in");
      settle(el);
      el.dispatchEvent(new CustomEvent("akai:revealed", { bubbles: true }));
    });
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        show(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
  );
  els.forEach((el) => io.observe(el));
}

export function initScroll() {
  const root = document.documentElement;
  const layers = [...document.querySelectorAll("[data-depth]")];
  layers.forEach((el) => el.style.setProperty("--depth", el.dataset.depth));
  let queued = false;

  function frame() {
    queued = false;
    const y = window.scrollY;
    const max = root.scrollHeight - window.innerHeight;
    root.style.setProperty("--p", max > 0 ? Math.min(1, y / max).toFixed(4) : "0");
    root.style.setProperty("--sy", reduced() ? "0" : String(Math.min(y, 1600)));
  }
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frame);
  };

  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  query.addEventListener("change", queue);
  frame();
}
