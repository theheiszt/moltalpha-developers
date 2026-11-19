# API Reference

Complete production endpoint matrix across `https://www.moltalpha.dev` and `https://api.moltalpha.dev`.

---

## 1. Web & Market Data Host (`https://www.moltalpha.dev`)

| Method & Path | Query Parameters | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET /api/market-intelligence` | None | Public | Real-time token quotes (`SOL`, `JUP`, `BONK`), provenance (`COINBASE_EXCHANGE_LIVE`), and macro metrics. Strip `simulatedDemoFallback` in production clients. |
| `GET /api/market-candles` | `pair=SOL-USD`, `granularity=3600` | Public | Live OHLCV candle array from Coinbase Exchange. *(Note: do not call `/api/v1/market/sol-candles`, which hits the SPA HTML fallback).* |
| `GET /api/v1/forecasts` | None | Public | Calibrated market forecast records. |
| `GET /docs/errors` | None (`Accept: application/json` or `text/html`) | Public | Content-negotiated error specification (returns JSON when `Accept: application/json`, or HTML documentation in browsers). |

---

## 2. Core API Gateway (`https://api.moltalpha.dev`)

### Discovery & Cryptographic Witnesses
| Method & Path | Auth | Credits | Description |
| :--- | :--- | :--- | :--- |
| `GET /v1/health` | Public | 0 | Service health, SQLite WAL status, and canonical Solana & Nano treasuries. |
| `GET /v1/witnesses/public-keys` | Public | 0 | Active and historical Ed25519 witness public keys (`SPKI hex`, `PEM`, `Base58`). |
| `GET /v1/witnesses/{witness_id}` | Public | 0 | Fetch a signed state witness receipt by ID (`404 RESOURCE_NOT_FOUND` if unknown). |

### Sentinel DeFi Risk & Telemetry
| Method & Path | Tier Required | Description |
| :--- | :--- | :--- |
| `GET /v1/sentinel/public-key` | Public (0 credits) | Sentinel Ed25519 signing key metadata (`RFC8032`, `RFC8785`). |
| `GET /v1/sentinel/feed` | `SENTINEL_MEMBER` | Real-time multi-pool risk score feed. |
| `GET /v1/sentinel/anomalies/live` | `SENTINEL_PRO` | Live liquidity and volatility anomaly alerts. |
| `GET /v1/sentinel/pools/{pool_address}/risk` | `SENTINEL_MEMBER` | Pool-specific composite risk report. |
| `GET /v1/sentinel/pools/{pool_address}/observations` | `SENTINEL_PRO` | Granular pool liquidity observations. |
| `GET /v1/sentinel/pools/{pool_address}/history` | `SENTINEL_PRO` | Historical risk time series for `{pool_address}`. *(Note: `/v1/sentinel/history` without a pool address is not a route and returns HTTP `404`).* |
| `GET /v1/sentinel/agent/{agent_handle}` | `SENTINEL_MEMBER` | Autonomous agent behavioral risk profile. |

### Payments & Account Quota
| Method & Path | Auth | Description |
| :--- | :--- | :--- |
| `GET /v1/payments/config` | Public | Canonical treasury addresses, SPL mint, and integer pricing tiers (`usdc_units`, `sol_lamports`, `nano_raw`). |
| `POST /v1/payments/invoice` | Public | Create an invoice-bound payment quote (`rail: "solana" \| "nano"`, `asset: "SOL" \| "USDC" \| "XNO"`). |
| `GET /v1/payments/invoice/{invoice_id}` | Public | Check invoice settlement status (`pending`, `fulfilled`, `expired`). |
| `POST /v1/payments/verify-solana` | Public | Verify finalized Solana `SOL` or `SPL USDC` transfer and claim API key/credits. |
| `POST /v1/payments/verify-nano` | Public | Verify confirmed Nano (`XNO`) block hash and claim API key/credits. |
| `POST /v1/payments/reconcile` | Public | Reconcile or quarantine an on-chain Solana transaction. |
| `GET /v1/account/quota` | `X-API-KEY` | Inspect remaining credits, active lots, and entitlement expiry. |
