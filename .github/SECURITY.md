# Security Policy

## Scope

In scope:

- the site served from `akai.lol` and the code in this repository,
- the register, tokens, tools and gates that produce it,
- any future wallet-connection, entitlement or metering code that lands here.

Out of scope:

- third-party data providers (the chain node, DefiLlama, DexScreener) and their availability,
- social-engineering of project members,
- findings that require a compromised browser or device,
- volumetric denial-of-service testing.

## Reporting a vulnerability

Please report privately. Do not open a public issue or discuss details in public channels.

Use GitHub's **private vulnerability reporting** on this repository (Security tab, "Report a vulnerability"). If that option is unavailable to you, open a minimal public issue that says only that you have a security report and asks for a private channel, with no technical details.

Include, where you can:

- what you found and where,
- steps to reproduce, or a proof of concept,
- the impact you believe it has,
- any suggested fix.

## What to expect

We aim to acknowledge reports promptly, confirm or dispute them with reasoning, and keep you informed until the issue is resolved. We will credit you in the fix unless you prefer to stay anonymous. Please give us a reasonable window to fix before disclosing.

No bounty program is stated. Do not assume rewards.

## Things that matter most here

- **Look-alike contract slots.** The pinned contract slot is inert until an address is stated in the register. Any way to make it show or copy an unlisted address is a high-severity finding.
- **Link injection.** Links must exist only for `stated` records, and third-party links only for the expected origins. Report any path that renders an unexpected `href`.
- **Untrusted data rendering.** Pair names, addresses and image URLs come from a third party. Any route from that data to script execution or markup injection is in scope.
- **Fabricated figures.** Any path by which the page can show a number that no source reported.
- **Wallet safety.** The site never requests a signature, approval or transaction. Report anything that causes it to.

## Verifying official channels

Before trusting any contract address, link or announcement, check that it appears on the site's Ledger, the X account (@Akai_Labs) and this repository. If one channel disagrees with the others, treat all of them as unconfirmed and report it.

## Supported versions

Only the current `main` branch and the currently deployed site are supported.
