// Builds public/favicon.svg from the traced logo pixel grid (tools/trace-logo.mjs -> tools/logo-mark.json).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const mark = JSON.parse(readFileSync(new URL("../tools/logo-mark.json", import.meta.url), "utf8"));
const [, , vw, vh] = mark.viewBox;
const size = 32;
const pad = 2;
const scale = (size - pad * 2) / vw;
const ty = (size - vh * scale) / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
<g transform="translate(${pad} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">
<path fill="${mark.light.fill}" d="${mark.light.d}"/>
<path fill="${mark.dark.fill}" d="${mark.dark.d}"/>
</g>
</svg>
`;

mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/favicon.svg", import.meta.url), svg);
console.log("favicon.svg written from the traced logo");
