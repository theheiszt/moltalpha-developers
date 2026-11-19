# Security Best Practices for Payment Integrations

Follow these security requirements when integrating MoltAlpha into production websites, SaaS platforms, or autonomous AI agents.

## 1. Non-Custodial Wallet Hygiene

- **Never collect or transmit customer private keys.** Customers sign transactions locally in their own wallet (Phantom, Solflare, Backpack, hardware wallet, or isolated agent signer).
- **Validate merchant receiving addresses.** Always validate configured receiving addresses with `validateMerchantWallet(address, rail)` (`@moltalpha/sdk`) or `validate_merchant_wallet(address, rail)` (`moltalpha_sdk`).
- **Never send funds to the SPL USDC Mint contract.** The address `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` is the token mint contract, not a treasury wallet. Sending tokens directly to the mint contract results in permanent loss.

## 2. Exact Integer & Decimal Monetary Arithmetic

- **Never use IEEE-754 floating-point numbers (`Number` or `float`) for payment calculations.**
  - In JavaScript/TypeScript, `0.1 + 0.2 !== 0.3`, and Nano raw units ($10^{30}$ raw per XNO) exceed `Number.MAX_SAFE_INTEGER` ($2^{53} - 1$).
  - Always pass decimal strings (`"10.00"`) to `decimalToRawUnits(amount, 'USDC')` (returns exact `BigInt`) or `Decimal("10.00")` to `decimal_to_raw_units(amount, "USDC")` in Python (returns arbitrary-precision `int`).
  - When parsing raw JSON from `/v1/payments/config`, use `parsePaymentConfigJson()` so `>2^53` integers are preserved as exact strings before `JSON.parse`.

## 3. Server-Side Settlement Verification & Replay Prevention

- **Never fulfill orders based on browser callbacks alone.** A client browser can spoof a frontend callback. Only fulfill orders after your backend receives a verified response from `POST /v1/payments/verify-solana` (or verifies a signed webhook via `verifyWebhookSignature`).
- **Bind every payment to an invoice.** Always create an invoice (`POST /v1/payments/invoice`) and include the returned 32-byte `reference` public key in the Solana Pay transfer so transactions cannot be front-run or replayed across orders.
- **Enforce database-level idempotency.** Store redeemed `transaction_signature` and `invoice_id` values with a `UNIQUE` constraint so concurrent requests or duplicate webhook deliveries cannot double-credit a user.

## 4. Credential & Webhook Secret Storage

- Store `MOLTALPHA_API_KEY`, `MOLTALPHA_WEBHOOK_SECRET`, and invoice `claim_secret` (`sec_...`) in server-side environment variables or a secret manager (e.g. Google Secret Manager, AWS Secrets Manager).
- Never embed live API keys or `claim_secret` values in client-side JavaScript bundles or public repositories.
