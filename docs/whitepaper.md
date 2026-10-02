# Akai Whitepaper

**Status:** working draft. Statements marked *stated* come from the project's public material. Statements marked *design intent* describe where the protocol is headed and are not shipped behavior.

## 1. Abstract

Using AI services is a metered expense. Every request has a price, prices are set by whoever runs the model, and the people who use these tools most pay the most. Akai proposes a different relationship: an on-chain balance of **$AKAI**, held in a wallet the user controls, unlocks discounted access to AI tooling. The stated discount ceiling is 95% of standard pricing, bounded by a daily allowance. The protocol is built for Robinhood Chain.

## 2. The problem

Three frictions shape how people pay for AI today.

1. **Recurring cost.** Heavy use accumulates quickly, and the bill arrives whether or not the output was useful.
2. **Account-shaped access.** Entitlements live in vendor databases. A user cannot carry them anywhere or prove them to a third party.
3. **No ownership link.** Paying more never gives the payer a stake in the thing they pay for.

Akai does not try to solve all three at once. It targets the first directly and gives the second a concrete form: the entitlement is whatever the wallet holds.

## 3. The proposal

*Stated:*

- Holding $AKAI in a connected wallet unlocks AI access at a lower cost.
- The discount reaches as high as 95%.
- The discounted volume is bounded by a daily allowance.
- The token and the platform live on Robinhood Chain.

*Design intent:*

- Entitlement is derived from an on-chain balance read, never from a deposit.
- The allowance resets on a fixed daily boundary and is tracked per wallet.
- Usage beyond the allowance is possible, but it is simply not discounted.

## 4. How access works

```
wallet  ->  proof of control  ->  balance read  ->  entitlement  ->  metered request
```

1. **Connect.** The user proves control of an address with a signed message. No transaction is sent and no approval is requested.
2. **Read.** The platform reads the address's $AKAI balance from the chain.
3. **Resolve.** The balance maps to an entitlement: whether a discount applies, and how large today's allowance is.
4. **Meter.** Each request is priced against the standard rate, the discount is applied while allowance remains, and the remaining allowance is decremented.

The exact relationship between balance and discount depth is **not yet published**. This paper will not invent one.

## 5. Why Robinhood Chain

The chain gives the project a low-cost venue for balance reads and token transfers, and a network where the audience already holds assets. The site tracks the chain's vital signs (block height, gas price, locked value, active pairs) as a standing reminder of what the protocol rests on.

## 6. Trust model

| Party | Trusted for | Not trusted for |
| --- | --- | --- |
| The chain | Balances being correct | Anything off-chain |
| The platform | Metering honestly, applying the stated discount | Custody of any user asset |
| The wallet owner | Their own key | Nothing beyond that |
| Third-party data feeds | Display-only figures | Any decision that moves value |

Akai never takes custody. The site has no connect button and never requests a signature.

## 7. Risks and non-goals

- **Token risk.** A token has a price, and the price can fall. Holding is a financial position, not a prepaid service.
- **Allowance risk.** The daily cap means savings are bounded. Very heavy users will outrun it.
- **Platform risk.** Discounts depend on the platform continuing to honor them.
- **Model-provider risk.** Upstream pricing and availability can change.
- **Non-goal:** Akai is not a yield product. Holding $AKAI pays nothing; it grants access.
- **Non-goal:** Akai does not promise a price, a return, or a listing.

## 8. Open questions

1. The curve from balance to discount depth.
2. Allowance size, and whether it scales with balance.
3. Contract address, total supply and distribution (none are stated yet).
4. Whether entitlements can be delegated to a second wallet.
5. How upstream cost changes pass through to the discount.

## 9. Status at a glance

| Item | State |
| --- | --- |
| Contract address | absent |
| Supply and distribution | absent |
| Discount ceiling (95%) | stated |
| Daily allowance | stated |
| Discount curve | absent |
| X account | stated |
| GitHub repository | stated |

The live version of this table is the Ledger section of [akai.lol](https://akai.lol), generated from `src/register.js`.
