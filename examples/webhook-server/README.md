# Example 4 — Authenticated & Replay-Resistant Webhook Receiver

A zero-dependency Node.js HTTP server (`examples/webhook-server/server.mjs`) demonstrating how to securely receive, authenticate, and process payment settlement webhooks using `@moltalpha/sdk`:

1. **HMAC-SHA256 Signature Verification (`X-MoltAlpha-Signature: t=<ts>,v1=<hex>`)**: Verified in constant time using `verifyWebhookSignature` (`crypto.timingSafeEqual`).
2. **Timestamp Replay Window (`toleranceSeconds = 300`)**: Rejects captured webhook payloads replayed outside the 5-minute window (`HTTP 401 WEBHOOK_TIMESTAMP_EXPIRED`).
3. **Idempotent Event Deduplication**: Tracks processed `event_id` and `transaction_signature` keys so duplicate webhook deliveries return `HTTP 200 {"duplicate": true}` without double-crediting an order.
4. **Inbound `X-Webhook-Secret` Compatibility**: Also supports constant-time verification via `verifyInboundWebhookSecret`.

## Running the Webhook Receiver

### 1. Automated Self-Test Mode (Verifies Valid, Tampered, Expired & Duplicate Webhooks)

```bash
node examples/webhook-server/server.mjs --self-test
```

### 2. Persistent Local Listener

```bash
MOLTALPHA_WEBHOOK_SECRET="whsec_replace_with_32_byte_secret" PORT=4040 node examples/webhook-server/server.mjs
```

## Security Notes

- Always verify the signature against the **exact raw request body string/bytes** before parsing JSON.
- Enforce idempotency on both `event_id` and `transaction_signature` in a durable database table (`UNIQUE(transaction_signature)`) before fulfilling orders.

## Expected Output (`--self-test`)

```text
[1/4] Valid signed webhook accepted: HTTP 200 | status=fulfilled | duplicate=false
[2/4] Duplicate delivery idempotently ignored: HTTP 200 | status=already_processed | duplicate=true
[3/4] Tampered payload rejected: HTTP 401 | code=WEBHOOK_SIGNATURE_MISMATCH
[4/4] Expired replay timestamp rejected: HTTP 401 | code=WEBHOOK_TIMESTAMP_EXPIRED
WEBHOOK_SERVER_SELF_TEST_OK
```
