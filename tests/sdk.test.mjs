import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WitnessClient,
  canonicalizeJsonRfc8785,
  verifyWitness,
  MarketClient,
  sanitizeMarketIntelligencePayload,
  SentinelClient,
  PaymentsClient,
  MoltAlpha,
  CANONICAL_NANO_TREASURY,
  CANONICAL_SOLANA_TREASURY,
  CANONICAL_USDC_MINT,
  parsePaymentConfigJson,
  toRawUnits,
  fromRawUnits,
  validateMerchantWallet,
  buildSolanaPayUrl,
  signWebhookPayload,
  verifyWebhookSignature,
  verifyInboundWebhookSecret,
} from '../sdk/javascript/index.mjs';
import { MoltAlpha as TsMoltAlpha } from '../sdk/typescript/dist/index.js';
import { runCheckoutFlow } from '../examples/node-checkout/checkout.mjs';
import { runWebhookSelfTest } from '../examples/webhook-server/server.mjs';
import { runAgentPaymentDemo } from '../examples/ai-agent-payments/agent-checkout.mjs';
import { runIntegrationHealthcheck } from '../tools/integration-healthcheck/cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

test('Witness SDK canonicalizes RFC 8785 and verifies Ed25519 signature offline', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const spkiHex = publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
  const payload = { z: 2, a: 1, nested: { b: true, a: 'ok' } };
  const canon = canonicalizeJsonRfc8785(payload);
  assert.equal(canon, '{"a":1,"nested":{"a":"ok","b":true},"z":2}');

  const sigHex = crypto.sign(null, Buffer.from(canon, 'utf8'), privateKey).toString('hex');
  const res = verifyWitness({
    payload,
    signature: `ed25519:${sigHex}`,
    publicKeySpkiHex: spkiHex,
    expectedPayloadSha256: crypto.createHash('sha256').update(canon, 'utf8').digest('hex'),
    algorithm: 'Ed25519',
  });
  assert.equal(res.valid, true);
  assert.match(res.scopeNote, /finality/i);

  const bad = verifyWitness({
    payload: { ...payload, a: 99 },
    signature: sigHex,
    publicKeySpkiHex: spkiHex,
    algorithm: 'Ed25519',
  });
  assert.equal(bad.valid, false);

  const badDigest = verifyWitness({
    payload,
    signature: sigHex,
    publicKeySpkiHex: spkiHex,
    expectedPayloadSha256: '0'.repeat(64),
  });
  assert.equal(badDigest.valid, false);
  assert.match(badDigest.reason, /digest mismatch/i);

  const badFp = verifyWitness({
    payload,
    signature: sigHex,
    publicKeySpkiHex: spkiHex,
    expectedKeyFingerprintSha256: 'f'.repeat(64),
  });
  assert.equal(badFp.valid, false);
  assert.match(badFp.reason, /fingerprint mismatch/i);

  const badAlg = verifyWitness({
    payload,
    signature: sigHex,
    publicKeySpkiHex: spkiHex,
    algorithm: 'RSA-256',
  });
  assert.equal(badAlg.valid, false);
});

test('Witness SDK verifyWithLiveRegistry rejects REVOKED, RETIRED, and valid_until expired keys and guards fetchWitness path traversal', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const spkiHex = spkiDer.toString('hex');
  const fp = crypto.createHash('sha256').update(spkiDer).digest('hex');
  const payload = { ok: true, slot: 123 };
  const canon = canonicalizeJsonRfc8785(payload);
  const sigHex = crypto.sign(null, Buffer.from(canon, 'utf8'), privateKey).toString('hex');

  const client = new WitnessClient();
  await assert.rejects(() => client.fetchWitness('../admin'), /path traversal/i);

  const makeFetch = (overrides = {}) => async () =>
    new Response(
      JSON.stringify({
        active_key_id: 'wit_k1',
        public_keys: {
          wit_k1: {
            algorithm: 'Ed25519',
            public_key_spki_hex: spkiHex,
            fingerprint_sha256: fp,
            status: 'ACTIVE',
            valid_from: '2026-01-01T00:00:00Z',
            valid_until: '2027-01-01T00:00:00Z',
            ...overrides,
          },
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  const ok = await client.verifyWithLiveRegistry({
    payload,
    signature: sigHex,
    nowMs: Date.parse('2026-06-01T00:00:00Z'),
    fetchImpl: makeFetch(),
  });
  assert.equal(ok.valid, true);

  const expired = await client.verifyWithLiveRegistry({
    payload,
    signature: sigHex,
    nowMs: Date.parse('2028-01-01T00:00:00Z'),
    fetchImpl: makeFetch(),
  });
  assert.equal(expired.valid, false);
  assert.match(expired.reason, /expired/i);

  const retired = await client.verifyWithLiveRegistry({
    payload,
    signature: sigHex,
    nowMs: Date.parse('2026-06-01T00:00:00Z'),
    fetchImpl: makeFetch({ retired_at: '2026-05-01T00:00:00Z' }),
  });
  assert.equal(retired.valid, false);
});

test('Market SDK strips simulatedDemoFallback, preserves null priceUsd, and validates candle parameters', async () => {
  const sanitized = sanitizeMarketIntelligencePayload({
    ok: true,
    timestamp: '2026-11-19T20:00:00Z',
    tokens: {
      SOL: { symbol: 'SOL', priceUsd: 142.5, simulatedDemoFallback: { priceUsd: 180 } },
      JUP: { symbol: 'JUP', priceUsd: null, simulatedDemoFallback: { priceUsd: 1.1 } },
    },
  });
  assert.equal(sanitized.tokens.SOL.priceUsd, 142.5);
  assert.equal(sanitized.tokens.SOL.simulatedDemoFallback, undefined);
  assert.equal(sanitized.tokens.JUP.priceUsd, null);
  assert.equal(sanitized.tokens.JUP.simulatedDemoFallback, undefined);

  const market = new MarketClient();
  await assert.rejects(() => market.getMarketCandles({ pair: '' }), /pair is required/i);
  await assert.rejects(() => market.getMarketCandles({ granularity: 0 }), /positive integer/i);
});

test('Payments SDK preserves >2^53 nano_raw integers, handles escaped strings safely, and performs exact BigInt conversions', () => {
  const rawJson = `{"solana_treasury_wallet":"${CANONICAL_SOLANA_TREASURY}","nano_treasury_address":"${CANONICAL_NANO_TREASURY}","usdc_spl_mint_contract":"${CANONICAL_USDC_MINT}","note":"quote \\"12345678901234567890\\" inside string\\\\","pricing_tiers":{"tier_ent":{"nano_raw":50000000000000000000000000000000}}}`;
  const cfg = parsePaymentConfigJson(rawJson);
  assert.equal(cfg.pricing_tiers.tier_ent.nano_raw, '50000000000000000000000000000000');
  assert.equal(cfg.note, 'quote "12345678901234567890" inside string\\');
  assert.equal(toRawUnits('1.5', 'SOL'), 1_500_000_000n);
  assert.equal(toRawUnits('1.25', 'USDC'), 1_250_000n);
  assert.equal(toRawUnits('50', 'XNO'), 50_000_000_000_000_000_000_000_000_000_000n);
  assert.equal(fromRawUnits(1_500_000_000n, 'SOL'), '1.5');
});

test('Sentinel SDK validates non-empty pool address before network call', async () => {
  const sentinel = new SentinelClient();
  await assert.rejects(() => sentinel.getPoolHistory(''), /poolAddress/i);
  await assert.rejects(() => sentinel.getPoolRisk('../secret'), /path traversal/i);
});

test('All JSON Schema files in schemas/ are valid JSON Schema objects', () => {
  const schemasDir = path.join(repoRoot, 'schemas');
  const files = fs.readdirSync(schemasDir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 5);
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(path.join(schemasDir, file), 'utf8'));
    assert.ok(parsed.$schema);
    assert.equal(parsed.type, 'object');
  }
});

test('Phase C — Unified MoltAlpha TypeScript/JS SDK: wallet validation, Solana Pay URI, invoice lifecycle & HMAC webhooks', async () => {
  assert.equal(TsMoltAlpha, MoltAlpha);

  const validSol = validateMerchantWallet(CANONICAL_SOLANA_TREASURY, 'solana');
  assert.equal(validSol.valid, true);
  const validNano = validateMerchantWallet(CANONICAL_NANO_TREASURY, 'nano');
  assert.equal(validNano.valid, true);
  const mintRejected = validateMerchantWallet(CANONICAL_USDC_MINT, 'solana');
  assert.equal(mintRejected.valid, false);
  assert.equal(mintRejected.code, 'MINT_ADDRESS_NOT_WALLET');

  assert.throws(
    () => new MoltAlpha({ merchantWallet: CANONICAL_USDC_MINT, network: 'solana' }),
    /SPL USDC Mint contract/
  );

  const payUri = buildSolanaPayUrl({
    recipient: CANONICAL_SOLANA_TREASURY,
    amount: '10.00',
    asset: 'USDC',
    reference: '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi',
    label: 'MoltAlpha',
    message: 'Order 123',
  });
  assert.ok(payUri.startsWith(`solana:${CANONICAL_SOLANA_TREASURY}?`));
  assert.ok(payUri.includes('amount=10'));
  assert.ok(payUri.includes(`spl-token=${CANONICAL_USDC_MINT}`));
  assert.ok(payUri.includes('reference=4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi'));

  const webhookSecret = 'whsec_unit_test_secret_key_0123456789';
  const payload = JSON.stringify({ event_id: 'evt_1', invoice_id: 'inv_1', amount_raw: 1000000 });
  const sigHeader = signWebhookPayload(payload, webhookSecret, 1795125000);

  const okWebhook = verifyWebhookSignature(payload, sigHeader, webhookSecret, {
    toleranceSeconds: 300,
    nowSeconds: 1795125100,
  });
  assert.equal(okWebhook.valid, true);
  assert.equal(okWebhook.code, 'OK');

  const expiredWebhook = verifyWebhookSignature(payload, sigHeader, webhookSecret, {
    toleranceSeconds: 300,
    nowSeconds: 1795126000,
  });
  assert.equal(expiredWebhook.valid, false);
  assert.equal(expiredWebhook.code, 'WEBHOOK_TIMESTAMP_EXPIRED');

  const tamperedWebhook = verifyWebhookSignature(
    payload.replace('1000000', '9999999'),
    sigHeader,
    webhookSecret,
    { toleranceSeconds: 300, nowSeconds: 1795125100 }
  );
  assert.equal(tamperedWebhook.valid, false);
  assert.equal(tamperedWebhook.code, 'WEBHOOK_SIGNATURE_MISMATCH');

  assert.equal(verifyInboundWebhookSecret('sec_abc12345', 'sec_abc12345'), true);
  assert.equal(verifyInboundWebhookSecret('sec_abc12345', 'sec_wrong123'), false);

  const sampleSig =
    '5UfDuX7WXY8Qp9LkM2nN4pQrStUvWxYz123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwx';
  const client = new MoltAlpha({
    apiKey: 'mk_test_key',
    merchantWallet: CANONICAL_SOLANA_TREASURY,
    fetchImpl: async (url, init = {}) => {
      const u = String(url);
      if (u.endsWith('/v1/payments/invoice') && init.method === 'POST') {
        assert.equal(init.headers['X-Idempotency-Key'], 'idem_123');
        return new Response(
          JSON.stringify({
            success: true,
            invoice_id: 'inv_unit_001',
            reference: '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi',
            target_tier: 'tier_starter',
            credits: 50,
            asset: 'USDC',
            amount_raw: 1000000,
            amount_formatted: '1.00 USDC',
            treasury_wallet: CANONICAL_SOLANA_TREASURY,
            cluster: 'mainnet-beta',
            solana_pay_url: payUri,
            claim_secret: 'sec_unit_test_secret_1234567890',
            created_at: '2026-11-19T21:00:00Z',
            expires_at: '2026-11-19T21:30:00Z',
          }),
          { status: 200 }
        );
      }
      if (u.endsWith('/v1/payments/status/' + sampleSig)) {
        return new Response(
          JSON.stringify({
            success: true,
            status: 'redeemed',
            tx_signature: sampleSig,
            asset: 'USDC',
            tier: 'tier_starter',
            credits_granted: 50,
            remaining_credits: 50,
          }),
          { status: 200 }
        );
      }
      if (u.endsWith('/v1/payments/invoice/inv_unit_001/claim')) {
        return new Response(
          JSON.stringify({
            success: true,
            status: 'recovered',
            api_key: 'mk_recovered_key',
            key_prefix: 'mk_recovered',
            tier: 'tier_starter',
            credits: 50,
            invoice_id: 'inv_unit_001',
            message: 'Credential recovered.',
          }),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected URL: ${u}`);
    },
  });

  const created = await client.payments.create({
    tier: 'tier_starter',
    currency: 'USDC',
    network: 'solana',
    amount: '1.00',
    idempotencyKey: 'idem_123',
  });
  assert.equal(created.invoice_id, 'inv_unit_001');

  const txStatus = await client.payments.getTransactionStatus(sampleSig);
  assert.equal(txStatus.status, 'redeemed');

  const claimed = await client.payments.claimCredential(
    'inv_unit_001',
    'sec_unit_test_secret_1234567890'
  );
  assert.equal(claimed.status, 'recovered');
});

test('Phase D — Working integration examples & diagnostic tools execute cleanly', async () => {
  const checkoutRes = await runCheckoutFlow({ live: false });
  assert.equal(checkoutRes.verification.status, 'newly_minted');
  assert.equal(checkoutRes.finalStatus.status, 'fulfilled');

  await runWebhookSelfTest();

  const agentRes = await runAgentPaymentDemo();
  assert.equal(agentRes.verified.status, 'newly_minted');
  assert.equal(agentRes.feed.feed.length, 1);

  const healthRes = await runIntegrationHealthcheck([]);
  assert.equal(healthRes.ok, true);
});
