# Multi-Rail Payments (`SOL`, `SPL USDC` & `Nano XNO`)

MoltALPHA supports autonomous agent and developer settlement across **Solana (`SOL` and `SPL USDC`)** and **Nano (`XNO`, zero network fees)** via `https://api.moltalpha.dev`.

---

## 1. Canonical Treasury & Mint Addresses

Always verify payment configuration via `GET https://api.moltalpha.dev/v1/payments/config`:

- **Solana Treasury Wallet (`solana_treasury_wallet`):**
  `BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx`
- **Canonical SPL USDC Mint Contract (`usdc_spl_mint_contract`):**
  `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
  *(Warning: Always send SPL USDC transfers to the Solana treasury wallet above — never transfer tokens directly to the USDC mint contract address).*
- **Canonical Nano Treasury Address (`nano_treasury_address`):**
  `nano_1s5ce5k7bj74sp31m3opq8xwx44stc5dgw6w8uajyg61xjg9wiaae4uby6pu`

---

## 2. Exact Integer Arithmetic Rules (No Floating-Point Math)

> **CRITICAL:** Never use IEEE-754 floating-point numbers (`Number` / `parseFloat` in JavaScript, or `float` in Python) to parse, convert, or compare payment amounts.
>
> - **Solana (`SOL`):** `1 SOL = 10^9 lamports` (`1,000,000,000`)
> - **SPL USDC (`USDC`):** `1 USDC = 10^6 micro-USDC` (`1,000,000`)
> - **Nano (`XNO`):** `1 XNO = 10^30 raw` (`1,000,000,000,000,000,000,000,000,000,000`)
>
> Because `10^30` exceeds JavaScript `Number.MAX_SAFE_INTEGER` (`2^53 - 1 = 9,007,199,254,740,991`), standard `JSON.parse()` on unquoted 30-digit JSON integers silently corrupts the lower digits into zeroes.
> Use `parsePaymentConfigJson()` / `PaymentsClient.getConfig()` in `sdk/javascript/payments.mjs` (which quotes `>= 16`-digit JSON integer literals before `JSON.parse` and converts with `BigInt`) or `sdk/python/moltalpha_sdk/payments.py` (which uses Python arbitrary-precision `int` and `decimal.Decimal`).

---

## 3. Invoice & Settlement Lifecycle

1. **Create an Invoice (`POST /v1/payments/invoice`):**
   Returns an invoice with `status: "pending"`, `invoice_id`, `claim_secret`, `amount_raw`, and `recipient`.
   *(Note: `status: "pending"` means the quote is awaiting on-chain payment; credits are never granted until verification succeeds).*
2. **Execute On-Chain Transfer:**
   Transfer the exact `amount_raw` to the canonical treasury address.
3. **Verify Settlement:**
   - **Solana:** `POST /v1/payments/verify-solana` with `{ "invoice_id": "...", "claim_secret": "...", "transaction_signature": "..." }`
   - **Nano:** `POST /v1/payments/verify-nano` with `{ "invoice_id": "...", "claim_secret": "...", "block_hash": "..." }`
4. **Replay Protection:**
   Every Solana `transaction_signature` and Nano `block_hash` is bound to a durable, atomic uniqueness ledger. Reusing an already-settled transaction against another invoice returns HTTP `409 Conflict` (`PAYMENT_REPLAY_DETECTED` / `DUPLICATE_PAYMENT_REUSE`).
