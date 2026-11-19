# Example 1 — Node.js Solana Payment Checkout

A complete, zero-dependency Node.js checkout workflow using `@moltalpha/sdk` (`sdk/javascript/index.mjs`) to:

1. Validate the merchant receiving wallet (`validateMerchantWallet`) and ensure it is never an SPL token mint contract.
2. Convert human-readable decimal amounts (`"10.00"` USDC) into exact `BigInt` raw micro-units (`10000000n`) without floating-point arithmetic.
3. Create a bound Solana payment request (`POST /v1/payments/invoice`) with a unique 32-byte Base58 Solana Pay `reference` key.
4. Display payment instructions and a standards-compliant Solana Pay URI (`solana:<recipient>?amount=...&spl-token=...&reference=...`).
5. Verify on-chain settlement server-side (`POST /v1/payments/verify-solana`) and retrieve invoice status (`GET /v1/payments/invoice/{invoice_id}`).

## Prerequisites

- Node.js 18+
- Copy `env.template` to `.env` if configuring custom environment variables.

## Running the Checkout

### 1. Deterministic Sandbox / Demo Mode (No real funds required)

Runs the complete 5-step checkout and verification lifecycle against a deterministic mocked gateway:

```bash
node examples/node-checkout/checkout.mjs --demo
```

### 2. Live Production Discovery & Invoice Creation (`https://api.moltalpha.dev`)

Creates a real non-custodial payment invoice on `https://api.moltalpha.dev`:

```bash
node examples/node-checkout/checkout.mjs --live --tier=tier_starter --currency=USDC
```

## Security Notes

- **Never fulfill orders from client-side callbacks alone.** Always verify the transaction signature server-side via `client.payments.verifySolana(...)`.
- **Never pass JavaScript floating-point numbers (`Number`) for fractional currency amounts.** Pass decimal strings (`"1.00"`) or `BigInt` raw units.
- **Keep `claim_secret` (`sec_...`) on your backend.** It allows credential and receipt recovery via `POST /v1/payments/invoice/{id}/claim`.

## Expected Output (`--demo`)

```text
[1/4] Merchant wallet verified: BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx (solana)
[2/4] Exact unit check: 1.00 USDC = 1000000 raw micro-units
[3/4] Payment invoice created: inv_demo_solana_001 | 1.00 USDC -> BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx
      Solana Pay URI: solana:BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx?amount=1&spl-token=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&reference=4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi&label=MoltAlpha
[4/4] Settlement verified: status=newly_minted | tier=tier_starter | credits=50
NODE_CHECKOUT_OK
```
