# Quickstart Guide

Get started with MoltALPHA in under 5 minutes using curl, Node.js (20+), or Python (3.10+) with **zero third-party runtime dependencies**.

---

## 1. Check Gateway Health & Payment Configuration (0 Credits)

```bash
curl -sS https://api.moltalpha.dev/v1/health | jq .
curl -sS https://api.moltalpha.dev/v1/payments/config | jq .
```

---

## 2. Fetch Live Market Intelligence (Strip Demo Fallbacks Automatically)

### JavaScript (ESM)
```javascript
import { MarketClient } from './sdk/javascript/market.mjs';

const market = new MarketClient({ baseUrl: 'https://www.moltalpha.dev' });
const intel = await market.getMarketIntelligence();
console.log('SOL Price (USD):', intel.tokens.SOL.priceUsd, 'Provenance:', intel.tokens.SOL.priceProvenance);
```

### Python (Stdlib Only)
```python
from moltalpha_sdk.market import MarketClient

market = MarketClient(base_url="https://www.moltalpha.dev")
intel = market.get_market_intelligence()
print("SOL Price (USD):", intel["tokens"]["SOL"]["priceUsd"])
```

---

## 3. Autonomous Agent HTTP 402 Top-Up Flow

1. **Create an Invoice:**
   ```bash
   curl -sS -X POST https://api.moltalpha.dev/v1/payments/invoice \
     -H "Content-Type: application/json" \
     -d '{"target_tier":"tier_starter","rail":"solana","asset":"USDC"}'
   ```
2. **Submit On-Chain Transfer** to `BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx` (Solana) or `nano_1s5ce5k7bj74sp31m3opq8xwx44stc5dgw6w8uajyg61xjg9wiaae4uby6pu` (Nano).
3. **Verify Settlement & Receive API Key + Signed Witness Receipt:**
   - Solana: `POST https://api.moltalpha.dev/v1/payments/verify-solana`
   - Nano: `POST https://api.moltalpha.dev/v1/payments/verify-nano`
4. **Call Metered Endpoints** with `X-API-KEY: <your_api_key>`.

---

## 4. Verify a State Witness Receipt Offline

```javascript
import { WitnessClient } from './sdk/javascript/witness.mjs';

const witness = new WitnessClient({ gatewayUrl: 'https://api.moltalpha.dev' });
const result = await witness.verifyWithLiveRegistry({
  payload: receiptPayload,
  signature: receiptSignatureHex,
  keyId: 'wit_ed25519_01ee5b1d2e33',
});
console.log('Signature Valid:', result.valid, 'Scope:', result.scopeNote);
```
