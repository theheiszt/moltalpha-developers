# Changelog

All notable changes to the public `moltalpha-developers` repository and SDK packages are documented in this file.

## [0.1.0] - 2026-11-19

### Added
- **JavaScript Public SDK (`sdk/javascript/`):** Dependency-free Node.js 20+ ESM modules for Witness (`witness.mjs`), Market Data (`market.mjs`), Sentinel (`sentinel.mjs`), Payments (`payments.mjs`), and precision JSON/HTTP transport (`http.mjs`).
- **Python Public SDK (`sdk/python/moltalpha_sdk/`):** Zero-dependency Python 3.10+ stdlib package including pure-Python RFC 8032 Ed25519 verification (`_ed25519.py`), RFC 8785 canonicalization, Market Data, Sentinel, and exact-integer Payments client.
- **Audited TypeScript/Node Packages (`packages/`):**
  - `@moltalpha/witness-verify` (`0.1.0`) — RFC 8785 + RFC 8032 Ed25519 offline verifier library and `moltalpha-verify` CLI.
  - `@moltalpha/x402-solana-middleware` (`0.1.0`) — Express/Connect HTTP 402 payment gate for Solana SPL USDC and Nano (`XNO`) with atomic replay protection.
  - `@moltalpha/solana-agent-kit-plugin` (`0.1.0`) — Solana Agent Kit plugin for x402 quote evaluation, fee-adjusted arbitrage math, and witness receipt verification.
- **JSON Schemas (`schemas/`):** Draft 2020-12 schemas for witness public keys, state witness receipts, market intelligence, sentinel public key, and payment configuration.
- **Documentation (`docs/`):** Comprehensive guides for quickstart, authentication, API reference, witness verification, market data, sentinel, multi-rail payments, and unified error codes.
