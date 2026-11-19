# Webhooks & Settlement Notifications

This guide covers both the live inbound settlement webhook endpoint on `https://api.moltalpha.dev` and the merchant webhook receiver verification tools included in `@moltalpha/sdk`, `moltalpha_sdk`, and `examples/webhook-server`.

## Availability Status

| Capability | Status | Location |
| :--- | :--- | :--- |
| **Inbound Settlement Webhook (`POST /v1/payments/webhook`)** | **Live in Production** | `https://api.moltalpha.dev/v1/payments/webhook` (authenticated via `X-Webhook-Secret`) |
| **SDK HMAC-SHA256 Webhook Signer & Verifier** | **Live in SDKs** | `verifyWebhookSignature` / `signWebhookPayload` (`@moltalpha/sdk` & `moltalpha_sdk`) |
| **Reference Replay-Resistant Webhook Receiver** | **Ready in Repository** | `examples/webhook-server/server.mjs` & `tools/webhook-tester/cli.mjs` |
| **Self-Service Outbound Merchant Webhook Registry** | **Planned** | Outbound push subscription management UI/API is planned for a future release |

---

## 1. Verifying Signed Webhooks (`X-MoltAlpha-Signature`)

Webhook payloads are signed using **HMAC-SHA256** over `<unix_timestamp>.<raw_json_body>` and transmitted in the `X-MoltAlpha-Signature` header:

```text
X-MoltAlpha-Signature: t=1795125000,v1=5c9a8d...
```

### TypeScript / Node.js Verification

```typescript
import { verifyWebhookSignature } from '@moltalpha/sdk';

const verification = verifyWebhookSignature(
  rawRequestBodyString,
  req.headers['x-moltalpha-signature'],
  process.env.MOLTALPHA_WEBHOOK_SECRET,
  { toleranceSeconds: 300 }
);

if (!verification.valid) {
  // Reject with HTTP 401: verification.code is WEBHOOK_SIGNATURE_MISMATCH,
  // WEBHOOK_TIMESTAMP_EXPIRED, or WEBHOOK_SIGNATURE_MALFORMED
  throw new Error(verification.reason);
}
```

### Python Verification

```python
import os
from moltalpha_sdk import verify_webhook_signature

result = verify_webhook_signature(
    raw_request_body_bytes,
    request_headers.get("X-MoltAlpha-Signature", ""),
    os.environ["MOLTALPHA_WEBHOOK_SECRET"],
    tolerance_seconds=300,
)

if not result["valid"]:
    raise RuntimeError(f"Webhook rejected ({result['code']}): {result['reason']}")
```

---

## 2. Replay Protection & Idempotent Processing

Even when a webhook signature is cryptographically valid, networks and webhook dispatchers may deliver the same event more than once. Your webhook receiver must enforce three layers of protection:

1. **Constant-Time Digest Comparison**: Always use `verifyWebhookSignature` (which uses `crypto.timingSafeEqual` in Node.js and `hmac.compare_digest` in Python) rather than `===` string comparison.
2. **Timestamp Replay Window (`toleranceSeconds = 300`)**: Reject any webhook whose timestamp `t` differs from current server time by more than 300 seconds (`WEBHOOK_TIMESTAMP_EXPIRED`).
3. **Durable Event & Transaction Idempotency**: Record `event_id` and `transaction_signature` in a database table with a `UNIQUE` constraint before fulfilling the order. If the key already exists, return `HTTP 200 {"duplicate": true}` without re-running fulfillment logic.

Run the complete reference receiver and self-test locally:

```bash
node examples/webhook-server/server.mjs --self-test
node tools/webhook-tester/cli.mjs --self-test
```
