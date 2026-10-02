# Roadmap

**Status:** direction, not a schedule. No phase carries a date, because none has been committed to publicly. Phases are ordered by dependency: each unlocks the next.

Legend: **done** (visible in this repository), **active** (work in progress), **planned**, **open** (needs a decision first).

## Phase 0: Public footing

- **done** Site at akai.lol with live Robinhood Chain readings (block, gas, locked value, pairs).
- **done** Brand palette sampled from real files, favicon traced from the logo pixel grid.
- **done** Register of external facts with honest states; inert contract slot.
- **done** Release gates covering layout, accessibility, motion fallbacks and copy originality.
- **done** X account and GitHub repository linked.

## Phase 1: Token facts

- **open** Publish the contract address on every official channel at once.
- **open** Publish supply and distribution.
- **planned** Move the Ledger rows for these from `absent` to `stated` in the same commit that announces them.
- **planned** Document how to verify the address independently (see [tokenomics](tokenomics.md)).

## Phase 2: Wallet connection

- **planned** Signed-message proof of address control; no transactions, no approvals.
- **planned** Balance reads from the chain node with a documented fallback.
- **planned** Entitlement resolver: balance in, discount and daily allowance out.
- **open** Decide the curve between balance and discount depth.

## Phase 3: Metered access

- **planned** Request metering against the standard rate, discount applied while allowance remains.
- **planned** Per-wallet daily allowance with a fixed reset boundary.
- **planned** A usage view that shows what each request cost and what the discount saved.
- **open** Decide whether allowance scales with balance.

## Phase 4: Hardening

- **planned** Independent review of the entitlement and metering paths.
- **planned** Public incident process alongside the [security policy](../.github/SECURITY.md).
- **planned** Rate-limit and abuse handling for connected wallets.

## Phase 5: Reach

- **planned** More AI tools behind the same entitlement.
- **open** Delegated entitlements (a second wallet inheriting a discount).
- **open** Pass-through rules for upstream price changes.

## How this file changes

Moving an item to **done** requires something a reader can verify: a merged change, a published address, a working page. Moving an item out of **open** requires a written decision in this repository.
