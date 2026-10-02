# Contributing to Akai

Thanks for taking an interest. This project is small and opinionated, so a few minutes with these notes will save everyone a review round.

## Ground rules

1. **Be honest in copy.** Never state a fact that is not in the register. If a number, address or link is not published, the page says so.
2. **One record per outside fact.** Add or change facts in `src/register.js`, with an honest state (`stated`, `absent` or `unconfirmed`). The UI is generated from the register.
3. **Store the URL, derive the handle.** Do not add a stored handle. Do not render a link for a record that is not `stated`.
4. **Never blanket-reject `0x` hex.** Validators check shape (`0x` plus 40 hex characters), not prefix.
5. **Color literals belong in `src/tokens.css` only,** and only values traceable to a real brand pixel. Run `node tools/sample-brand.mjs` and cite file and coordinate. Everything else is a `color-mix()` of existing tokens.
6. **No `ch` units.** Tap targets are 48px or larger. Nothing may overflow horizontally at 360, 390, 430, 1366 or 1440 pixels.
7. **Respect reduced motion.** Anything animated needs an instant fallback.
8. **Keep the repository clean.** No tool configuration directories, no machine-written attribution lines in commits or pull requests.

## Setup

Node 20 or newer.

```bash
npm install
npm run build
npm run gates
```

Both commands must exit 0 before you open a pull request. The gates drive a Chromium-family browser; set `EDGE_PATH` to its executable if it is not in a standard location.

## Making a change

1. Fork and branch from `main`.
2. Keep the change focused. Small pull requests get reviewed faster.
3. If you change user-visible text, remember the copy gate: our wording must not share any two-word run with the reference material it is checked against. The gate prints the offending pairs.
4. If you add behavior, add or extend a gate. Gates use synthetic fixtures only and the fast clock; they must not touch the network.
5. Describe *why* in the pull request, not only what.

## Gates

There is a hard cap of 30 gates and a five-minute budget. If you need a new gate, fold related checks into an existing one or retire a weaker one. Prefer checks that fail loudly with the offending value.

## Documentation

Documents in `docs/` distinguish what is **built** from what is **design intent**. Keep that line sharp. A statement about shipped behavior must be verifiable in this repository.

## Reporting problems

- Bugs and ideas: open an issue with steps to reproduce and the viewport width if it is a layout problem.
- Security issues: do **not** open a public issue. Follow the [security policy](SECURITY.md).

## Conduct

Be direct and kind. Critique the change, not the person. Assume good faith until shown otherwise.
