# Unified Error Catalog & Status Code Reconciliation

MoltALPHA exposes machine-readable error catalogs on both hosts:
- **Web Host (`https://www.moltalpha.dev/docs/errors`):** Supports content negotiation (`Accept: application/json` returns a 6-code summary JSON catalog; browser requests return HTML documentation).
- **API Gateway (`https://api.moltalpha.dev/v1/errors`):** Full backend error specification covering all gateway error codes, retryability, `state_effect`, and recovery actions.

---

## Reconciled Error Code Matrix

| Error Code | Gateway HTTP Status (`api.moltalpha.dev`) | Frontend Summary (`www.moltalpha.dev/docs/errors`) | Retryable | State Effect | Meaning & Resolution |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `AUTHENTICATION_REQUIRED` | `401 Unauthorized` | `401` | `false` | `none` | Missing `X-API-KEY` header on an authenticated endpoint (`/v1/account/quota`, `/v1/sentinel/*`). Supply a valid API key. |
| `INVALID_API_KEY` | `401 Unauthorized` (or `403 Forbidden` when key is disabled/revoked) | `403` (Frontend summary) / `401` (Gateway auth check) | `false` | `none` | The supplied `X-API-KEY` is unrecognized, malformed, or revoked. Verify the key or mint a new key via `/v1/payments/invoice`. |
| `PAYMENT_REQUIRED` | `402 Payment Required` | `402` | `false` | `none` | Paid intelligence endpoint (`/v1/intel/latest`) called without an API key. Follow `details.purchase_instructions`. |
| `INSUFFICIENT_CREDITS` | `402 Payment Required` | `402` | `false` | `none` | API key has `0` remaining credits. Create a top-up invoice via `POST /v1/payments/invoice`. |
| `PAYMENT_REPLAY_DETECTED` | `409 Conflict` | `409` | `false` | `none` | On-chain transaction signature or Nano block hash was already claimed. Replays never grant duplicate credits. |
| `DUPLICATE_PAYMENT_REUSE` | `409 Conflict` | Mapped under `PAYMENT_REPLAY_DETECTED` (`409`) | `false` | `none` | Gateway error code returned when a previously redeemed Solana signature or Nano block hash is submitted for a different invoice. |
| `UNBOUND_PAYMENT_REJECTED` | `400 Bad Request` | `400` | `false` | `none` | `POST /v1/payments/verify-solana` called without an `invoice_id` or matching invoice reference key. Always create an invoice first. |
| `INSUFFICIENT_PAYMENT_AMOUNT` | `400 Bad Request` / `422 Unprocessable Entity` | `400` / `422` | `false` | `none` | On-chain transfer amount is less than the invoice-quoted `amount_raw`. Underpaid Solana transfers are quarantined in `unmatched_payments` with reason `UNDERPAID_AMOUNT`. |
| `RATE_LIMIT_EXCEEDED` | `429 Too Many Requests` | `429` | `true` | `none` | Per-IP or per-key rate limit exceeded. Honor the `Retry-After` response header before retrying. |
| `RESOURCE_NOT_FOUND` | `404 Not Found` | `404` | `false` | `none` | Requested witness ID, invoice ID, or route (such as `/v1/sentinel/history` without `{pool_address}`) does not exist. |
