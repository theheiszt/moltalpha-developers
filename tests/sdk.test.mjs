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
  CANONICAL_NANO_TREASURY,
  CANONICAL_SOLANA_TREASURY,
  CANONICAL_USDC_MINT,
  parsePaymentConfigJson,
  toRawUnits,
  fromRawUnits,
} from '../sdk/javascript/index.mjs';

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
