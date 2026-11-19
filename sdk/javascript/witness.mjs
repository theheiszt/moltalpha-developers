/**
 * MoltALPHA Public Witness SDK (JavaScript ESM)
 * Offline RFC 8032 Ed25519 signature verification + RFC 8785 JCS canonicalization
 * + live key registry inspection against /v1/witnesses/public-keys.
 * Zero external runtime dependencies (uses Node.js built-in node:crypto).
 */

import crypto from 'node:crypto';
import { DEFAULT_API_GATEWAY_URL, requestJson } from './http.mjs';

const ED25519_SPKI_PREFIX_HEX = '302a300506032b6570032100';
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export const WITNESS_SCOPE_NOTE =
  'Cryptographic signature validity confirms origin and integrity only; it does not guarantee data accuracy or on-chain transaction finality.';

export function decodeBase58(input) {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new Error('Base58 input must be a non-empty string');
  }
  const str = input.trim();
  const bytes = [0];
  for (let i = 0; i < str.length; i += 1) {
    const charIndex = BASE58_ALPHABET.indexOf(str[i]);
    if (charIndex === -1) {
      throw new Error(`Invalid Base58 character: "${str[i]}"`);
    }
    let carry = charIndex;
    for (let j = 0; j < bytes.length; j += 1) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingZeros = 0;
  while (leadingZeros < str.length && str[leadingZeros] === '1') {
    leadingZeros += 1;
  }
  const out = Buffer.alloc(leadingZeros + bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    out[out.length - 1 - i] = bytes[i];
  }
  return out;
}

/**
 * RFC 8785 JSON Canonicalization Scheme (JCS).
 */
export function canonicalizeJsonRfc8785(value, seen = new WeakSet()) {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError(`Cannot canonicalize unsupported JSON value type: ${typeof value}`);
  }
  if (typeof value === 'bigint') {
    throw new TypeError('BigInt cannot be serialized directly in RFC 8785 JSON; encode as string first');
  }
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new RangeError('RFC 8785 forbids NaN and Infinity in canonical JSON');
    }
    if (Object.is(value, -0)) return '0';
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw new Error('RFC 8785 circular reference detected');
    }
    if (typeof value.toJSON === 'function') {
      seen.add(value);
      try {
        return canonicalizeJsonRfc8785(value.toJSON(), seen);
      } finally {
        seen.delete(value);
      }
    }
    seen.add(value);
    try {
      if (Array.isArray(value)) {
        const items = value.map((item) =>
          item === undefined || typeof item === 'function' || typeof item === 'symbol'
            ? 'null'
            : canonicalizeJsonRfc8785(item, seen)
        );
        return `[${items.join(',')}]`;
      }
      const keys = Object.keys(value)
        .filter((k) => value[k] !== undefined && typeof value[k] !== 'function' && typeof value[k] !== 'symbol')
        .sort();
      const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJsonRfc8785(value[k], seen)}`);
      return `{${entries.join(',')}}`;
    } finally {
      seen.delete(value);
    }
  }
  throw new TypeError(`Unsupported value in canonicalizeJsonRfc8785: ${typeof value}`);
}

export const canonicalizeRfc8785 = canonicalizeJsonRfc8785;
export const canonicalizeJson = canonicalizeJsonRfc8785;
export const canonicalize = canonicalizeJsonRfc8785;

function parseSignatureBytes(signature) {
  if (typeof signature !== 'string' || signature.trim().length === 0) {
    throw new Error('Missing or empty signature string');
  }
  const trimmed = signature.trim().replace(/^ed25519:/i, '').trim();
  if (!trimmed) {
    throw new Error('Missing or empty signature string');
  }
  if (/^[0-9a-fA-F]{128}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  if (trimmed.length <= 128 && /^[A-Za-z0-9_-]+$/.test(trimmed) && (trimmed.includes('-') || trimmed.includes('_'))) {
    const buf = Buffer.from(trimmed, 'base64url');
    if (buf.length === 64) return buf;
  }
  if (trimmed.length <= 128 && /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    const buf = Buffer.from(trimmed, 'base64');
    if (buf.length === 64) return buf;
  }
  throw new Error('Invalid Ed25519 signature encoding: expected 64-byte hex (128 chars), base64, or base64url');
}

function resolveEd25519PublicKey(input) {
  if (input.publicKeyPem && typeof input.publicKeyPem === 'string' && input.publicKeyPem.trim().length > 0) {
    const keyObj = crypto.createPublicKey(input.publicKeyPem.trim());
    if (keyObj.asymmetricKeyType !== 'ed25519') {
      throw new Error(`Unsupported public key type "${keyObj.asymmetricKeyType}": only Ed25519 is accepted`);
    }
    return keyObj;
  }
  if (
    input.publicKeySpkiHex &&
    typeof input.publicKeySpkiHex === 'string' &&
    input.publicKeySpkiHex.trim().length > 0
  ) {
    const cleanHex = input.publicKeySpkiHex.trim().toLowerCase();
    if (!/^[0-9a-f]+$/.test(cleanHex)) {
      throw new Error('publicKeySpkiHex must be valid hexadecimal');
    }
    const derHex =
      cleanHex.length === 64
        ? `${ED25519_SPKI_PREFIX_HEX}${cleanHex}`
        : cleanHex.startsWith(ED25519_SPKI_PREFIX_HEX) && cleanHex.length === 88
          ? cleanHex
          : null;
    if (!derHex) {
      throw new Error('Invalid Ed25519 SPKI hex: expected 44-byte Ed25519 DER SPKI hex or 32-byte raw public key hex');
    }
    const keyObj = crypto.createPublicKey({
      key: Buffer.from(derHex, 'hex'),
      format: 'der',
      type: 'spki',
    });
    if (keyObj.asymmetricKeyType !== 'ed25519') {
      throw new Error('Resolved key is not Ed25519');
    }
    return keyObj;
  }
  if (
    input.publicKeyBase58 &&
    typeof input.publicKeyBase58 === 'string' &&
    input.publicKeyBase58.trim().length > 0
  ) {
    const rawBytes = decodeBase58(input.publicKeyBase58.trim());
    let derBytes;
    if (rawBytes.length === 32) {
      derBytes = Buffer.concat([Buffer.from(ED25519_SPKI_PREFIX_HEX, 'hex'), rawBytes]);
    } else if (
      rawBytes.length === 44 &&
      rawBytes.subarray(0, 12).toString('hex') === ED25519_SPKI_PREFIX_HEX
    ) {
      derBytes = rawBytes;
    } else {
      throw new Error(`Invalid Ed25519 Base58 public key length (${rawBytes.length} bytes)`);
    }
    const keyObj = crypto.createPublicKey({
      key: derBytes,
      format: 'der',
      type: 'spki',
    });
    if (keyObj.asymmetricKeyType !== 'ed25519') {
      throw new Error('Resolved Base58 key is not Ed25519');
    }
    return keyObj;
  }
  throw new Error('Missing public key: provide publicKeySpkiHex, publicKeyPem, or publicKeyBase58');
}

/**
 * Verifies an Ed25519 witness signature offline.
 * Distinguishes cryptographic signature validity from data accuracy and on-chain transaction finality.
 */
export function verifyWitnessSignature(input) {
  const baseResult = {
    valid: false,
    keyId: input?.keyId,
    canonicalJson: '',
    payloadSha256Hex: '',
    scopeNote: WITNESS_SCOPE_NOTE,
    verificationScope: {
      confirmsOriginAndIntegrity: true,
      guaranteesDataAccuracy: false,
      guaranteesOnChainFinality: false,
    },
  };

  if (!input || typeof input !== 'object') {
    return { ...baseResult, reason: 'Verification input must be an object' };
  }

  if (input.algorithm !== undefined && input.algorithm !== null) {
    if (typeof input.algorithm !== 'string' || input.algorithm.trim().toUpperCase() !== 'ED25519') {
      return {
        ...baseResult,
        reason: `Unsupported signature algorithm "${String(input.algorithm)}": only Ed25519 (RFC 8032) is accepted`,
      };
    }
  }

  let canonicalJson = '';
  try {
    if (typeof input.canonicalJson === 'string') {
      if (input.canonicalJson.trim().length === 0) {
        return { ...baseResult, reason: 'canonicalJson cannot be empty' };
      }
      // Validate that canonicalJson is well-formed JSON
      const parsed = JSON.parse(input.canonicalJson);
      if (parsed === null || typeof parsed !== 'object') {
        return { ...baseResult, reason: 'Witness payload must be a JSON object' };
      }
      canonicalJson = input.canonicalJson;
    } else if (input.payload !== undefined && input.payload !== null && typeof input.payload === 'object') {
      canonicalJson = canonicalizeJsonRfc8785(input.payload);
    } else {
      return { ...baseResult, reason: 'Provide either a non-null payload object or canonicalJson string' };
    }
  } catch (err) {
    return {
      ...baseResult,
      reason: `Payload canonicalization failed: ${err?.message || String(err)}`,
    };
  }

  const payloadSha256Hex = crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');

  if (typeof input.expectedPayloadSha256 === 'string' && input.expectedPayloadSha256.trim().length > 0) {
    if (input.expectedPayloadSha256.trim().toLowerCase() !== payloadSha256Hex.toLowerCase()) {
      return {
        ...baseResult,
        canonicalJson,
        payloadSha256Hex,
        reason: 'Payload SHA-256 digest mismatch against expectedPayloadSha256',
      };
    }
  }

  try {
    const publicKey = resolveEd25519PublicKey(input);
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' });
    const spkiFp = crypto.createHash('sha256').update(spkiDer).digest('hex');
    const rawFp = crypto.createHash('sha256').update(spkiDer.subarray(spkiDer.length - 32)).digest('hex');

    if (typeof input.expectedKeyFingerprintSha256 === 'string' && input.expectedKeyFingerprintSha256.trim().length > 0) {
      const expectedFp = input.expectedKeyFingerprintSha256.trim().toLowerCase();
      if (expectedFp !== spkiFp && expectedFp !== rawFp) {
        return {
          ...baseResult,
          canonicalJson,
          payloadSha256Hex,
          reason: 'Public key SHA-256 fingerprint mismatch against expectedKeyFingerprintSha256',
        };
      }
    }

    const sigBytes = parseSignatureBytes(input.signature);
    const mode = input.signingInput || 'auto';

    let valid = false;
    if (mode === 'canonical_json') {
      valid = crypto.verify(null, Buffer.from(canonicalJson, 'utf8'), publicKey, sigBytes);
    } else if (mode === 'sha256_hex') {
      valid = crypto.verify(null, Buffer.from(payloadSha256Hex, 'utf8'), publicKey, sigBytes);
    } else {
      valid =
        crypto.verify(null, Buffer.from(canonicalJson, 'utf8'), publicKey, sigBytes) ||
        crypto.verify(null, Buffer.from(payloadSha256Hex, 'utf8'), publicKey, sigBytes);
    }

    return {
      ...baseResult,
      valid,
      canonicalJson,
      payloadSha256Hex,
      reason: valid ? undefined : 'Ed25519 signature verification failed (mismatch)',
    };
  } catch (err) {
    return {
      ...baseResult,
      canonicalJson,
      payloadSha256Hex,
      reason: err?.message || String(err),
    };
  }
}

export const verifyWitness = verifyWitnessSignature;
export const verifyEvidence = verifyWitnessSignature;
export const verifyReceipt = verifyWitnessSignature;

export async function fetchPublicKeys(options = {}) {
  const baseUrl = String(options.gatewayUrl || options.baseUrl || DEFAULT_API_GATEWAY_URL).replace(/\/+$/, '');
  const data = await requestJson(`${baseUrl}/v1/witnesses/public-keys`, options);
  if (!data || typeof data !== 'object' || !data.public_keys || typeof data.public_keys !== 'object') {
    throw new Error('Malformed witness public key registry response');
  }
  return data;
}

export const fetchWitnessKeyRegistry = fetchPublicKeys;
export const getPublicKeys = fetchPublicKeys;
export const fetchWitnessKeys = fetchPublicKeys;

export async function fetchWitness(witnessId, options = {}) {
  if (typeof witnessId !== 'string' || witnessId.trim().length === 0) {
    throw new Error('witnessId must be a non-empty string');
  }
  const trimmed = witnessId.trim();
  if (trimmed.includes('/') || trimmed.includes('..') || trimmed.includes('?')) {
    throw new Error('Invalid witnessId: path traversal characters are forbidden');
  }
  const baseUrl = String(options.gatewayUrl || options.baseUrl || DEFAULT_API_GATEWAY_URL).replace(/\/+$/, '');
  return requestJson(`${baseUrl}/v1/witnesses/${encodeURIComponent(trimmed)}`, options);
}

export const getWitness = fetchWitness;
export const fetchWitnessReceipt = fetchWitness;

export async function verifyWithLiveRegistry(input = {}) {
  const registry = await fetchPublicKeys(input);
  const targetKeyId = input.keyId || registry.active_key_id;
  if (!targetKeyId || !registry.public_keys?.[targetKeyId]) {
    return {
      valid: false,
      keyId: targetKeyId,
      canonicalJson: '',
      payloadSha256Hex: '',
      scopeNote: WITNESS_SCOPE_NOTE,
      reason: `Key ID "${String(targetKeyId)}" not found in witness public key registry`,
    };
  }

  const keyEntry = registry.public_keys[targetKeyId];
  const statusUpper = String(keyEntry.status || keyEntry.revocation_status || 'ACTIVE').toUpperCase();
  const isRetired =
    statusUpper === 'RETIRED' || Boolean(keyEntry.retired_at && String(keyEntry.retired_at).trim());
  if (statusUpper === 'REVOKED' || (isRetired && !input.allowRetiredKeys) || (statusUpper !== 'ACTIVE' && !isRetired)) {
    return {
      valid: false,
      keyId: targetKeyId,
      canonicalJson: '',
      payloadSha256Hex: '',
      scopeNote: WITNESS_SCOPE_NOTE,
      reason: `Witness key "${targetKeyId}" has status ${statusUpper}`,
    };
  }

  const nowMs = typeof input.nowMs === 'number' && Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  if (keyEntry.valid_from) {
    const fromMs = Date.parse(keyEntry.valid_from);
    if (Number.isNaN(fromMs) || nowMs < fromMs) {
      return {
        valid: false,
        keyId: targetKeyId,
        canonicalJson: '',
        payloadSha256Hex: '',
        scopeNote: WITNESS_SCOPE_NOTE,
        reason: `Witness key "${targetKeyId}" is not yet valid (valid_from: ${keyEntry.valid_from})`,
      };
    }
  }

  const expiryIso = keyEntry.valid_until || keyEntry.expires_at;
  if (expiryIso) {
    const expMs = Date.parse(expiryIso);
    if (Number.isNaN(expMs) || expMs <= nowMs) {
      return {
        valid: false,
        keyId: targetKeyId,
        canonicalJson: '',
        payloadSha256Hex: '',
        scopeNote: WITNESS_SCOPE_NOTE,
        reason: `Witness key "${targetKeyId}" expired at ${expiryIso}`,
      };
    }
  }

  return verifyWitnessSignature({
    ...input,
    keyId: targetKeyId,
    publicKeySpkiHex: keyEntry.public_key_spki_hex,
    publicKeyPem: keyEntry.public_key_pem,
    publicKeyBase58: keyEntry.public_key_base58,
    expectedKeyFingerprintSha256: input.expectedKeyFingerprintSha256 || keyEntry.fingerprint_sha256,
    algorithm: keyEntry.algorithm || 'Ed25519',
  });
}

export const verifyWithRegistry = verifyWithLiveRegistry;
export const verifyWitnessWithRegistry = verifyWithLiveRegistry;

export class WitnessClient {
  constructor(options = {}) {
    this.options = { ...options };
  }

  canonicalizeJsonRfc8785(value) {
    return canonicalizeJsonRfc8785(value);
  }

  verifyWitness(input) {
    return verifyWitnessSignature(input);
  }

  verifyWitnessSignature(input) {
    return verifyWitnessSignature(input);
  }

  async fetchPublicKeys(overrideOptions = {}) {
    return fetchPublicKeys({ ...this.options, ...overrideOptions });
  }

  async fetchWitness(witnessId, overrideOptions = {}) {
    return fetchWitness(witnessId, { ...this.options, ...overrideOptions });
  }

  async verifyWithLiveRegistry(input = {}) {
    return verifyWithLiveRegistry({ ...this.options, ...input });
  }

  async verifyWithRegistry(input = {}) {
    return verifyWithLiveRegistry({ ...this.options, ...input });
  }
}

export const MoltAlphaWitnessClient = WitnessClient;
