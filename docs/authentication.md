# Authentication & Metered Credit Lifecycle

MoltALPHA uses prepaid API keys (`X-API-KEY`) backed by an on-chain verified credit ledger and HTTP `402 Payment Required` discovery for autonomous agents.

---

## 1. Supplying Your API Key

Pass your API key on any authenticated request to `https://api.moltalpha.dev` via the `X-API-KEY` header (or `Authorization: Bearer <api_key>`):

```bash
curl -sS https://api.moltalpha.dev/v1/account/quota \
  -H "X-API-KEY: molt_sol_..."
```

### Security Rules
- Never commit API keys to source control or client-side browser bundles.
- Store keys in environment variables (e.g., `MOLTALPHA_API_KEY`).

---

## 2. Public (0-Credit) vs. Authenticated Endpoints

| Category | Endpoints | Authentication |
| :--- | :--- | :--- |
| **Discovery & Health** | `GET /v1/health`, `GET /v1/quickstart`, `GET /.well-known/agent.json`, `GET /v1/errors` | None (0 credits) |
| **Cryptographic Keys** | `GET /v1/witnesses/public-keys`, `GET /v1/sentinel/public-key` | None (0 credits) |
| **Payment Lifecycle** | `GET /v1/payments/config`, `POST /v1/payments/invoice`, `POST /v1/payments/verify-solana`, `POST /v1/payments/verify-nano` | None (0 credits) |
| **Account Quota** | `GET /v1/account/quota` | Required (`X-API-KEY`, 0 credits) |
| **Sentinel & Intel** | `GET /v1/sentinel/feed`, `GET /v1/sentinel/pools/{pool_address}/risk`, `GET /v1/intel/latest` | Required (`X-API-KEY`, metered credits) |

---

## 3. HTTP 401 vs. 402 vs. 403 Semantics

- **`401 Unauthorized` (`AUTHENTICATION_REQUIRED` / `INVALID_API_KEY`):** Returned when an endpoint requires an API key (`GET /v1/account/quota`, `GET /v1/sentinel/*`) and the header is missing or malformed. No credits are deducted (`state_effect: "none"`).
- **`402 Payment Required` (`PAYMENT_REQUIRED` / `INSUFFICIENT_CREDITS`):** Returned when a paid intelligence route (`GET /v1/intel/latest`) is called without an API key or when an API key's credit balance is `0`. Includes `purchase_instructions` pointing to `GET /v1/payments/config` and `POST /v1/payments/invoice`. No charges are triggered by a `402` response.
- **`403 Forbidden` (`INSUFFICIENT_TIER` / `INVALID_API_KEY`):** Returned when a valid key lacks the required entitlement tier (e.g., calling a `SENTINEL_PRO` endpoint with a basic key) or when the frontend `/docs/errors` catalog maps revoked keys.
