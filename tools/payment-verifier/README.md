# Tool 1 — Payment Verifier CLI (`tools/payment-verifier/cli.mjs`)

Diagnostic command-line tool for validating merchant wallet addresses, verifying exact `BigInt` monetary conversions, constructing Solana Pay URIs, and inspecting live invoice or transaction statuses.

## Usage

```bash
# Run deterministic offline self-test
node tools/payment-verifier/cli.mjs --self-test

# Validate a merchant wallet address
node tools/payment-verifier/cli.mjs --wallet=BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx --rail=solana

# Convert decimal amount to exact raw integer units and generate Solana Pay URI
node tools/payment-verifier/cli.mjs --amount=10.00 --asset=USDC

# Check live invoice status on https://api.moltalpha.dev
node tools/payment-verifier/cli.mjs --invoice=inv_...
```
