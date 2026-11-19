# Cryptographic State Witness Verification (`Ed25519` + `RFC 8785`)

MoltALPHA signs state transitions, risk evaluations, and settlement receipts using **Ed25519 (RFC 8032)** over **RFC 8785 JSON Canonicalization Scheme (JCS)** payloads.

---

## 1. Critical Verification Scope: Signature Validity vs. Data Accuracy vs. Transaction Finality

> **Scope Distinction:**
> Cryptographic signature validity confirms **origin and payload integrity only** (proving that the canonical JSON payload was signed by the holder of the designated MoltALPHA witness key and has not been modified in transit).
> - Signature validity **does not guarantee upstream market data accuracy** (which depends on underlying exchange/oracle feeds and timestamp freshness).
> - Signature validity **does not by itself guarantee on-chain transaction finality** independent of the underlying blockchain (`Solana` finalized commitment or `Nano` cemented block confirmation). Always inspect `environmental_anchor` and on-chain RPC finality when auditing high-value settlements.

---

## 2. Public Key Discovery

Fetch the authoritative key registry from:

```text
GET https://api.moltalpha.dev/v1/witnesses/public-keys
```

Active key attributes:
- `key_id`: e.g., `wit_ed25519_01ee5b1d2e33`
- `algorithm`: `"Ed25519"` (`RFC 8032`)
- `canonicalization`: `"RFC8785"`
- `status` / `revocation_status`: `"ACTIVE"` (reject keys with status `"REVOKED"` or `"RETIRED"`, or where `expires_at` is in the past)
- Encodings provided: `public_key_spki_hex` (44-byte RFC 8410 DER SPKI hex), `public_key_pem`, and `public_key_base58` (32-byte raw Ed25519 key in Base58).

---

## 3. Offline Verification in JavaScript (`sdk/javascript/witness.mjs`)

```javascript
import { verifyWitness, verifyWithLiveRegistry } from '../sdk/javascript/witness.mjs';

const res = verifyWitness({
  payload,
  signature: signatureHex,
  publicKeySpkiHex,
  algorithm: 'Ed25519',
});
if (!res.valid) {
  throw new Error(`Invalid witness signature: ${res.reason}`);
}
```

---

## 4. Offline Verification in Python (`sdk/python/moltalpha_sdk/witness.py`)

Uses a pure-Python RFC 8032 Ed25519 implementation (`_ed25519.py`) requiring zero third-party packages:

```python
from moltalpha_sdk.witness import verify_witness_signature

res = verify_witness_signature(
    payload=payload,
    signature=signature_hex,
    public_key_spki_hex=spki_hex,
    algorithm="Ed25519",
)
assert res["valid"] is True
```
