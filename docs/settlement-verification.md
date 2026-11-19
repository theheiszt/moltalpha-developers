# On-Chain Settlement Verification & Reliability Guide

MoltAlpha treats payment verification as critical financial infrastructure. Never treat a client-supplied transaction signature or browser callback alone as proof that a valid payment occurred.

## 1. Ten-Point Server-Side Verification Checklist

When `POST https://api.moltalpha.dev/v1/payments/verify-solana` (or `POST /v1/payments/reconcile`) inspects a Solana transaction signature, it enforces:

1. **Signature Format & Length**: Base58 string between 64 and 90 characters.
2. **Cross-Invoice & Cross-Account Replay Check**: Looks up the signature in `payment_redemptions` (and `payment_claims` in Firestore on `www.moltalpha.dev`). If already redeemed for a different invoice or account, rejects immediately with `HTTP 409 DUPLICATE_PAYMENT_REUSE`.
3. **Active Invoice Binding**: Unbound transactions without an `invoice_id` or matching `reference` are rejected (`HTTP 400 UNBOUND_PAYMENT_REJECTED`) to prevent mempool/RPC front-running.
4. **Expiration Enforcement**: Checks invoice `status` and `expires_at` against current UTC time.
5. **Solana Network & Cluster Match**: Confirms the transaction exists on the configured cluster (`mainnet-beta` or `devnet`).
6. **Transaction Execution Success & Commitment**: Confirms `meta.err === null` at confirmed/finalized commitment.
7. **Destination Wallet Verification**: Verifies pre/post balances for the canonical treasury wallet (`BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx`).
8. **Token Mint & Decimals Verification**: For SPL `USDC`, verifies the token account mint is `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (`6` decimals); for native `SOL`, verifies lamport balance delta (`9` decimals).
9. **Exact Raw Integer Amount Check**: Compares exact integer `amount_raw` (`payment.amount_raw >= invoice.amount_raw`) without floating-point conversion.
10. **Reference Account Attribution**: Confirms the invoice's unique 32-byte `reference` public key is present in the transaction's account keys.

---

## 2. Payment State Machine

| State | Meaning | Developer Action |
| :--- | :--- | :--- |
| `pending` (`pending_or_unredeemed`) | Invoice created; awaiting on-chain payment and verification. | Display `solana_pay_url` / payment instructions; poll or submit signature upon transfer. |
| `fulfilled` (`newly_minted` / `topped_up` / `redeemed`) | On-chain settlement verified and credits/order atomically granted. | Deliver product or use issued `api_key`. |
| `already_redeemed` | Idempotent retry for the same `(invoice_id, tx_signature)` pair. | Safe no-op; recover credential via `POST /v1/payments/invoice/{id}/claim` if needed. |
| `expired` | Invoice TTL elapsed before verification. | If customer already paid on-chain, call `POST /v1/payments/reconcile`; otherwise create a new invoice. |
| `QUARANTINED_UNMATCHED` (`HELD`) | Valid on-chain transfer arrived late, underpaid, or with mismatched asset. | Recorded in `unmatched_payments` with an Ed25519 state witness receipt for manual refund dispatch (`POST /v1/payments/refund/{unmatched_id}`). |

---

## 3. Handling Partial Payments, Overpayments & RPC Outages

- **Underpayments (`payment.amount_raw < invoice.amount_raw`)**: Never partially fulfill an order. The backend rejects fulfillment (`HTTP 400 PAYMENT_VERIFICATION_FAILED`), records the deposit in `unmatched_payments` (`reason: "UNDERPAID_AMOUNT"`), and returns the `unmatched_id` and `refund_endpoint`.
- **Expired Invoice Paid Late**: If an on-chain payment arrives after `expires_at`, `verify-solana` and `reconcile` detect the transfer, quarantine it under `reason: "EXPIRED_INVOICE_PAID"`, and issue a signed witness receipt.
- **RPC Outages & Delayed Confirmations (`HTTP 502 RPC_GATEWAY_ERROR`)**: When Solana RPC nodes experience transient congestion, the API returns `HTTP 502` with `retryable: true` and `Retry-After: 5`. Both `@moltalpha/sdk` and `moltalpha_sdk` automatically retry transient `502`/`503`/`504` responses with exponential backoff.
