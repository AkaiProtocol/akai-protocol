# Architecture

This document has two halves. The first describes what is **built** in this repository today. The second describes the **design intent** for the access protocol, which is not yet shipped.

## Part 1: the site (built)

```
 browser
   |
   |-- index.html + one CSS bundle + one JS bundle      (static, served from akai.lol)
   |
   |-- POST  rpc.mainnet.chain.robinhood.com            height, gas, fee history
   |-- GET   api.llama.fi                               chain locked value + daily history
   |-- GET   api.dexscreener.com                        pairs on the chain
```

There is no application server. Every figure is fetched by the visitor's browser from a public source.

### Modules

| Module | Role |
| --- | --- |
| `src/register.js` | The register. One record per outside fact with a state of `stated`, `absent` or `unconfirmed`. Handles are derived from stored URLs. |
| `src/live.js` | Three pollers (RPC every 5s, locked value every 60s, pairs every 45s). Pauses while the tab is hidden; backs off on failure; each source reports `loading`, `ok` or `error`. |
| `src/format.js` | Number and price formatting. |
| `src/ui/motion.js` | Scroll reveal, scroll progress, parallax depth. Short-circuits under reduced motion. |
| `src/ui/num.js` | Count-up on first reveal, count-to plus flash on change. |
| `src/ui/render.js` | Binds live state to the DOM using `textContent` only. |
| `src/ui/record.js` | Register-driven UI: the pinned contract slot, social icons, the Ledger. |
| `src/ui/theme.js` | Light, dark and system themes; persisted when storage allows. |
| `src/ui/chrome.js` | Menu, FAQ accordion, active-section marker. |
| `src/tokens.css` | Every color literal, with provenance. |

### Design constraints

- **Register pattern.** Anything we did not produce ourselves is a record with an honest state. The UI is generated from the records, so a fact cannot appear on the page without being in the register.
- **Link rule.** Only the URL is stored. A record that is not `stated` never yields an `href`.
- **Honest gaps.** A silent source shows a dash and flips the status pill to `Partial` or `Offline`. Last good values are held when a source drops after a success.
- **Palette rule.** The palette is sampled from `brand/` and `reference/` by `tools/sample-brand.mjs` (k-means, snapped to real pixels). Colors beyond the sampled set are `color-mix()` derivations; no other literal exists.
- **Untrusted data.** Pair names, addresses and image URLs come from a third party. Text is inserted with `textContent`, links are accepted only for `https://dexscreener.com/`, and logos only from `https://cdn.dexscreener.com/`.
- **No ch units, 48px tap targets, no horizontal overflow** at 360, 390, 430, 1366 and 1440 pixels.

### Build and verification

```
tools/sample-brand.mjs   brand/ + reference/  ->  tools/brand-sample.json
tools/trace-logo.mjs     transparent logo     ->  tools/logo-mark.json
scripts/favicon.mjs      logo-mark.json       ->  public/favicon.svg
vite build               index.html + src/    ->  dist/
gates/run.mjs            dist/ + fixtures     ->  pass or fail
```

The transparent logo PNG stores pure-black RGB under zero alpha. A naive resize pulls those black pixels into the edge and produces a dark fringe, so `trace-logo.mjs` averages color weighted by alpha (premultiplied) before dividing alpha back out.

The gates serve `dist/` on a loopback port, route every cross-origin request to synthetic fixtures, and use a fake clock so polling and count-up animations finish in milliseconds.

## Part 2: the access protocol (design intent)

```
 wallet ---- signed message ---->  session service
                                        |
                       balance read     v
   chain node  <-----------------  entitlement resolver  --->  { discount, daily allowance }
                                        |
                                        v
   request ---->  metering gateway ---> upstream AI provider
                        |
                        +--> per-wallet allowance ledger (resets on a fixed daily boundary)
```

### Components

**Session service.** Verifies a signed message to establish control of an address. It never requests a transaction or an approval. Sessions are short-lived and carry no custody.

**Entitlement resolver.** Reads the $AKAI balance for the verified address and maps it to an entitlement: whether the discount applies, and the day's allowance. The mapping function is an open design question (see the [whitepaper](whitepaper.md)).

**Metering gateway.** Prices each request against the standard rate. While allowance remains, the stated discount (ceiling 95%) is applied and the allowance ledger is decremented. Beyond the allowance, the request is priced at the standard rate.

**Allowance ledger.** One counter per wallet per day, reset on a fixed boundary. It is the only mutable state the protocol keeps about a user.

### Properties the design must hold

1. Holding is read, never consumed.
2. No component can move a user's assets.
3. The discount is a pure function of (balance, allowance remaining, request cost), so any user can reproduce their bill.
4. A failed balance read fails closed to standard pricing, never to a free request.

### Not yet decided

- The curve from balance to discount depth.
- Whether allowance scales with balance.
- Delegation of entitlements.
- Treatment of upstream price changes.
