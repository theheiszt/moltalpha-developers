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
    signature: sigHex,
    publicKeySpkiHex: spkiHex,
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
});

test('Market SDK strips simulatedDemoFallback and preserves null priceUsd', () => {
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
});

test('Payments SDK preserves >2^53 nano_raw integers and performs exact BigInt conversions', () => {
  const rawJson = `{"solana_treasury_wallet":"${CANONICAL_SOLANA_TREASURY}","nano_treasury_address":"${CANONICAL_NANO_TREASURY}","usdc_spl_mint_contract":"${CANONICAL_USDC_MINT}","pricing_tiers":{"tier_ent":{"nano_raw":50000000000000000000000000000000}}}`;
  const cfg = parsePaymentConfigJson(rawJson);
  assert.equal(cfg.pricing_tiers.tier_ent.nano_raw, '50000000000000000000000000000000');
  assert.equal(toRawUnits('1.5', 'SOL'), 1_500_000_000n);
  assert.equal(toRawUnits('1.25', 'USDC'), 1_250_000n);
  assert.equal(toRawUnits('50', 'XNO'), 50_000_000_000_000_000_000_000_000_000_000n);
  assert.equal(fromRawUnits(1_500_000_000n, 'SOL'), '1.5');
});

test('Sentinel SDK validates non-empty pool address before network call', async () => {
  const sentinel = new SentinelClient();
  await assert.rejects(() => sentinel.getPoolHistory(''), /poolAddress/i);
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
