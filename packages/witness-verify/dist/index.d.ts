import crypto from 'node:crypto';
export declare const DEFAULT_MOLTALPHA_GATEWAY_URL = "https://api.moltalpha.dev";
export interface WitnessPublicKeyEntry {
    algorithm: string;
    public_key_base58: string;
    public_key_spki_hex: string;
    fingerprint_sha256: string;
    status: string;
    valid_from: string;
    valid_until: string;
    retired_at: string | null;
}
export interface WitnessKeyRegistryResponse {
    active_key_id: string;
    public_keys: Record<string, WitnessPublicKeyEntry>;
}
export interface VerifyWitnessSignatureInput {
    /** JSON object to canonicalize per RFC 8785 (ignored if canonicalJson is provided). */
    payload?: unknown;
    /** Pre-canonicalized RFC 8785 JSON string. */
    canonicalJson?: string;
    /** Ed25519 signature encoded as hex, standard base64, or base64url (optionally prefixed with `ed25519:`). */
    signature: string;
    /** SubjectPublicKeyInfo DER bytes encoded as hex (as returned in `public_key_spki_hex`). */
    publicKeySpkiHex?: string;
    /** Optional PEM-encoded Ed25519 public key. */
    publicKeyPem?: string;
    /** Optional Base58-encoded 32-byte raw Ed25519 public key (as returned in `public_key_base58`). */
    publicKeyBase58?: string;
    /** Optional expected SHA-256 hex digest of the canonical JSON payload. */
    expectedPayloadSha256?: string;
    /** Optional expected SHA-256 hex fingerprint of the DER SPKI public key bytes (or raw 32-byte Ed25519 key). */
    expectedKeyFingerprintSha256?: string;
    /** Signing message format: 'canonical_json' (default) signs raw RFC 8785 UTF-8 bytes; 'sha256_hex' signs the 64-byte ASCII hex SHA-256 digest (used by api.moltalpha.dev StateWitness). */
    signingInput?: 'canonical_json' | 'sha256_hex';
}
export interface VerifyWitnessSignatureResult {
    valid: boolean;
    code: 'VERIFIED' | 'MISSING_PAYLOAD' | 'INVALID_CANONICAL_JSON' | 'MISSING_PUBLIC_KEY' | 'INVALID_PUBLIC_KEY' | 'INVALID_SIGNATURE_FORMAT' | 'PAYLOAD_DIGEST_MISMATCH' | 'KEY_FINGERPRINT_MISMATCH' | 'SIGNATURE_MISMATCH' | 'KEY_REVOKED' | 'KEY_RETIRED' | 'KEY_EXPIRED' | 'KEY_NOT_YET_VALID' | 'UNSUPPORTED_ALGORITHM';
    canonicalJson: string;
    payloadSha256: string;
    keyFingerprintSha256: string | null;
    message: string;
}
/**
 * Deterministic RFC 8785 (JSON Canonicalization Scheme) serializer.
 * Recursively sorts object keys in UTF-16 code-unit order without extraneous whitespace.
 */
export declare function canonicalizeJsonRfc8785(value: unknown, seen?: WeakSet<object>): string;
export declare function sha256Hex(data: string | Uint8Array): string;
/**
 * Parses an Ed25519 signature string in hex (128 hex chars), base64, or base64url.
 * Strips an optional `ed25519:` prefix if present.
 */
export declare function decodeEd25519Signature(rawSignature: string): Buffer | null;
export declare function loadEd25519PublicKey(options: {
    publicKeySpkiHex?: string;
    publicKeyPem?: string;
    publicKeyBase58?: string;
}): {
    keyObject: crypto.KeyObject;
    spkiDer: Buffer;
};
/**
 * Offline Ed25519 + RFC 8785 cryptographic signature verifier.
 * Zero network calls required once you hold the witness SPKI public key.
 */
export declare function verifyWitnessSignature(input: VerifyWitnessSignatureInput): VerifyWitnessSignatureResult;
/**
 * Fetches the authoritative rotating Ed25519 witness key registry from MoltALPHA.
 */
export declare function fetchWitnessKeyRegistry(options?: {
    gatewayUrl?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}): Promise<WitnessKeyRegistryResponse>;
/**
 * Convenience helper: resolves `keyId` (or active key) from the live MoltALPHA registry
 * and verifies an Ed25519 witness signature offline. Fail-closed on REVOKED/RETIRED/expired keys
 * and unsupported algorithms.
 */
export declare function verifyWithLiveRegistry(options: {
    payload?: unknown;
    canonicalJson?: string;
    signature: string;
    keyId?: string;
    expectedPayloadSha256?: string;
    gatewayUrl?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    allowRetiredKeys?: boolean;
    nowMs?: number;
    signingInput?: 'canonical_json' | 'sha256_hex';
}): Promise<VerifyWitnessSignatureResult & {
    keyId: string;
    keyStatus: string | null;
}>;
//# sourceMappingURL=index.d.ts.map