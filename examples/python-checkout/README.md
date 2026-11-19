# Example 2 — Python Solana Payment Integration

A minimal, stdlib-only Python 3.10+ backend example demonstrating how to create non-custodial Solana payment requests, convert monetary values with exact `decimal.Decimal` precision, construct Solana Pay URIs, and verify on-chain settlement server-side using `moltalpha_sdk`.

## Prerequisites

- Python 3.10+ (zero third-party runtime dependencies)
- Copy `env.template` to `.env` if setting environment variables.

## Running the Integration

### 1. Deterministic Sandbox / Demo Mode (Offline, no real funds)

```bash
python examples/python-checkout/checkout.py --demo
```

### 2. Live API Invoice Creation (`https://api.moltalpha.dev`)

```bash
python examples/python-checkout/checkout.py --live
```

## Security Notes

- **Never use Python `float` for payment amounts.** `decimal_to_raw_units(0.1, "USDC")` raises a `ValueError` by design; always pass a string (`"10.00"`) or `Decimal("10.00")`.
- **Validate merchant wallets before creating payment links.** `validate_merchant_wallet` rejects the SPL USDC Mint contract (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`).

## Expected Output (`--demo`)

```text
[1/4] Merchant wallet verified: BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx (solana)
[2/4] Exact Decimal check: 10.00 USDC = 10000000 raw micro-units
[3/4] Payment invoice created: inv_py_demo_001 | 1.00 USDC -> BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx
[4/4] Settlement verified: status=newly_minted | tier=tier_starter | credits=50
PYTHON_CHECKOUT_OK
```
