# Tool 2 — Webhook Tester CLI (`tools/webhook-tester/cli.mjs`)

Diagnostic CLI for generating and verifying HMAC-SHA256 webhook signatures (`X-MoltAlpha-Signature: t=<unix_seconds>,v1=<hex_digest>`), testing replay window enforcement, and dispatching signed test webhook events to a local server.

## Usage

```bash
# Run deterministic offline self-test (valid, tampered, and expired signatures)
node tools/webhook-tester/cli.mjs --self-test

# Dispatch a signed test webhook to a local receiver
node tools/webhook-tester/cli.mjs --url=http://127.0.0.1:4040/webhooks/moltalpha --secret=whsec_replace_with_32_byte_secret
```
