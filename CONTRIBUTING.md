# Contributing to `moltalpha-developers`

Thank you for helping improve the public developer SDKs, checkout examples, schemas, and documentation for **MoltAlpha**.

## Core Engineering Rules

1. **Exact Monetary Arithmetic Only**:
   - Never use IEEE-754 floating-point numbers (`Number` in JavaScript/TypeScript or `float` in Python) for monetary unit conversions or settlement verification.
   - Always use `decimalToRawUnits` (`BigInt` in JS/TS) or `decimal_to_raw_units` (`decimal.Decimal` and `int` in Python).
2. **Non-Custodial & Server-Side Verification**:
   - Never fulfill purchases from browser-side callbacks alone. Every payment must be verified server-side against `POST /v1/payments/verify-solana`, `POST /v1/payments/verify-nano`, or `POST /v1/payments/reconcile`.
3. **Public Boundary Allowlist (`scripts/check-public-boundary.mjs`)**:
   - Every tracked file in this repository must be explicitly allowlisted in `scripts/check-public-boundary.mjs` and pass the secret/credential scanner.
   - Never commit private keys, live API tokens, internal infrastructure IP addresses, or unreviewed archives.

## Pre-Submission Verification

Before opening a pull request against `main`, run the full verification suite:

```bash
node scripts/check-public-boundary.mjs
node --test tests/market.test.mjs tests/sdk.test.mjs
python -m unittest discover -s tests -p "test_*.py"
node tools/integration-healthcheck/cli.mjs
```
