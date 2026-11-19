# Changelog

## 1.0.0 — 2026-11-19

### Added
- **Unified Non-Custodial Payment SDK (`@moltalpha/sdk` & `moltalpha_sdk`)**:
  - Added TypeScript package (`sdk/typescript`) and expanded JavaScript (`sdk/javascript`) and Python (`sdk/python/moltalpha_sdk`) SDKs with unified `MoltAlpha` / `MoltAlphaClient` classes.
  - Added `validateMerchantWallet` / `validate_merchant_wallet` with explicit anti-mint safety guard rejecting the SPL USDC Mint contract (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`).
  - Added `buildSolanaPayUrl` / `build_solana_pay_url` using exact integer/Decimal conversion.
  - Added `signWebhookPayload` / `verifyWebhookSignature` (HMAC-SHA256 `t=<unix_ts>,v1=<hex>` with constant-time digest check and 300-second replay window) and `verifyInboundWebhookSecret`.
  - Added `getTransactionStatus` (`GET /v1/payments/status/{signature}`) and `claimCredential` (`POST /v1/payments/invoice/{id}/claim`).
- **Working Integration Examples (`examples/`)**:
  - `examples/node-checkout/`: Node.js Solana Payment Checkout (`--demo` and `--live`).
  - `examples/python-checkout/`: Python 3.10+ Solana Payment Integration (`--demo` and `--live`).
  - `examples/react-checkout/`: Reusable accessible React + TypeScript checkout component (`MoltAlphaCheckout.tsx`).
  - `examples/webhook-server/`: Replay-resistant HMAC-SHA256 webhook receiver with idempotent event deduplication and `--self-test`.
  - `examples/ai-agent-payments/`: Autonomous AI agent HTTP 402 payment workflow.
- **Diagnostic CLI Tools (`tools/`)**:
  - `tools/payment-verifier/cli.mjs`: Wallet validation, BigInt unit checks, Solana Pay URI builder, and invoice status lookup.
  - `tools/webhook-tester/cli.mjs`: Webhook signature generator, replay tester, and local dispatcher.
  - `tools/integration-healthcheck/cli.mjs`: End-to-end SDK configuration and live API gateway diagnostic tool.
- **Payment Architecture & Security Documentation (`docs/`, `CONTRIBUTING.md`)**:
  - Added `CONTRIBUTING.md`, `docs/payment-platform-reorientation-audit.md`, `docs/payment-lifecycle.md`, `docs/webhooks.md`, `docs/settlement-verification.md`, `docs/error-handling.md`, and `docs/security-best-practices.md`.

## 0.1.0 — 2026-11-19

- Initial public release of the MoltALPHA Developer SDK & Reference Verifier Suite:
  - Witness verification SDK (`sdk/javascript/witness.mjs`, `sdk/python/moltalpha_sdk/witness.py`, `packages/witness-verify`).
  - Market Data SDK (`sdk/javascript/market.mjs`, `sdk/python/moltalpha_sdk/market.py`).
  - Sentinel Risk Intelligence client (`sdk/javascript/sentinel.mjs`, `sdk/python/moltalpha_sdk/sentinel.py`).
  - Multi-rail Payments & Exact Integer Unit SDK (`sdk/javascript/payments.mjs`, `sdk/python/moltalpha_sdk/payments.py`).
  - Distributable packages (`@moltalpha/witness-verify`, `@moltalpha/x402-solana-middleware`, `@moltalpha/solana-agent-kit-plugin`).
  - Draft 2020-12 JSON Schemas in `schemas/` and developer documentation in `docs/`.
