import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  canonicalizeJsonRfc8785,
  decodeEd25519Signature,
  fetchWitnessKeyRegistry,
  loadEd25519PublicKey,
  sha256Hex,
  verifyWithLiveRegistry,
  verifyWitnessSignature,
} from './index';

// Real authoritative SPKI hex published by https://api.moltalpha.dev/v1/witnesses/public-keys (wit_key_a8a5281fbf00)
const LIVE_MOLTALPHA_SPKI_HEX =
  '302a300506032b65700321003f35fa618e74882d850f2859143ede624983bf0cf9d00672135cb9cbf01e2225';

describe('@moltalpha/witness-verify', () => {
  it('canonicalizes nested JSON deterministically per RFC 8785', () => {
    const a = { z: 1, a: { d: true, b: [3, { y: 'yes', x: 'no' }] } };
    const b = { a: { b: [3, { x: 'no', y: 'yes' }], d: true }, z: 1 };
    assert.equal(canonicalizeJsonRfc8785(a), canonicalizeJsonRfc8785(b));
    assert.equal(
      canonicalizeJsonRfc8785(a),
      '{"a":{"b":[3,{"x":"no","y":"yes"}],"d":true},"z":1}'
    );
  });

  it('verifies real Ed25519 signatures over RFC 8785 JSON across hex, base64, and base64url encodings', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    const spkiHex = spkiDer.toString('hex');
    const fingerprint = sha256Hex(spkiDer);

    const payload = {
      schema: 'moltalpha.witness.receipt.v1',
      pool: 'Raydium_SOL_USDC',
      risk_score: 2.1,
      slot: 312_900_001,
    };
    const canonical = canonicalizeJsonRfc8785(payload);
    const sigBuf = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKey);

    for (const encoded of [
      sigBuf.toString('hex'),
      sigBuf.toString('base64'),
      `ed25519:${sigBuf.toString('base64url')}`,
    ]) {
      const res = verifyWitnessSignature({
        payload,
        signature: encoded,
        publicKeySpkiHex: spkiHex,
        expectedPayloadSha256: sha256Hex(canonical),
        expectedKeyFingerprintSha256: fingerprint,
      });
      assert.equal(res.valid, true, `Expected valid signature for encoding ${encoded.slice(0, 12)}`);
      assert.equal(res.code, 'VERIFIED');
    }

    // Tampered payload must fail cryptographically
    const tampered = verifyWitnessSignature({
      payload: { ...payload, risk_score: 0.1 },
      signature: sigBuf.toString('hex'),
      publicKeySpkiHex: spkiHex,
    });
    assert.equal(tampered.valid, false);
    assert.equal(tampered.code, 'SIGNATURE_MISMATCH');

    // Wrong key fingerprint must fail closed
    const badFp = verifyWitnessSignature({
      payload,
      signature: sigBuf.toString('hex'),
      publicKeySpkiHex: spkiHex,
      expectedKeyFingerprintSha256: '0'.repeat(64),
    });
    assert.equal(badFp.valid, false);
    assert.equal(badFp.code, 'KEY_FINGERPRINT_MISMATCH');
  });

  it('parses live MoltALPHA SPKI hex (wit_key_a8a5281fbf00) as a valid Ed25519 public key', () => {
    const { keyObject, spkiDer } = loadEd25519PublicKey({
      publicKeySpkiHex: LIVE_MOLTALPHA_SPKI_HEX,
    });
    assert.equal(keyObject.asymmetricKeyType, 'ed25519');
    assert.equal(spkiDer.length, 44);
    assert.equal(decodeEd25519Signature('invalid_sig'), null);
  });

  it('resolves a key epoch from a registry response and verifies offline via verifyWithLiveRegistry', async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    const spkiHex = spkiDer.toString('hex');

    const payload = { event: 'solana_finality', tx: '5VERv8NMvzbJMEd', ok: true };
    const canonical = canonicalizeJsonRfc8785(payload);
    const sigHex = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('hex');

    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          active_key_id: 'wit_key_test_01',
          public_keys: {
            wit_key_test_01: {
              algorithm: 'Ed25519',
              public_key_base58: 'TestBase58Key',
              public_key_spki_hex: spkiHex,
              fingerprint_sha256: sha256Hex(spkiDer),
              status: 'ACTIVE',
              valid_from: '2026-01-01T00:00:00Z',
              valid_until: '2027-01-01T00:00:00Z',
              retired_at: null,
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    const registry = await fetchWitnessKeyRegistry({ fetchImpl: mockFetch });
    assert.equal(registry.active_key_id, 'wit_key_test_01');

    const res = await verifyWithLiveRegistry({
      payload,
      signature: sigHex,
      keyId: 'wit_key_test_01',
      fetchImpl: mockFetch,
    });
    assert.equal(res.valid, true);
    assert.equal(res.code, 'VERIFIED');
    assert.equal(res.keyStatus, 'ACTIVE');
  });

  it('rejects non-finite numbers, circular objects, unsupported top-level types, and handles Date/.toJSON and -0 per RFC 8785', () => {
    assert.throws(() => canonicalizeJsonRfc8785(NaN), /RFC8785_NON_FINITE_NUMBER/);
    assert.throws(() => canonicalizeJsonRfc8785({ a: Infinity }), /RFC8785_NON_FINITE_NUMBER/);
    assert.throws(() => canonicalizeJsonRfc8785({ a: -Infinity }), /RFC8785_NON_FINITE_NUMBER/);
    assert.throws(() => canonicalizeJsonRfc8785(undefined), /RFC8785_UNSUPPORTED_TYPE_undefined/);
    assert.throws(() => canonicalizeJsonRfc8785(() => {}), /RFC8785_UNSUPPORTED_TYPE_function/);
    assert.throws(() => canonicalizeJsonRfc8785(10n), /RFC8785_UNSUPPORTED_TYPE_bigint/);

    const circular: Record<string, unknown> = { ok: 1 };
    circular.self = circular;
    assert.throws(() => canonicalizeJsonRfc8785(circular), /RFC8785_CIRCULAR_REFERENCE/);

    const iso = '2026-11-19T19:00:00.000Z';
    assert.equal(
      canonicalizeJsonRfc8785({ z: -0, d: new Date(iso), drop: undefined, arr: [1, undefined] }),
      `{"arr":[1,null],"d":"${iso}","z":0}`
    );
  });

  it('supports sha256_hex signingInput for StateWitness payloads and rejects invalid canonicalJson', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    const spkiHex = spkiDer.toString('hex');
    const rawFingerprint = sha256Hex(spkiDer.subarray(spkiDer.length - 32));

    const payload = { state: 'FINALIZED', seq: 42 };
    const canonical = canonicalizeJsonRfc8785(payload);
    const transitionDigestHex = sha256Hex(canonical);
    const digestSigHex = crypto.sign(null, Buffer.from(transitionDigestHex, 'utf8'), privateKey).toString('hex');

    const okRes = verifyWitnessSignature({
      payload,
      signature: digestSigHex,
      publicKeySpkiHex: spkiHex,
      expectedKeyFingerprintSha256: rawFingerprint,
      signingInput: 'sha256_hex',
    });
    assert.equal(okRes.valid, true);
    assert.equal(okRes.code, 'VERIFIED');

    // Default canonical_json mode must reject a digest-signed signature
    const wrongMode = verifyWitnessSignature({
      payload,
      signature: digestSigHex,
      publicKeySpkiHex: spkiHex,
    });
    assert.equal(wrongMode.valid, false);
    assert.equal(wrongMode.code, 'SIGNATURE_MISMATCH');

    const badJson = verifyWitnessSignature({
      canonicalJson: '{bad-json',
      signature: digestSigHex,
      publicKeySpkiHex: spkiHex,
    });
    assert.equal(badJson.valid, false);
    assert.equal(badJson.code, 'INVALID_CANONICAL_JSON');

    const badPayload = verifyWitnessSignature({
      payload: { x: NaN },
      signature: digestSigHex,
      publicKeySpkiHex: spkiHex,
    });
    assert.equal(badPayload.valid, false);
    assert.equal(badPayload.code, 'INVALID_CANONICAL_JSON');
  });

  it('fails closed on REVOKED, RETIRED, expired, not-yet-valid, unsupported-alg, and mismatched-fingerprint registry keys', async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    const spkiHex = spkiDer.toString('hex');
    const fingerprint = sha256Hex(spkiDer);

    const payload = { check: 'lifecycle' };
    const canonical = canonicalizeJsonRfc8785(payload);
    const sigHex = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('hex');

    const makeRegistryFetch = (entryOverrides: Record<string, unknown>): typeof fetch =>
      async () =>
        new Response(
          JSON.stringify({
            active_key_id: 'k1',
            public_keys: {
              k1: {
                algorithm: 'Ed25519',
                public_key_base58: 'TestBase58Key',
                public_key_spki_hex: spkiHex,
                fingerprint_sha256: fingerprint,
                status: 'ACTIVE',
                valid_from: '2026-01-01T00:00:00Z',
                valid_until: '2027-01-01T00:00:00Z',
                retired_at: null,
                ...entryOverrides,
              },
            },
          }),
          { status: 200 }
        );

    const nowInWindow = Date.parse('2026-06-01T00:00:00Z');

    const revoked = await verifyWithLiveRegistry({
      payload,
      signature: sigHex,
      keyId: 'k1',
      nowMs: nowInWindow,
      allowRetiredKeys: true,
      fetchImpl: makeRegistryFetch({ status: 'REVOKED' }),
    });
    assert.equal(revoked.valid, false);
    assert.equal(revoked.code, 'KEY_REVOKED');

    const retiredBlocked = await verifyWithLiveRegistry({
      payload,
      signature: sigHex,
      keyId: 'k1',
      nowMs: nowInWindow,
      fetchImpl: makeRegistryFetch({ status: 'RETIRED', retired_at: '2026-05-01T00:00:00Z' }),
    });
    assert.equal(retiredBlocked.valid, false);
    assert.equal(retiredBlocked.code, 'KEY_RETIRED');

    const retiredAllowed = await verifyWithLiveRegistry({
      payload,
      signature: sigHex,
      keyId: 'k1',
      nowMs: nowInWindow,
      allowRetiredKeys: true,
      fetchImpl: makeRegistryFetch({ status: 'RETIRED', retired_at: '2026-05-01T00:00:00Z' }),
    });
    assert.equal(retiredAllowed.valid, true);
    assert.equal(retiredAllowed.code, 'VERIFIED');

    const notYetValid = await verifyWithLiveRegistry({
      payload,
      signature: sigHex,
      keyId: 'k1',
      nowMs: Date.parse('2025-12-01T00:00:00Z'),
      fetchImpl: makeRegistryFetch({}),
    });
    assert.equal(notYetValid.valid, false);
    assert.equal(notYetValid.code, 'KEY_NOT_YET_VALID');

    const expired = await verifyWithLiveRegistry({
      payload,
      signature: sigHex,
      keyId: 'k1',
      nowMs: Date.parse('2028-01-01T00:00:00Z'),
      fetchImpl: makeRegistryFetch({}),
    });
    assert.equal(expired.valid, false);
    assert.equal(expired.code, 'KEY_EXPIRED');

    const badAlg = await verifyWithLiveRegistry({
      payload,
      signature: sigHex,
      keyId: 'k1',
      nowMs: nowInWindow,
      fetchImpl: makeRegistryFetch({ algorithm: 'RSA-PSS' }),
    });
    assert.equal(badAlg.valid, false);
    assert.equal(badAlg.code, 'UNSUPPORTED_ALGORITHM');

    const badFp = await verifyWithLiveRegistry({
      payload,
      signature: sigHex,
      keyId: 'k1',
      nowMs: nowInWindow,
      fetchImpl: makeRegistryFetch({ fingerprint_sha256: '0'.repeat(64) }),
    });
    assert.equal(badFp.valid, false);
    assert.equal(badFp.code, 'KEY_FINGERPRINT_MISMATCH');
  });
});
