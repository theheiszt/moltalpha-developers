# Security Policy

## Reporting a Vulnerability

If you discover a security issue in any MoltALPHA SDK, verification package, or public API contract:

1. **Do not open a public GitHub issue** for active vulnerabilities.
2. Email **security@moltalpha.dev** with:
   - Affected package, endpoint, or file path
   - Reproduction steps or proof-of-concept
   - Impact assessment

We acknowledge vulnerability reports within 24 hours and coordinate disclosure once a fix is verified.

## Cryptographic & Settlement Safety Principles

1. **Public Boundary Enforcement:** `scripts/check-public-boundary.mjs` runs in CI on every push and pull request. It enforces an explicit file allowlist and rejects private keys, API tokens, `.env` files, symlinks, and internal infrastructure references.
2. **Offline Witness Verification (`Ed25519` + `RFC 8785`):** Always verify witness receipts against the live key registry (`GET https://api.moltalpha.dev/v1/witnesses/public-keys`) and fail closed if a key has status `REVOKED`, `RETIRED`, or is past `expires_at`.
3. **Exact Integer Payment Math:** Never use IEEE-754 floating-point numbers (`Number`, `float`) for cryptocurrency settlement amounts. Use `BigInt` in JavaScript and `int` / `decimal.Decimal` in Python.
4. **Durable Replay Protection:** Every payment transaction signature (`Solana`) or block hash (`Nano`) can be redeemed at most once across all invoices and application instances.
