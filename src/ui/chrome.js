// Menu, FAQ, active-section marker.
import { reduced } from "./motion.js";

export function initMenu() {
  const btn = document.getElementById("menu-btn");
  const nav = document.getElementById("menu");
  const set = (open) => {
    nav.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  btn.addEventListener("click", () => set(btn.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) set(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      set(false);
      btn.focus();
    }
  });
  window.matchMedia("(min-width: 900px)").addEventListener("change", (e) => e.matches && set(false));
}

export function initFaq() {
  document.querySelectorAll(".faq__item").forEach((item) => {
    const q = item.querySelector("summary");
    q.addEventListener("click", (e) => {
      e.preventDefault();
      const open = item.classList.contains("is-open");
      if (reduced()) {
        item.open = !open;
        item.classList.toggle("is-open", !open);
        return;
      }
      if (!open) {
        item.open = true;
        requestAnimationFrame(() => requestAnimationFrame(() => item.classList.add("is-open")));
        return;
      }
      item.classList.remove("is-open");
      const panel = item.querySelector(".faq__a");
      let closed = false;
      const finish = () => {
        if (closed) return;
        closed = true;
        panel.removeEventListener("transitionend", onEnd);
        if (!item.classList.contains("is-open")) item.open = false;
      };
      const onEnd = (ev) => ev.target === panel && finish();
      panel.addEventListener("transitionend", onEnd);
      setTimeout(finish, 500);
    });
  });
}

export function initSpy() {
  const links = [...document.querySelectorAll(".bar .nav__link")];
  const map = new Map();
  links.forEach((a) => {
    const sec = document.querySelector(a.getAttribute("href"));
    if (sec) map.set(sec, a);
  });
  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((l) => l.removeAttribute("aria-current"));
        map.get(en.target).setAttribute("aria-current", "location");
      });
    },
    { rootMargin: "-40% 0px -55% 0px" },
  );
  map.forEach((_, sec) => io.observe(sec));
}
