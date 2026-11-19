# Tool 3 — Integration Healthcheck CLI (`tools/integration-healthcheck/cli.mjs`)

End-to-end diagnostic CLI that verifies:

1. Local SDK configuration and client initialization (`MoltAlpha`).
2. Merchant wallet validation (`validateMerchantWallet`) and anti-mint guard (`MINT_ADDRESS_NOT_WALLET`).
3. Exact `BigInt` monetary unit precision (`USDC` $10^6$, `SOL` $10^9$, `XNO` $10^{30}$).
4. Webhook signature creation, constant-time verification, and replay window rejection.
5. Optional live API connectivity (`--live`) against `https://api.moltalpha.dev/v1/payments/config` and `https://api.moltalpha.dev/v1/witnesses/public-keys`.

## Usage

```bash
# Offline SDK & configuration healthcheck
node tools/integration-healthcheck/cli.mjs

# Include live API gateway connectivity checks
node tools/integration-healthcheck/cli.mjs --live
```
