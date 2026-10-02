# Waffo Pancake WeChat Pay research

Date: 2026-10-02
Branch: `research/waffo-wechat-pay`

## Question

Waffo announced WeChat Pay support in July, but the live Catea Pancake checkout
only shows card, Apple Pay, and Google Pay. Determine whether this is an account
configuration problem, a checkout integration problem, or a product/currency
limitation.

## Current Catea setup

The live Pancake store and product checked during the production cutover were:

- Store: `Catea`
  - live mode enabled
  - production pay-in enabled
  - no admin-blocked payment methods reported by the store response
- Product: `Catea Pro Monthly`
  - subscription product
  - monthly billing period
  - active
  - USD price only

That means the checkout currently exercises the `subscription + USD` payment
method matrix.

## Findings

Waffo's public marketing/payment pages describe portfolio-level support: Waffo
supports one-time payments, subscriptions, and a large payment-method catalog
that includes WeChat Pay. This does not mean every method is available for every
Pancake product type and currency.

The Pancake SDK documentation is more specific. Its `PaymentMethod` enum includes
`wechat`, but method availability depends on the product type and currency pair:

- one-time USD: card, Apple Pay, Google Pay, WeChat Pay
- one-time CNY: WeChat Pay
- one-time EUR/GBP/HKD/JPY: card, Apple Pay, Google Pay
- subscription USD/EUR/GBP/HKD/JPY: card, Apple Pay, Google Pay
- subscription CNY: rejected at checkout creation; the SDK changelog says it has
  never produced a successful charge

The SDK changelog also documents `includePaymentMethods` and
`excludePaymentMethods`. `includePaymentMethods` can force a whitelist only when
the requested methods are already supported by the product type and currency; an
unsupported value is rejected with HTTP 400. Therefore passing `wechat` for the
current `subscription + USD` product should not make WeChat Pay appear.

## Conclusion

This does not look like a Catea integration bug or a Waffo account block. The
most likely reason WeChat Pay is absent is that the current Catea product is a
monthly USD subscription, while Pancake's published payment-method matrix does
not list WeChat Pay for subscription products.

The July WeChat Pay support appears to apply to Pancake checkouts where WeChat is
in the supported matrix, especially one-time USD and one-time CNY orders. It does
not appear to cover recurring USD subscriptions.

## Recommended experiment

Create a separate live/test Pancake product only for WeChat verification:

1. Product: `Catea Pro 30-day Pass`
2. Product type: one-time
3. Currency: USD first, optionally CNY if the dashboard allows it
4. Checkout request:
   - `productType: "onetime"`
   - `currency: "USD"` or `currency: "CNY"`
   - `includePaymentMethods: ["wechat"]`

Expected outcomes:

- If the checkout is created and shows WeChat Pay, Pancake WeChat is available
  for one-time purchases but not for the current monthly subscription plan.
- If checkout creation returns 400, the response body should identify the exact
  unsupported product/currency/method combination.
- If checkout is created but WeChat still does not show, then the next thing to
  ask Waffo support is whether WeChat Pay is enabled for this merchant/store in
  live mode.

## Product decision

For the current Catea Pro subscription:

- Keep Waffo Pancake for overseas recurring payment: card, Apple Pay, Google Pay.
- Use XorPay for domestic RMB payment if CNY/WeChat is required before Pancake
  supports recurring WeChat.
- If WeChat under Waffo is important, implement it as a one-time 30-day pass and
  map successful one-time orders to a 30-day Pro entitlement in Asgard.

## Sources

- Pancake Go SDK package docs:
  https://pkg.go.dev/github.com/waffo-com/waffo-pancake-sdk-go
- Pancake Go SDK changelog:
  https://github.com/waffo-com/waffo-pancake-sdk-go/blob/main/CHANGELOG.md
- Waffo payment methods catalog:
  https://waffo.com/en/payment-methods
- Waffo payments overview:
  https://waffo.com/en/payments

