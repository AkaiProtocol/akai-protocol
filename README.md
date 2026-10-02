# Akai

Akai is an AI access protocol for [Robinhood Chain](https://robinhood.com) (chain id 4663). The idea is simple: a wallet that holds **$AKAI** reaches AI tooling at a lower unit cost, with the discount ceiling stated at **95%** and bounded by a **daily allowance**.

This repository holds the public site served at [akai.lol](https://akai.lol), the brand sampling tools behind its palette, and the design documents for the protocol.

> **Status.** No contract address has been published. Nothing in this repository is a sale, an offer, or a purchase signal. The site keeps its contract slot inert until a real address is stated.

## What lives here

| Path | Purpose |
| --- | --- |
| `index.html`, `src/` | The site: static HTML, CSS tokens, a small ES-module runtime |
| `src/register.js` | The register: every external fact stored once, with a state of `stated`, `absent` or `unconfirmed` |
| `src/tokens.css` | The only file allowed to hold color literals, each traced to a real brand pixel |
| `tools/` | Brand sampling (`sample-brand.mjs`) and logo tracing (`trace-logo.mjs`) |
| `gates/` | The release gates run by `npm run gates` |
| `docs/` | Whitepaper, tokenomics, roadmap and architecture notes |
| `brand/`, `reference/` | Source artwork and presentation slides |

## Live data on the site

The page reads three public sources directly from the browser, with no backend of ours in the path:

- the chain node (`https://rpc.mainnet.chain.robinhood.com`) for block height, gas price and fee history,
- DefiLlama for chain-level locked value and its daily history,
- DexScreener for trading pairs on the chain.

When a source stays silent, the matching card shows a dash and the status pill changes. The site never fills a gap with a guess.

## Develop

Requirements: Node 20 or newer.

```bash
npm install
npm run build
npm run gates
```

`npm run build` regenerates the favicon from the traced logo and bundles the site into `dist/`.

`npm run gates` serves `dist/` locally, drives it in a Chromium-family browser with synthetic fixtures and a fast clock, and checks palette provenance, copy originality, layout at five widths, tap-target size, motion fallbacks and the register rules. Set `EDGE_PATH` if your browser lives somewhere unusual.

### Regenerating brand-derived files

```bash
node tools/sample-brand.mjs   # k-means palette, snapped to real pixels -> tools/brand-sample.json
node tools/trace-logo.mjs     # premultiplied downsample + trace      -> tools/logo-mark.json
```

The transparent logo PNG stores pure-black RGB under zero alpha, so every resize of it is premultiplied.

## House rules

1. **One record per outside fact.** Anything we did not produce ourselves lives in the register with an honest state.
2. **Store the URL, derive the handle.** Links exist only for records that are stated.
3. **Plain `0x` hex is never rejected wholesale.** Validators check shape, not prefix.
4. **Color literals live in `src/tokens.css` and nowhere else.**
5. **Keep the repository clean.** No tool configuration directories, no machine-written attribution lines.

## Documents

- [Whitepaper](docs/whitepaper.md)
- [Tokenomics](docs/tokenomics.md)
- [Roadmap](docs/roadmap.md)
- [Architecture](docs/architecture.md)
- [Contributing](.github/CONTRIBUTING.md)
- [Security policy](.github/SECURITY.md)

## Links

- Site: [akai.lol](https://akai.lol)
- X: [@Akai_Labs](https://x.com/Akai_Labs)
- GitHub: [AkaiProtocol/akai-protocol](https://github.com/AkaiProtocol/akai-protocol)

## License

[MIT](LICENSE)
