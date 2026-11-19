import crypto from 'node:crypto';
export const DEFAULT_MOLTALPHA_GATEWAY_URL = 'https://api.moltalpha.dev';
/**
 * Deterministic RFC 8785 (JSON Canonicalization Scheme) serializer.
 * Recursively sorts object keys in UTF-16 code-unit order without extraneous whitespace.
 */
export function canonicalizeJsonRfc8785(value, seen = new WeakSet()) {
    if (value === null)
        return 'null';
    if (typeof value === 'boolean')
        return value ? 'true' : 'false';
    if (typeof value === 'string')
        return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new TypeError('RFC8785_NON_FINITE_NUMBER');
        }
        return JSON.stringify(value); // -0 -> "0"
    }
    if (typeof value === 'undefined' ||
        typeof value === 'function' ||
        typeof value === 'symbol' ||
        typeof value === 'bigint') {
        throw new TypeError(`RFC8785_UNSUPPORTED_TYPE_${typeof value}`);
    }
    const obj = value;
    if (seen.has(obj)) {
        throw new Error('RFC8785_CIRCULAR_REFERENCE');
    }
    if (typeof obj.toJSON === 'function') {
        seen.add(obj);
        try {
            return canonicalizeJsonRfc8785(obj.toJSON(), seen);
        }
        finally {
            seen.delete(obj);
        }
    }
    seen.add(obj);
    try {
        if (Array.isArray(value)) {
            const items = value.map((item) => item === undefined || typeof item === 'function' || typeof item === 'symbol'
                ? 'null'
                : canonicalizeJsonRfc8785(item, seen));
            return `[${items.join(',')}]`;
        }
        const record = value;
        const sortedKeys = Object.keys(record).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        const pairs = [];
        for (const key of sortedKeys) {
            const prop = record[key];
            if (prop === undefined || typeof prop === 'function' || typeof prop === 'symbol')
                continue;
            pairs.push(`${JSON.stringify(key)}:${canonicalizeJsonRfc8785(prop, seen)}`);
        }
        return `{${pairs.join(',')}}`;
    }
    finally {
        seen.delete(obj);
    }
}
export function sha256Hex(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}
/**
 * Parses an Ed25519 signature string in hex (128 hex chars), base64, or base64url.
 * Strips an optional `ed25519:` prefix if present.
 */
export function decodeEd25519Signature(rawSignature) {
    const cleaned = rawSignature.trim().replace(/^ed25519:/i, '');
    if (!cleaned)
        return null;
    if (/^[0-9a-fA-F]{128}$/.test(cleaned)) {
        return Buffer.from(cleaned, 'hex');
    }
    // Try base64url / base64
    const normalized = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    if (/^[A-Za-z0-9+/]+=*$/.test(padded)) {
        const buf = Buffer.from(padded, 'base64');
        if (buf.length === 64) {
            return buf;
        }
    }
    return null;
}
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
function decodeBase58(input) {
    const str = input.trim();
    if (!str)
        throw new Error('EMPTY_BASE58');
    let num = 0n;
    for (const ch of str) {
        const idx = BASE58_ALPHABET.indexOf(ch);
        if (idx === -1)
            throw new Error('INVALID_BASE58_CHAR');
        num = num * 58n + BigInt(idx);
    }
    const bytes = [];
    while (num > 0n) {
        bytes.push(Number(num & 0xffn));
        num >>= 8n;
    }
    bytes.reverse();
    let leadingZeros = 0;
    for (const ch of str) {
        if (ch === '1')
            leadingZeros += 1;
        else
            break;
    }
    return Buffer.concat([Buffer.alloc(leadingZeros, 0), Buffer.from(bytes)]);
}
export function loadEd25519PublicKey(options) {
    if (options.publicKeySpkiHex && options.publicKeySpkiHex.trim().length > 0) {
        const hex = options.publicKeySpkiHex.trim();
        if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
            throw new Error('INVALID_SPKI_HEX');
        }
        const spkiDer = Buffer.from(hex, 'hex');
        const keyObject = crypto.createPublicKey({
            key: spkiDer,
            format: 'der',
            type: 'spki',
        });
        if (keyObject.asymmetricKeyType !== 'ed25519') {
            throw new Error('UNSUPPORTED_KEY_TYPE');
        }
        return { keyObject, spkiDer };
    }
    if (options.publicKeyPem && options.publicKeyPem.trim().length > 0) {
        const keyObject = crypto.createPublicKey(options.publicKeyPem.trim());
        if (keyObject.asymmetricKeyType !== 'ed25519') {
            throw new Error('UNSUPPORTED_KEY_TYPE');
        }
        const spkiDer = keyObject.export({ format: 'der', type: 'spki' });
        return { keyObject, spkiDer };
    }
    if (options.publicKeyBase58 && options.publicKeyBase58.trim().length > 0) {
        const rawKey = decodeBase58(options.publicKeyBase58);
        if (rawKey.length !== 32) {
            throw new Error('INVALID_BASE58_ED25519_LENGTH');
        }
        const spkiDer = Buffer.concat([ED25519_SPKI_PREFIX, rawKey]);
        const keyObject = crypto.createPublicKey({
            key: spkiDer,
            format: 'der',
            type: 'spki',
        });
        return { keyObject, spkiDer };
    }
    throw new Error('MISSING_PUBLIC_KEY');
}
/**
 * Offline Ed25519 + RFC 8785 cryptographic signature verifier.
 * Zero network calls required once you hold the witness SPKI public key.
 */
export function verifyWitnessSignature(input) {
    let canonicalJson = '';
    if (typeof input.canonicalJson === 'string' && input.canonicalJson.length > 0) {
        try {
            JSON.parse(input.canonicalJson);
            canonicalJson = input.canonicalJson;
        }
        catch {
            return {
                valid: false,
                code: 'INVALID_CANONICAL_JSON',
                canonicalJson: '',
                payloadSha256: '',
                keyFingerprintSha256: null,
                message: 'Provided canonicalJson is not valid JSON.',
            };
        }
    }
    else if (input.payload !== undefined) {
        try {
            canonicalJson = canonicalizeJsonRfc8785(input.payload);
        }
        catch (err) {
            return {
                valid: false,
                code: 'INVALID_CANONICAL_JSON',
                canonicalJson: '',
                payloadSha256: '',
                keyFingerprintSha256: null,
                message: err instanceof Error ? `Failed RFC 8785 canonicalization: ${err.message}` : 'Failed RFC 8785 canonicalization.',
            };
        }
    }
    if (!canonicalJson) {
        return {
            valid: false,
            code: 'MISSING_PAYLOAD',
            canonicalJson: '',
            payloadSha256: '',
            keyFingerprintSha256: null,
            message: 'Either payload or canonicalJson is required.',
        };
    }
    const payloadSha256 = sha256Hex(canonicalJson);
    if (input.expectedPayloadSha256 &&
        input.expectedPayloadSha256.trim().toLowerCase() !== payloadSha256.toLowerCase()) {
        return {
            valid: false,
            code: 'PAYLOAD_DIGEST_MISMATCH',
            canonicalJson,
            payloadSha256,
            keyFingerprintSha256: null,
            message: 'Computed SHA-256 digest of RFC 8785 canonical JSON does not match expectedPayloadSha256.',
        };
    }
    if (!input.publicKeySpkiHex && !input.publicKeyPem && !input.publicKeyBase58) {
        return {
            valid: false,
            code: 'MISSING_PUBLIC_KEY',
            canonicalJson,
            payloadSha256,
            keyFingerprintSha256: null,
            message: 'Either publicKeySpkiHex, publicKeyPem, or publicKeyBase58 is required.',
        };
    }
    let keyObject;
    let spkiDer;
    try {
        ({ keyObject, spkiDer } = loadEd25519PublicKey({
            publicKeySpkiHex: input.publicKeySpkiHex,
            publicKeyPem: input.publicKeyPem,
            publicKeyBase58: input.publicKeyBase58,
        }));
    }
    catch {
        return {
            valid: false,
            code: 'INVALID_PUBLIC_KEY',
            canonicalJson,
            payloadSha256,
            keyFingerprintSha256: null,
            message: 'Provided Ed25519 public key could not be parsed as a valid SPKI/PEM key.',
        };
    }
    const spkiFingerprint = sha256Hex(spkiDer);
    const rawPub32 = spkiDer.subarray(spkiDer.length - 32);
    const rawFingerprint = sha256Hex(rawPub32);
    if (input.expectedKeyFingerprintSha256) {
        const expected = input.expectedKeyFingerprintSha256.trim().toLowerCase();
        if (expected !== spkiFingerprint && expected !== rawFingerprint) {
            return {
                valid: false,
                code: 'KEY_FINGERPRINT_MISMATCH',
                canonicalJson,
                payloadSha256,
                keyFingerprintSha256: spkiFingerprint,
                message: 'Public key SHA-256 fingerprint does not match expectedKeyFingerprintSha256.',
            };
        }
    }
    const sigBytes = decodeEd25519Signature(input.signature);
    if (!sigBytes) {
        return {
            valid: false,
            code: 'INVALID_SIGNATURE_FORMAT',
            canonicalJson,
            payloadSha256,
            keyFingerprintSha256: spkiFingerprint,
            message: 'Signature must be a 64-byte Ed25519 signature encoded in hex, base64, or base64url.',
        };
    }
    const signingInputMode = input.signingInput ?? 'canonical_json';
    if (signingInputMode !== 'canonical_json' && signingInputMode !== 'sha256_hex') {
        return {
            valid: false,
            code: 'INVALID_SIGNATURE_FORMAT',
            canonicalJson,
            payloadSha256,
            keyFingerprintSha256: spkiFingerprint,
            message: `Unsupported signingInput "${String(input.signingInput)}"; expected 'canonical_json' or 'sha256_hex'.`,
        };
    }
    const signedBytes = signingInputMode === 'sha256_hex'
        ? Buffer.from(payloadSha256, 'utf8')
        : Buffer.from(canonicalJson, 'utf8');
    const verified = crypto.verify(null, signedBytes, keyObject, sigBytes);
    if (!verified) {
        return {
            valid: false,
            code: 'SIGNATURE_MISMATCH',
            canonicalJson,
            payloadSha256,
            keyFingerprintSha256: spkiFingerprint,
            message: 'Ed25519 cryptographic signature verification failed.',
        };
    }
    return {
        valid: true,
        code: 'VERIFIED',
        canonicalJson,
        payloadSha256,
        keyFingerprintSha256: spkiFingerprint,
        message: signingInputMode === 'sha256_hex'
            ? 'Ed25519 signature verified against RFC 8785 SHA-256 hex digest.'
            : 'Ed25519 signature verified against RFC 8785 canonical JSON.',
    };
}
/**
 * Fetches the authoritative rotating Ed25519 witness key registry from MoltALPHA.
 */
export async function fetchWitnessKeyRegistry(options) {
    const gatewayUrl = (options?.gatewayUrl || DEFAULT_MOLTALPHA_GATEWAY_URL).replace(/\/+$/, '');
    const fetchImpl = options?.fetchImpl || fetch;
    const timeoutMs = options?.timeoutMs ?? 5_000;
    const res = await fetchImpl(`${gatewayUrl}/v1/witnesses/public-keys`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
        throw new Error(`WITNESS_REGISTRY_HTTP_${res.status}`);
    }
    const data = (await res.json());
    if (!data ||
        typeof data.active_key_id !== 'string' ||
        !data.public_keys ||
        typeof data.public_keys !== 'object' ||
        !data.public_keys[data.active_key_id]) {
        throw new Error('WITNESS_REGISTRY_MALFORMED');
    }
    return data;
}
/**
 * Convenience helper: resolves `keyId` (or active key) from the live MoltALPHA registry
 * and verifies an Ed25519 witness signature offline. Fail-closed on REVOKED/RETIRED/expired keys
 * and unsupported algorithms.
 */
export async function verifyWithLiveRegistry(options) {
    const registry = await fetchWitnessKeyRegistry({
        gatewayUrl: options.gatewayUrl,
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
    });
    const targetKeyId = options.keyId || registry.active_key_id;
    const keyEntry = registry.public_keys[targetKeyId];
    if (!keyEntry) {
        return {
            valid: false,
            code: 'INVALID_PUBLIC_KEY',
            canonicalJson: '',
            payloadSha256: '',
            keyFingerprintSha256: null,
            keyId: targetKeyId,
            keyStatus: null,
            message: `Key epoch "${targetKeyId}" not found in authoritative registry.`,
        };
    }
    const keyStatus = keyEntry.status ?? null;
    if (keyEntry.algorithm !== 'Ed25519') {
        return {
            valid: false,
            code: 'UNSUPPORTED_ALGORITHM',
            canonicalJson: '',
            payloadSha256: '',
            keyFingerprintSha256: null,
            keyId: targetKeyId,
            keyStatus,
            message: `Unsupported witness key algorithm "${keyEntry.algorithm}"; only Ed25519 is accepted.`,
        };
    }
    const normalizedStatus = String(keyEntry.status || '').toUpperCase();
    if (normalizedStatus === 'REVOKED') {
        return {
            valid: false,
            code: 'KEY_REVOKED',
            canonicalJson: '',
            payloadSha256: '',
            keyFingerprintSha256: null,
            keyId: targetKeyId,
            keyStatus,
            message: `Witness key "${targetKeyId}" is REVOKED and cannot be trusted.`,
        };
    }
    if (normalizedStatus === 'RETIRED' || Boolean(keyEntry.retired_at && String(keyEntry.retired_at).trim())) {
        if (!options.allowRetiredKeys) {
            return {
                valid: false,
                code: 'KEY_RETIRED',
                canonicalJson: '',
                payloadSha256: '',
                keyFingerprintSha256: null,
                keyId: targetKeyId,
                keyStatus,
                message: `Witness key "${targetKeyId}" is RETIRED (pass allowRetiredKeys: true for historical verification).`,
            };
        }
    }
    else if (normalizedStatus !== 'ACTIVE') {
        return {
            valid: false,
            code: 'INVALID_PUBLIC_KEY',
            canonicalJson: '',
            payloadSha256: '',
            keyFingerprintSha256: null,
            keyId: targetKeyId,
            keyStatus,
            message: `Witness key "${targetKeyId}" has invalid status "${keyEntry.status}".`,
        };
    }
    const now = options.nowMs ?? Date.now();
    if (keyEntry.valid_from) {
        const fromMs = Date.parse(keyEntry.valid_from);
        if (!Number.isFinite(fromMs) || now < fromMs) {
            return {
                valid: false,
                code: 'KEY_NOT_YET_VALID',
                canonicalJson: '',
                payloadSha256: '',
                keyFingerprintSha256: null,
                keyId: targetKeyId,
                keyStatus,
                message: `Witness key "${targetKeyId}" is not yet valid (valid_from: ${keyEntry.valid_from}).`,
            };
        }
    }
    if (keyEntry.valid_until) {
        const untilMs = Date.parse(keyEntry.valid_until);
        if (!Number.isFinite(untilMs) || now > untilMs) {
            return {
                valid: false,
                code: 'KEY_EXPIRED',
                canonicalJson: '',
                payloadSha256: '',
                keyFingerprintSha256: null,
                keyId: targetKeyId,
                keyStatus,
                message: `Witness key "${targetKeyId}" has expired (valid_until: ${keyEntry.valid_until}).`,
            };
        }
    }
    if (!keyEntry.fingerprint_sha256 || typeof keyEntry.fingerprint_sha256 !== 'string' || !keyEntry.fingerprint_sha256.trim()) {
        return {
            valid: false,
            code: 'KEY_FINGERPRINT_MISMATCH',
            canonicalJson: '',
            payloadSha256: '',
            keyFingerprintSha256: null,
            keyId: targetKeyId,
            keyStatus,
            message: `Witness key "${targetKeyId}" is missing fingerprint_sha256 in registry.`,
        };
    }
    const result = verifyWitnessSignature({
        payload: options.payload,
        canonicalJson: options.canonicalJson,
        signature: options.signature,
        publicKeySpkiHex: keyEntry.public_key_spki_hex,
        expectedPayloadSha256: options.expectedPayloadSha256,
        expectedKeyFingerprintSha256: keyEntry.fingerprint_sha256,
        signingInput: options.signingInput,
    });
    return {
        ...result,
        keyId: targetKeyId,
        keyStatus: keyEntry.status,
    };
}
//# sourceMappingURL=index.js.map