# Payment Lifecycle Guide

MoltAlpha provides non-custodial cryptocurrency payment infrastructure for websites, SaaS applications, and autonomous AI agents, with primary settlement on **Solana (`USDC` and `SOL`)** and a secondary zero-fee rail on **Nano (`XNO`)**.

## End-to-End Payment Architecture

```text
+-------------+   1. POST /v1/payments/invoice   +-----------------------+
|  Merchant   | -------------------------------> |    MoltAlpha API      |
| Application | <------------------------------- | (api.moltalpha.dev)   |
+-------------+   invoice_id, reference,         +-----------------------+
       |          solana_pay_url, claim_secret              |
       |                                                    | 3. POST /v1/payments/verify-solana
       | 2. Customer sends SOL / SPL USDC                   |    Verifies cluster, recipient,
       |    with 32-byte reference key                      |    SPL mint, raw amount, reference,
       v                                                    v    finality & replay ledger
+-------------+                                  +-----------------------+
|  Customer   | ==============================>  |   Solana Blockchain   |
|   Wallet    |   Direct-to-Wallet Settlement    |  (Mainnet / Devnet)   |
+-------------+                                  +-----------------------+
```

## Four-Stage Lifecycle

### Stage 1: Create Payment Request (`POST /v1/payments/invoice`)

The merchant backend creates a payment request specifying the pricing tier (`tier_micro`, `tier_starter`, `tier_pro`, `tier_premium`, or a top-up package), asset (`USDC`, `SOL`, or `XNO`), and cluster (`mainnet-beta` or `devnet`).

The API returns:
- `invoice_id`: Unique invoice identifier (`inv_...`).
- `reference`: A unique 32-byte Base58 public key included as a read-only account in the Solana transaction so the payment is unambiguously attributed to this invoice.
- `amount_raw`: Exact integer amount in smallest units (`10^6` micro-units per USDC, `10^9` lamports per SOL, `10^30` raw per XNO).
- `treasury_wallet` / `recipient`: Canonical receiving wallet (`BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx` on Solana).
- `solana_pay_url`: Standards-compliant `solana:<recipient>?amount=...&spl-token=...&reference=...` URI.
- `claim_secret`: Confidential recovery token (`sec_...`) stored server-side by the merchant.
- `expires_at`: ISO-8601 expiration timestamp (default 30-minute TTL).

### Stage 2: Customer Pays Direct-to-Wallet

The customer completes the transfer using any Solana Pay wallet or standard SPL token transfer to `treasury_wallet` including the `reference` public key. MoltAlpha is **non-custodial** and never holds customer private keys.

> **Important Anti-Mint Safeguard:** Never send SPL USDC directly to the USDC Mint contract (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`). Use `validateMerchantWallet()` in `@moltalpha/sdk` or `moltalpha_sdk` to enforce this check automatically.

### Stage 3: Verify On-Chain (`POST /v1/payments/verify-solana`)

Once the transaction is broadcast and confirmed on Solana, the merchant backend submits `{ invoice_id, transaction_signature, claim_secret }` to `POST /v1/payments/verify-solana`.

The server verifies:
1. Transaction signature format and replay status (`payment_redemptions` uniqueness).
2. Active invoice existence and non-expired status (`expires_at`).
3. On-chain transaction finality and zero execution error (`meta.err === null`).
4. Destination wallet (`treasury_wallet`), SPL token mint (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` for USDC), and exact raw integer delta (`>= invoice.amount_raw`).
5. Inclusion of the invoice's 32-byte `reference` account to prevent transaction front-running.

### Stage 4: Confirm Settlement & Reconcile

Upon verification:
- The invoice transitions atomically from `pending` to `fulfilled`.
- The transaction signature is permanently bound to `invoice_id` in the replay ledger (subsequent cross-invoice reuse returns `HTTP 409 DUPLICATE_PAYMENT_REUSE`).
- If an on-chain transfer arrived late (`EXPIRED_INVOICE_PAID`), with the wrong token (`ASSET_MISMATCH`), or below the required amount (`UNDERPAID_AMOUNT`), it is quarantined in the `unmatched_payments` ledger (`status: "HELD"`) and can be inspected via `POST /v1/payments/reconcile`.
