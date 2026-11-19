/**
 * MoltAlpha Webhook Tester CLI
 * Generates and verifies HMAC-SHA256 webhook signatures and tests replay window rejection.
 */

import { signWebhookPayload, verifyWebhookSignature } from '../../sdk/javascript/index.mjs';

export async function runWebhookTesterCli(args = process.argv.slice(2)) {
  const secret =
    args.find((a) => a.startsWith('--secret='))?.split('=')[1] ||
    process.env.MOLTALPHA_WEBHOOK_SECRET ||
    'whsec_diagnostic_test_secret_0123456789';
  const nowSeconds = 1795126000;

  const samplePayload = JSON.stringify({
    event_id: 'evt_diag_webhook_001',
    type: 'payment.verified',
    invoice_id: 'inv_diag_solana_001',
    transaction_signature:
      '5UfDuX7WXY8Qp9LkM2nN4pQrStUvWxYz123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwx',
    asset: 'USDC',
    amount_raw: 1000000,
  });

  const signatureHeader = signWebhookPayload(samplePayload, secret, nowSeconds);

  if (args.includes('--self-test') || !args.some((a) => a.startsWith('--url='))) {
    const validRes = verifyWebhookSignature(samplePayload, signatureHeader, secret, {
      toleranceSeconds: 300,
      nowSeconds,
    });
    if (!validRes.valid) {
      throw new Error(`Valid webhook signature rejected: ${validRes.reason}`);
    }

    const tamperedRes = verifyWebhookSignature(
      samplePayload.replace('1000000', '9999999'),
      signatureHeader,
      secret,
      { toleranceSeconds: 300, nowSeconds }
    );
    if (tamperedRes.valid || tamperedRes.code !== 'WEBHOOK_SIGNATURE_MISMATCH') {
      throw new Error('Tampered webhook payload was not rejected');
    }

    const expiredRes = verifyWebhookSignature(samplePayload, signatureHeader, secret, {
      toleranceSeconds: 300,
      nowSeconds: nowSeconds + 600,
    });
    if (expiredRes.valid || expiredRes.code !== 'WEBHOOK_TIMESTAMP_EXPIRED') {
      throw new Error('Expired webhook timestamp was not rejected');
    }

    console.log('[PASS] HMAC-SHA256 signature verification (constant-time)');
    console.log('[PASS] Tampered payload detection (WEBHOOK_SIGNATURE_MISMATCH)');
    console.log('[PASS] Timestamp replay window enforcement (WEBHOOK_TIMESTAMP_EXPIRED)');
    console.log('WEBHOOK_TESTER_OK');
    return { ok: true, signatureHeader };
  }

  const targetUrl = args.find((a) => a.startsWith('--url='))?.split('=')[1];
  const liveSig = signWebhookPayload(samplePayload, secret, Math.floor(Date.now() / 1000));
  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-MoltAlpha-Signature': liveSig,
    },
    body: samplePayload,
  });
  const bodyText = await res.text();
  console.log(`Dispatched to ${targetUrl} -> HTTP ${res.status}: ${bodyText}`);
  return { status: res.status, bodyText };
}

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  runWebhookTesterCli().catch((err) => {
    console.error('Webhook tester error:', err.message);
    process.exitCode = 1;
  });
}
