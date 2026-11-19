# MoltALPHA — Public Developer SDKs, Schemas & API Documentation

Official public developer repository for **MoltALPHA** (`https://www.moltalpha.dev` and `https://api.moltalpha.dev`): cryptographic Witness verification, real-time Market Intelligence, Sentinel DeFi pool risk feeds, and multi-rail Solana (`SOL`, `SPL USDC`) + Nano (`XNO`) HTTP 402 agentic payments.

---

## Architecture & Host Routing

MoltALPHA operates across two production hosts:

| Host | Base URL | Responsibility |
| :--- | :--- | :--- |
| **Web & Market Data Host** | `https://www.moltalpha.dev` | Public web portal, `/api/market-intelligence`, `/api/market-candles`, `/api/v1/forecasts`, `/docs/errors` (HTML + JSON content negotiation) |
| **Core API Gateway** | `https://api.moltalpha.dev` | `/v1/health`, `/v1/witnesses/*`, `/v1/sentinel/*`, `/v1/payments/*`, `/v1/account/quota`, `/v1/errors`, `/openapi.json` |

---

## Repository Structure

```text
moltalpha-developers/
├── docs/
│   ├── quickstart.md         # 5-minute developer & autonomous agent quickstart
│   ├── authentication.md     # X-API-KEY & HTTP 402 metered credit lifecycle
│   ├── api-reference.md      # Production endpoint matrix across www & api hosts
│   ├── witness.md            # RFC 8032 Ed25519 + RFC 8785 JCS verification guide
│   ├── market-data.md        # Live market intelligence & candle provenance guide
│   ├── sentinel.md           # DeFi pool risk, observations & history endpoints
│   ├── payments.md           # SOL, SPL USDC & Nano (XNO) exact integer settlement
│   └── errors.md             # Unified error catalog (/docs/errors + /v1/errors)
├── sdk/
│   ├── javascript/           # Dependency-free Node.js 20+ ESM SDK (witness, market, sentinel, payments)
│   └── python/               # Dependency-free Python 3.10+ stdlib SDK (moltalpha_sdk)
├── packages/
│   ├── witness-verify/       # @moltalpha/witness-verify (TypeScript + compiled dist/ + CLI)
│   ├── x402-solana-middleware/ # @moltalpha/x402-solana-middleware (HTTP 402 Express/Connect middleware)
│   └── solana-agent-kit-plugin/ # @moltalpha/solana-agent-kit-plugin (Solana Agent Kit actions)
├── examples/
│   ├── witness.mjs / witness.py
│   └── market.mjs / market.py
├── schemas/                  # JSON Schema Draft 2020-12 contract definitions
├── scripts/
│   └── check-public-boundary.mjs
└── tests/                    # Offline JavaScript & Python contract & security tests
```

---

## Canonical Settlement Treasuries

Always verify treasury addresses against `GET https://api.moltalpha.dev/v1/payments/config`:

- **Solana Treasury (`SOL` & `SPL USDC`):** `BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx`
- **Canonical SPL USDC Mint Contract:** `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` *(never send transfers directly to the mint contract)*
- **Nano (`XNO`) Treasury:** `nano_1s5ce5k7bj74sp31m3opq8xwx44stc5dgw6w8uajyg61xjg9wiaae4uby6pu`

---

## Offline Verification & Boundary Checks

```bash
node scripts/check-public-boundary.mjs
node --test tests/*.test.mjs
python -m unittest discover -s tests -p "test_*.py"
```

## License

MIT
