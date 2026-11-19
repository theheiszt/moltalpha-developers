# Sentinel DeFi Risk & Telemetry API

Sentinel monitors Solana DeFi liquidity pools and autonomous agent behavior on `https://api.moltalpha.dev`.

---

## 1. Verified Sentinel Routes & Entitlement Tiers

| Endpoint | Method | Required Tier | Credits | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `/v1/sentinel/public-key` | `GET` | Public | 0 | Active Ed25519 signing key (`RFC8032`, `RFC8785`, `revocation_status: "ACTIVE"`). |
| `/v1/sentinel/feed` | `GET` | `SENTINEL_MEMBER` | Metered | Multi-pool risk score feed. Returns `401 AUTHENTICATION_REQUIRED` if `X-API-KEY` is missing. |
| `/v1/sentinel/anomalies/live` | `GET` | `SENTINEL_PRO` | Metered | Real-time pool anomaly stream. |
| `/v1/sentinel/pools/{pool_address}/risk` | `GET` | `SENTINEL_MEMBER` | Metered | Composite risk assessment for `{pool_address}`. |
| `/v1/sentinel/pools/{pool_address}/observations` | `GET` | `SENTINEL_PRO` | Metered | Raw pool depth & slippage telemetry for `{pool_address}`. |
| `/v1/sentinel/pools/{pool_address}/history` | `GET` | `SENTINEL_PRO` | Metered | Historical risk time series for `{pool_address}`. |
| `/v1/sentinel/agent/{agent_handle}` | `GET` | `SENTINEL_MEMBER` | Metered | Agent risk profile for `{agent_handle}`. |

### Important Route Distinction: `/v1/sentinel/pools/{pool_address}/history` vs. `/v1/sentinel/history`
Historical risk data is always scoped to a specific pool address at `GET /v1/sentinel/pools/{pool_address}/history` (which requires `SENTINEL_PRO` authentication and returns `401 AUTHENTICATION_REQUIRED` when unauthenticated). Calling `GET /v1/sentinel/history` without a `{pool_address}` segment is not a valid endpoint and returns HTTP `404 Not Found`. The Sentinel SDK validates that `poolAddress` is a non-empty string before issuing any network request.

---

## 2. JavaScript & Python Usage

### JavaScript
```javascript
import { SentinelClient } from '../sdk/javascript/sentinel.mjs';

const sentinel = new SentinelClient({
  gatewayUrl: 'https://api.moltalpha.dev',
  apiKey: process.env.MOLTALPHA_API_KEY,
});
const pubKey = await sentinel.getPublicKey();
const risk = await sentinel.getPoolRisk('58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2');
const history = await sentinel.getPoolHistory('58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2');
```

### Python
```python
from moltalpha_sdk.sentinel import SentinelClient

sentinel = SentinelClient(base_url="https://api.moltalpha.dev", api_key="molt_sol_...")
pub_key = sentinel.get_public_key()
risk = sentinel.get_pool_risk("58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2")
```
