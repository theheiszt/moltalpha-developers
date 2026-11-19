# MoltAlpha Developers — Non-Custodial Solana Payment Infrastructure & SDK Toolkit

Official public developer repository for **MoltAlpha** (`https://www.moltalpha.dev` · `https://api.moltalpha.dev`).

MoltAlpha provides **developer-first, non-custodial cryptocurrency payment infrastructure** focused on **Solana (`USDC` and `SOL`)** with secondary zero-fee settlement on **Nano (`XNO`)**, alongside cryptographic **Ed25519 State Witnesses**, **Coinbase Exchange / Metal X Market Data**, and **Sentinel DEX Risk Intelligence**.

---

## 5-Minute Developer Quickstart

### TypeScript / Node.js (`@moltalpha/sdk`)

```typescript
import { MoltAlpha } from './sdk/typescript/dist/index.js';

const client = new MoltAlpha({
  apiKey: process.env.MOLTALPHA_API_KEY,
  baseUrl: 'https://api.moltalpha.dev',
});

// 1. Create a non-custodial Solana USDC payment request (POST /v1/payments/invoice)
const payment = await client.payments.create({
  tier: 'tier_starter',
  currency: 'USDC',
  network: 'solana',
  cluster: 'mainnet-beta',
});

console.log('Invoice ID:', payment.invoice_id);
console.log('Solana Pay URI:', payment.solana_pay_url);

// 2. Verify on-chain settlement server-side (POST /v1/payments/verify-solana)
const verified = await client.payments.verifySolana({
  invoice_id: payment.invoice_id,
  transaction_signature: '<SOLANA_TX_SIGNATURE>',
  claim_secret: payment.claim_secret,
});

console.log('Verified status:', verified.status, 'Credits:', verified.credits);
```

### Python 3.10+ (`moltalpha_sdk`, zero third-party dependencies)

```python
import os
from moltalpha_sdk import MoltAlphaClient

client = MoltAlphaClient(
    api_key=os.environ.get("MOLTALPHA_API_KEY"),
    base_url="https://api.moltalpha.dev",
)

# 1. Create a non-custodial Solana USDC payment request
payment = client.payments.create(
    tier="tier_starter",
    currency="USDC",
    network="solana",
    cluster="mainnet-beta",
)
print("Invoice ID:", payment["invoice_id"])
print("Solana Pay URI:", payment["solana_pay_url"])

# 2. Verify on-chain settlement server-side
verified = client.payments.verify_solana(
    {
        "invoice_id": payment["invoice_id"],
        "transaction_signature": "<SOLANA_TX_SIGNATURE>",
        "claim_secret": payment["claim_secret"],
    }
)
print("Verified status:", verified["status"])
```

---

## Repository Structure

```text
moltalpha-developers/
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── SECURITY.md
├── CHANGELOG.md
├── docs/
│   ├── quickstart.md
│   ├── authentication.md
│   ├── payment-lifecycle.md
│   ├── webhooks.md
│   ├── settlement-verification.md
│   ├── error-handling.md
│   ├── security-best-practices.md
│   ├── payment-platform-reorientation-audit.md
│   ├── payments.md
│   ├── witness.md
│   ├── sentinel.md
│   ├── market-data.md
│   ├── api-reference.md
│   └── errors.md
├── sdk/
│   ├── typescript/              # @moltalpha/sdk TypeScript definitions & ESM package
│   ├── javascript/              # Dependency-free Node.js ESM SDK
│   └── python/                  # Dependency-free Python 3.10+ SDK (moltalpha_sdk)
├── examples/
│   ├── node-checkout/           # Example 1: Node.js Solana Payment Checkout
│   ├── python-checkout/         # Example 2: Python Solana Payment Integration
│   ├── react-checkout/          # Example 3: Reusable React Payment Checkout Component
│   ├── webhook-server/          # Example 4: HMAC-SHA256 Replay-Resistant Webhook Receiver
│   ├── ai-agent-payments/       # Example 5: Autonomous Agent HTTP 402 Payment Workflow
│   ├── market.mjs               # Read-only market data CLI (Node.js)
│   └── market.py                # Read-only market data CLI (Python)
├── tools/
│   ├── payment-verifier/        # CLI: wallet validation, BigInt unit check & Solana Pay URI builder
│   ├── webhook-tester/          # CLI: HMAC-SHA256 webhook signature generator & replay tester
│   └── integration-healthcheck/ # CLI: end-to-end local SDK & live API connectivity diagnostic
├── packages/
│   ├── witness-verify/          # @moltalpha/witness-verify (RFC 8785 JCS + Ed25519 SPKI verifier)
│   ├── x402-solana-middleware/  # @moltalpha/x402-solana-middleware (HTTP 402 Solana settlement)
│   └── solana-agent-kit-plugin/ # @moltalpha/solana-agent-kit-plugin
├── schemas/                     # Draft 2020-12 JSON Schemas
├── scripts/
│   └── check-public-boundary.mjs
└── tests/
    ├── market.test.mjs
    ├── sdk.test.mjs
    └── test_sdk.py
```

---

## Canonical Settlement Addresses & Anti-Mint Safety

| Rail / Contract | Canonical Identifier | Notes |
| :--- | :--- | :--- |
| **Solana Treasury Wallet (`SOL` & SPL `USDC`)** | `BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx` | Direct-to-wallet settlement recipient |
| **SPL USDC Token Mint Contract (Solana Mainnet)** | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | **Token Mint Contract ONLY** — never send funds directly to the mint address |
| **Nano (`XNO`) Treasury Address** | `nano_1s5ce5k7bj74sp31m3opq8xwx44stc5dgw6w8uajyg61xjg9wiaae4uby6pu` | Zero-fee $10^{30}$ raw unit settlement |

---

## Verification & Diagnostic Commands

```bash
# 1. Verify public boundary allowlist and secret hygiene
node scripts/check-public-boundary.mjs

# 2. Run JavaScript / TypeScript SDK, checkout examples, and CLI tool tests
node --test tests/market.test.mjs tests/sdk.test.mjs

# 3. Run Python SDK and checkout tests
python -m unittest discover -s tests -p "test_*.py"

# 4. Run interactive examples and diagnostic tools directly
node examples/node-checkout/checkout.mjs --demo
python examples/python-checkout/checkout.py --demo
node examples/webhook-server/server.mjs --self-test
node examples/ai-agent-payments/agent-checkout.mjs --demo
node tools/integration-healthcheck/cli.mjs
```

---

## License

Released under the [MIT License](./LICENSE).
