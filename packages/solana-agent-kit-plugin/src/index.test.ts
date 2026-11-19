import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createMoltAlphaAgentKitPlugin } from './index';
import { canonicalizeJsonRfc8785, sha256Hex } from '@moltalpha/witness-verify';

describe('@moltalpha/solana-agent-kit-plugin', () => {
  it('exposes 4 agent-kit actions and verifies witness receipts & first-passage risk feeds', async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    const spkiHex = spkiDer.toString('hex');

    const receiptPayload = { pair: 'SOL/USDC', gate: 'ALLOW', score: 1.8 };
    const canonical = canonicalizeJsonRfc8785(receiptPayload);
    const sigHex = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('hex');

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/witnesses/public-keys')) {
        return new Response(
          JSON.stringify({
            active_key_id: 'wit_key_agent_01',
            public_keys: {
              wit_key_agent_01: {
                algorithm: 'Ed25519',
                public_key_base58: 'TestPub58',
                public_key_spki_hex: spkiHex,
                fingerprint_sha256: sha256Hex(spkiDer),
                status: 'ACTIVE',
                valid_from: '2026-01-01T00:00:00Z',
                valid_until: '2027-01-01T00:00:00Z',
                retired_at: null,
              },
            },
          }),
          { status: 200 }
        );
      }
      if (url.includes('/v1/quant/first-passage')) {
        return new Response(
          JSON.stringify({ pair: 'BONK/SOL', target_net_pct: 0.015, viability: 'HIGH' }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ count: 4, products: [] }), { status: 200 });
    };

    const plugin = createMoltAlphaAgentKitPlugin({ fetchImpl: mockFetch });
    assert.equal(plugin.actions.length, 4);

    const fp = await plugin.methods.getFirstPassageProbability({
      pair: 'BONK/SOL',
      targetNetPct: 0.015,
    });
    assert.equal(fp.pair, 'BONK/SOL');

    const verifyAction = plugin.actions.find((a) => a.name === 'MOLTALPHA_VERIFY_WITNESS')!;
    const verification = (await verifyAction.handler({
      payload: receiptPayload,
      signature: sigHex,
      keyId: 'wit_key_agent_01',
    })) as { valid: boolean; code: string };
    assert.equal(verification.valid, true);
    assert.equal(verification.code, 'VERIFIED');
  });

  it('rejects invalid config and guards null or non-finite inputs safely', async () => {
    assert.throws(() => createMoltAlphaAgentKitPlugin({ timeoutMs: 0 }), /INVALID_TIMEOUT_MS/);
    assert.throws(() => createMoltAlphaAgentKitPlugin({ timeoutMs: NaN }), /INVALID_TIMEOUT_MS/);
    assert.throws(() => createMoltAlphaAgentKitPlugin({ gatewayUrl: 'ftp://bad.local' }), /INVALID_GATEWAY_URL/);

    const requestedUrls: string[] = [];
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    const spkiHex = spkiDer.toString('hex');

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith('/v1/witnesses/public-keys')) {
        return new Response(
          JSON.stringify({
            active_key_id: 'wit_key_agent_02',
            public_keys: {
              wit_key_agent_02: {
                algorithm: 'Ed25519',
                public_key_base58: 'TestPub58',
                public_key_spki_hex: spkiHex,
                fingerprint_sha256: sha256Hex(spkiDer),
                status: 'ACTIVE',
                valid_from: '2026-01-01T00:00:00Z',
                valid_until: '2027-01-01T00:00:00Z',
                retired_at: null,
              },
            },
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const plugin = createMoltAlphaAgentKitPlugin({ fetchImpl: mockFetch });

    await assert.rejects(
      () => plugin.methods.verifyWitnessReceipt(null as never),
      /WITNESS_INPUT_REQUIRED/
    );
    await assert.rejects(
      () => plugin.methods.getFirstPassageProbability({ targetNetPct: NaN }),
      /INVALID_TARGET_NET_PCT/
    );
    await assert.rejects(
      () => plugin.methods.getFirstPassageProbability({ targetNetPct: Infinity }),
      /INVALID_TARGET_NET_PCT/
    );

    const verifyAction = plugin.actions.find((a) => a.name === 'MOLTALPHA_VERIFY_WITNESS')!;
    await assert.rejects(
      () => verifyAction.handler(null as never),
      /WITNESS_INPUT_REQUIRED/
    );

    const digestPayload = { state: 'OK', slot: 1 };
    const digestHex = sha256Hex(canonicalizeJsonRfc8785(digestPayload));
    const digestSig = crypto.sign(null, Buffer.from(digestHex, 'utf8'), privateKey).toString('hex');
    const digestVerify = (await verifyAction.handler({
      payload: digestPayload,
      signature: digestSig,
      keyId: 'wit_key_agent_02',
      signingInput: 'sha256_hex',
    })) as { valid: boolean; code: string };
    assert.equal(digestVerify.valid, true);
    assert.equal(digestVerify.code, 'VERIFIED');

    const riskAction = plugin.actions.find((a) => a.name === 'MOLTALPHA_GET_FIRST_PASSAGE_RISK')!;
    await riskAction.handler(null as never);
    await assert.rejects(
      () => riskAction.handler({ pair: 'SOL/USDC', targetNetPct: NaN }),
      /INVALID_TARGET_NET_PCT/
    );
    assert.equal(
      requestedUrls.some((u) => u.includes('NaN')),
      false,
      'Non-finite targetNetPct must never be serialized into query string'
    );
  });
});
