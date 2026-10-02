// Numbers: count-up on first reveal, count-to plus flash on later changes.
import { reduced } from "./motion.js";
import { DASH } from "../format.js";

const easeOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

function paint(el, value) {
  el._shown = value;
  el.textContent = el._fmt(value);
}

function run(el, from, to, ms) {
  const token = (el._run = (el._run || 0) + 1);
  let start = null;
  const step = (now) => {
    if (el._run !== token) return;
    if (start === null) start = now;
    const t = Math.min(1, (now - start) / ms);
    paint(el, from + (to - from) * easeOut(t));
    if (t < 1) requestAnimationFrame(step);
    else paint(el, to);
  };
  requestAnimationFrame(step);
}

function flash(el) {
  el.classList.remove("is-flash");
  void el.offsetWidth;
  el.classList.add("is-flash");
}

export function setEmpty(el) {
  el._run = (el._run || 0) + 1;
  el._to = undefined;
  el.dataset.state = "empty";
  el.textContent = DASH;
}

export function setNum(el, target, fmt) {
  if (!Number.isFinite(target)) return setEmpty(el);
  el._fmt = fmt;
  const prev = el._to;
  el.dataset.state = "ok";
  if (prev === target) return;
  el._to = target;

  if (reduced()) {
    el._run = (el._run || 0) + 1;
    paint(el, target);
    el._counted = true;
    return;
  }

  if (prev === undefined) {
    paint(el, target);
    el._counted = false;
    const card = el.closest("[data-reveal]");
    if (!card || card.classList.contains("is-in")) countFromZero(el);
    return;
  }

  run(el, el._shown, target, 700);
  flash(el);
}

export function countFromZero(el) {
  if (el._counted || el._to === undefined || reduced()) return;
  el._counted = true;
  run(el, 0, el._to, 1200);
}
