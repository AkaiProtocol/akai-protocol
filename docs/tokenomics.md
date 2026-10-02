# Tokenomics

**Status:** mechanics only. Supply, distribution, vesting and the contract address have **not been published**, so this document does not contain them. When they are stated by the project, they will be added here and to the register at the same time.

## What $AKAI is for

$AKAI is an access token. Holding it in a wallet you connect to the Akai platform unlocks AI access at a reduced cost. That is the whole utility claim.

It is **not**:

- a yield instrument (holding pays nothing),
- a revenue share,
- a governance promise,
- a prepaid balance that gets spent down.

Holding is read, never consumed. The same balance that unlocked yesterday's discount unlocks today's.

## Stated parameters

| Parameter | Value | State |
| --- | --- | --- |
| Network | Robinhood Chain (id 4663) | stated |
| Discount ceiling | 95% below standard pricing | stated |
| Daily allowance | exists, bounds discounted volume | stated |
| Allowance size | not published | absent |
| Balance to discount curve | not published | absent |
| Contract address | not published | absent |
| Total supply | not published | absent |
| Distribution and vesting | not published | absent |

## Mechanics

### Entitlement

1. The platform reads the connected address's balance on-chain.
2. The balance resolves to an entitlement: discount on or off, and today's allowance.
3. Requests inside the allowance are priced with the discount. Requests beyond it are priced at the standard rate.

### The daily allowance

The allowance exists so that the discount stays sustainable for the platform. It resets on a fixed daily boundary. Two consequences follow:

- Savings are bounded per day, not per month, so steady users benefit more than bursty ones.
- A very large holding does not necessarily mean unlimited discounted use. Whether the allowance scales with balance is an open question.

### What moves value

Only ordinary token transfers move value. Reading a balance does not. The Akai site itself never asks for a signature or an approval.

## Verifying a contract address

When an address is published, check it yourself before interacting:

1. It must be a 20-byte hex address: `0x` followed by 40 hex characters. Mixed-case checksums are valid; plain lowercase and uppercase are valid too.
2. Match it against **every** official channel (the site's pinned slot, the X account, this repository). A single channel is not enough.
3. Look the address up on a Robinhood Chain explorer and confirm it is the token you expect.
4. Be wary of any address that arrives by direct message, in a reply, or on a look-alike domain.

The pinned slot on [akai.lol](https://akai.lol) is deliberately inert until the project states an address. A slot that shows a value without it being listed here should be treated as suspicious.

## Risks

- A token's price can fall to zero. Hold only what you can afford to lose.
- Savings depend on usage, on the allowance, and on the platform honoring the discount.
- Liquidity on young pairs is thin. A listing on a pair index is not an endorsement.
- This document is not financial advice.
