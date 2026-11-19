/**
 * Example 4 — Authenticated & Replay-Resistant Webhook Receiver
 * Demonstrates HMAC-SHA256 signature verification, 300s timestamp replay rejection,
 * and idempotent order fulfillment.
 */

import http from 'node:http';
import {
  signWebhookPayload,
  verifyInboundWebhookSecret,
  verifyWebhookSignature,
} from '../../sdk/javascript/index.mjs';

export function createWebhookServer(options = {}) {
  const secret =
    options.secret ||
    process.env.MOLTALPHA_WEBHOOK_SECRET ||
    'whsec_example_local_development_secret_key';
  const toleranceSeconds = Number(
    options.toleranceSeconds ?? process.env.MOLTALPHA_WEBHOOK_TOLERANCE_SECONDS ?? 300
  );

  // Idempotency ledger (replace with atomic SQL/Firestore uniqueness constraint in production)
  const processedEvents = new Map();

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/webhooks/moltalpha') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, code: 'NOT_FOUND' }));
      return;
    }

    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const sigHeader = req.headers['x-moltalpha-signature'];
      const legacySecretHeader = req.headers['x-webhook-secret'];

      if (typeof sigHeader === 'string' && sigHeader.trim().length > 0) {
        const check = verifyWebhookSignature(rawBody, sigHeader, secret, {
          toleranceSeconds,
          ...(options.nowSeconds ? { nowSeconds: options.nowSeconds } : {}),
        });
        if (!check.valid) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, code: check.code, reason: check.reason }));
          return;
        }
      } else if (typeof legacySecretHeader === 'string') {
        if (!verifyInboundWebhookSecret(legacySecretHeader, secret)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              ok: false,
              code: 'WEBHOOK_SECRET_INVALID',
              reason: 'Invalid X-Webhook-Secret header.',
            })
          );
          return;
        }
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: false,
            code: 'WEBHOOK_SIGNATURE_MISSING',
            reason: 'Missing X-MoltAlpha-Signature header.',
          })
        );
        return;
      }

      let event;
      try {
        event = JSON.parse(rawBody);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, code: 'INVALID_JSON' }));
        return;
      }

      const idempotencyKey =
        event.event_id ||
        (event.invoice_id && event.transaction_signature
          ? `${event.invoice_id}:${event.transaction_signature}`
          : event.transaction_signature);

      if (!idempotencyKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: false,
            code: 'MISSING_EVENT_IDENTIFIER',
            reason: 'Webhook event must include event_id or transaction_signature.',
          })
        );
        return;
      }

      if (processedEvents.has(idempotencyKey)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            status: 'already_processed',
            duplicate: true,
            idempotency_key: idempotencyKey,
          })
        );
        return;
      }

      processedEvents.set(idempotencyKey, {
        processedAt: new Date().toISOString(),
        invoiceId: event.invoice_id || null,
        txSignature: event.transaction_signature || null,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          status: 'fulfilled',
          duplicate: false,
          idempotency_key: idempotencyKey,
        })
      );
    });
  });

  return { server, processedEvents };
}

export async function runWebhookSelfTest() {
  const testSecret = 'whsec_selftest_secret_key_0123456789abcdef';
  const fixedNow = 1795125000;
  const { server } = createWebhookServer({
    secret: testSecret,
    toleranceSeconds: 300,
    nowSeconds: fixedNow,
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}/webhooks/moltalpha`;

  try {
    const payloadStr = JSON.stringify({
      event_id: 'evt_payment_verified_001',
      type: 'payment.verified',
      invoice_id: 'inv_demo_solana_001',
      transaction_signature:
        '5UfDuX7WXY8Qp9LkM2nN4pQrStUvWxYz123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwx',
      asset: 'USDC',
      amount_raw: 1000000,
    });
    const validSig = signWebhookPayload(payloadStr, testSecret, fixedNow);

    // 1. Valid delivery
    const r1 = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-MoltAlpha-Signature': validSig },
      body: payloadStr,
    });
    const j1 = await r1.json();
    if (r1.status !== 200 || j1.duplicate !== false) {
      throw new Error(`Expected 200 non-duplicate, got ${r1.status} ${JSON.stringify(j1)}`);
    }
    console.log(`[1/4] Valid signed webhook accepted: HTTP ${r1.status} | status=${j1.status} | duplicate=${j1.duplicate}`);

    // 2. Duplicate delivery
    const r2 = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-MoltAlpha-Signature': validSig },
      body: payloadStr,
    });
    const j2 = await r2.json();
    if (r2.status !== 200 || j2.duplicate !== true) {
      throw new Error(`Expected 200 duplicate=true, got ${r2.status} ${JSON.stringify(j2)}`);
    }
    console.log(`[2/4] Duplicate delivery idempotently ignored: HTTP ${r2.status} | status=${j2.status} | duplicate=${j2.duplicate}`);

    // 3. Tampered payload
    const tamperedStr = payloadStr.replace('"amount_raw":1000000', '"amount_raw":999999999');
    const r3 = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-MoltAlpha-Signature': validSig },
      body: tamperedStr,
    });
    const j3 = await r3.json();
    if (r3.status !== 401 || j3.code !== 'WEBHOOK_SIGNATURE_MISMATCH') {
      throw new Error(`Expected 401 WEBHOOK_SIGNATURE_MISMATCH, got ${r3.status} ${JSON.stringify(j3)}`);
    }
    console.log(`[3/4] Tampered payload rejected: HTTP ${r3.status} | code=${j3.code}`);

    // 4. Expired timestamp replay
    const expiredSig = signWebhookPayload(payloadStr, testSecret, fixedNow - 600);
    const r4 = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-MoltAlpha-Signature': expiredSig },
      body: payloadStr,
    });
    const j4 = await r4.json();
    if (r4.status !== 401 || j4.code !== 'WEBHOOK_TIMESTAMP_EXPIRED') {
      throw new Error(`Expected 401 WEBHOOK_TIMESTAMP_EXPIRED, got ${r4.status} ${JSON.stringify(j4)}`);
    }
    console.log(`[4/4] Expired replay timestamp rejected: HTTP ${r4.status} | code=${j4.code}`);
    console.log('WEBHOOK_SERVER_SELF_TEST_OK');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());

if (isMain) {
  if (process.argv.includes('--self-test')) {
    runWebhookSelfTest().catch((err) => {
      console.error('Webhook self-test failed:', err.message);
      process.exitCode = 1;
    });
  } else {
    const port = Number(process.env.PORT || 4040);
    const { server } = createWebhookServer();
    server.listen(port, '127.0.0.1', () => {
      console.log(`MoltAlpha webhook receiver listening on http://127.0.0.1:${port}/webhooks/moltalpha`);
    });
  }
}
