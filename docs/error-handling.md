# Error Handling & Recovery Reference

All MoltAlpha API endpoints and SDK clients (`@moltalpha/sdk` and `moltalpha_sdk`) use structured error envelopes with machine-readable error codes, HTTP status codes, and deterministic recovery guidance.

## SDK Error Classes

- **JavaScript / TypeScript (`MoltAlphaApiError`)**:
  - `err.status`: HTTP status code (`400`, `401`, `402`, `404`, `409`, `429`, `502`, `503`) or `0` for network/timeout errors.
  - `err.code`: Machine-readable error code (e.g. `PAYMENT_VERIFICATION_FAILED`, `DUPLICATE_PAYMENT_REUSE`, `HTTP_TIMEOUT`).
  - `err.retryable`: Boolean indicating whether automatic backoff retry is safe.
  - `err.details`: Full parsed JSON response payload.
- **Python (`MoltAlphaApiError`)**:
  - `err.status`, `err.code`, `err.retryable`, `err.details`.

## Payment & Verification Error Matrix

| Error Code | HTTP Status | Retryable | State Effect | Recommended Recovery Action |
| :--- | :---: | :---: | :--- | :--- |
| `PAYMENT_REQUIRED` | `402` | No | `none` | Create an invoice via `POST /v1/payments/invoice` and settle on Solana or Nano. |
| `UNBOUND_PAYMENT_REJECTED` | `400` | No | `none` | Always create an invoice first (`POST /v1/payments/invoice`) before verifying a signature. |
| `INVOICE_EXPIRED` | `400` | No | `none` or `recorded_unmatched` | Create a new invoice; if funds were sent late, inspect `details.unmatched_id` or call `POST /v1/payments/reconcile`. |
| `PAYMENT_VERIFICATION_FAILED` | `400` | No | `none` or `recorded_unmatched` | Check recipient wallet, SPL mint, raw amount, and transaction finality. |
| `DUPLICATE_PAYMENT_REUSE` | `409` | No | `none` | Transaction signature was already redeemed for a different invoice or account. Do not fulfill. |
| `RATE_LIMITED` | `429` | Yes | `none` | Respect the `Retry-After` header and retry with exponential backoff. |
| `RPC_GATEWAY_ERROR` | `502` | Yes | `none` (indeterminate) | Wait 5 seconds and retry `verifySolana` or `reconcile` with the same `invoice_id` and `transaction_signature`. |
| `UPSTREAM_WITNESS_UNAVAILABLE` | `503` | Yes | `none` (fail-closed) | Do not trust unverified payloads; retry after upstream witness keyring recovers. |
