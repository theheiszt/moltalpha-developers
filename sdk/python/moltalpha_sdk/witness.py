"""
MoltALPHA Public Witness SDK (Python 3.10+, stdlib-only).
Implements RFC 8785 JCS canonicalization, pure-Python RFC 8032 Ed25519 verification,
and live key registry retrieval from /v1/witnesses/public-keys.
"""

import base64
from datetime import datetime, timezone
import hashlib
import json
import math
from typing import Any
from urllib.parse import quote

from ._ed25519 import verify_ed25519
from .http_client import DEFAULT_API_GATEWAY_URL, request_json

ED25519_SPKI_PREFIX_HEX = "302a300506032b6570032100"
BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

WITNESS_SCOPE_NOTE = (
    "Cryptographic signature validity confirms origin and integrity only; "
    "it does not guarantee data accuracy or on-chain transaction finality."
)


def decode_base58(value: str) -> bytes:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Base58 input must be a non-empty string")
    s = value.strip()
    num = 0
    for ch in s:
        idx = BASE58_ALPHABET.find(ch)
        if idx == -1:
            raise ValueError(f"Invalid Base58 character: {ch!r}")
        num = num * 58 + idx
    raw = b"" if num == 0 else num.to_bytes((num.bit_length() + 7) // 8, "big")
    leading_zeros = 0
    for ch in s:
        if ch == "1":
            leading_zeros += 1
        else:
            break
    return (b"\x00" * leading_zeros) + raw


def canonicalize_json_rfc8785(value: Any) -> str:
    """
    RFC 8785 JSON Canonicalization Scheme (JCS).
    """
    if value is None or isinstance(value, bool):
        return json.dumps(value)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("RFC 8785 forbids NaN and Infinity in canonical JSON")
        if value == 0.0:
            return "0"
        if value.is_integer() and abs(value) < (1 << 53):
            return str(int(value))
        return json.dumps(value, allow_nan=False)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(canonicalize_json_rfc8785(item) for item in value) + "]"
    if isinstance(value, dict):
        parts = []
        for k in sorted(value.keys()):
            if not isinstance(k, str):
                raise TypeError("JSON object keys must be strings")
            parts.append(f"{json.dumps(k, ensure_ascii=False)}:{canonicalize_json_rfc8785(value[k])}")
        return "{" + ",".join(parts) + "}"
    raise TypeError(f"Unsupported type for RFC 8785 canonicalization: {type(value)!r}")


def _extract_raw_ed25519_pubkey(
    *,
    public_key_spki_hex: str | None = None,
    public_key_pem: str | None = None,
    public_key_base58: str | None = None,
) -> bytes:
    if public_key_spki_hex and isinstance(public_key_spki_hex, str) and public_key_spki_hex.strip():
        clean_hex = public_key_spki_hex.strip().lower()
        raw_bytes = bytes.fromhex(clean_hex)
        if len(raw_bytes) == 32:
            return raw_bytes
        if len(raw_bytes) == 44 and clean_hex.startswith(ED25519_SPKI_PREFIX_HEX):
            return raw_bytes[12:]
        raise ValueError("Invalid Ed25519 SPKI hex: expected 44-byte Ed25519 SPKI DER or 32-byte raw public key")

    if public_key_pem and isinstance(public_key_pem, str) and public_key_pem.strip():
        lines = [
            line.strip()
            for line in public_key_pem.strip().splitlines()
            if line.strip() and not line.strip().startswith("-----")
        ]
        der = base64.b64decode("".join(lines))
        if len(der) == 44 and der[:12].hex() == ED25519_SPKI_PREFIX_HEX:
            return der[12:]
        raise ValueError("Unsupported PEM public key: expected Ed25519 SubjectPublicKeyInfo (RFC 8410)")

    if public_key_base58 and isinstance(public_key_base58, str) and public_key_base58.strip():
        decoded = decode_base58(public_key_base58.strip())
        if len(decoded) == 32:
            return decoded
        if len(decoded) == 44 and decoded[:12].hex() == ED25519_SPKI_PREFIX_HEX:
            return decoded[12:]
        raise ValueError(f"Invalid Base58 Ed25519 public key length ({len(decoded)} bytes)")

    raise ValueError("Provide one of public_key_spki_hex, public_key_pem, or public_key_base58")


def _parse_signature_bytes(signature: str) -> bytes:
    if not isinstance(signature, str) or not signature.strip():
        raise ValueError("Missing or empty signature string")
    s = signature.strip()
    if s.lower().startswith("ed25519:"):
        s = s[8:].strip()
    if not s:
        raise ValueError("Missing or empty signature string")
    if len(s) == 128:
        try:
            return bytes.fromhex(s)
        except ValueError:
            pass
    if "-" in s or "_" in s:
        padded = s + ("=" * ((4 - len(s) % 4) % 4))
        raw = base64.urlsafe_b64decode(padded)
        if len(raw) == 64:
            return raw
    padded = s + ("=" * ((4 - len(s) % 4) % 4))
    raw = base64.b64decode(padded)
    if len(raw) == 64:
        return raw
    raise ValueError("Invalid Ed25519 signature encoding: expected 64-byte hex, base64, or base64url")


def verify_witness_signature(
    payload: dict[str, Any] | None = None,
    signature: str = "",
    *,
    canonical_json: str | None = None,
    public_key_spki_hex: str | None = None,
    public_key_pem: str | None = None,
    public_key_base58: str | None = None,
    expected_payload_sha256: str | None = None,
    expected_key_fingerprint_sha256: str | None = None,
    algorithm: str = "Ed25519",
    key_id: str | None = None,
    signing_input: str = "auto",
) -> dict[str, Any]:
    base_res: dict[str, Any] = {
        "valid": False,
        "key_id": key_id,
        "canonical_json": "",
        "payload_sha256_hex": "",
        "scope_note": WITNESS_SCOPE_NOTE,
        "verification_scope": {
            "confirms_origin_and_integrity": True,
            "guarantees_data_accuracy": False,
            "guarantees_on_chain_finality": False,
        },
    }

    if algorithm and str(algorithm).strip().upper() != "ED25519":
        base_res["reason"] = f"Unsupported algorithm {algorithm!r}: only Ed25519 is accepted"
        return base_res

    try:
        if canonical_json is not None:
            if not isinstance(canonical_json, str) or not canonical_json.strip():
                base_res["reason"] = "canonical_json cannot be empty"
                return base_res
            parsed = json.loads(canonical_json)
            if not isinstance(parsed, dict):
                base_res["reason"] = "Witness payload must be a JSON object"
                return base_res
            canon = canonical_json
        elif isinstance(payload, dict):
            canon = canonicalize_json_rfc8785(payload)
        else:
            base_res["reason"] = "Provide a payload dict or canonical_json string"
            return base_res
    except Exception as exc:
        base_res["reason"] = f"Canonicalization error: {exc}"
        return base_res

    sha256_hex = hashlib.sha256(canon.encode("utf-8")).hexdigest()
    base_res["canonical_json"] = canon
    base_res["payload_sha256_hex"] = sha256_hex

    if expected_payload_sha256 and isinstance(expected_payload_sha256, str) and expected_payload_sha256.strip():
        if expected_payload_sha256.strip().lower() != sha256_hex.lower():
            base_res["reason"] = "Payload SHA-256 digest mismatch against expected_payload_sha256"
            return base_res

    try:
        pub32 = _extract_raw_ed25519_pubkey(
            public_key_spki_hex=public_key_spki_hex,
            public_key_pem=public_key_pem,
            public_key_base58=public_key_base58,
        )
        if (
            expected_key_fingerprint_sha256
            and isinstance(expected_key_fingerprint_sha256, str)
            and expected_key_fingerprint_sha256.strip()
        ):
            expected_fp = expected_key_fingerprint_sha256.strip().lower()
            spki_fp = hashlib.sha256(bytes.fromhex(ED25519_SPKI_PREFIX_HEX) + pub32).hexdigest()
            raw_fp = hashlib.sha256(pub32).hexdigest()
            if expected_fp != spki_fp and expected_fp != raw_fp:
                base_res["reason"] = "Public key fingerprint mismatch against expected_key_fingerprint_sha256"
                return base_res

        sig64 = _parse_signature_bytes(signature)
        if signing_input == "canonical_json":
            valid = verify_ed25519(pub32, canon.encode("utf-8"), sig64)
        elif signing_input == "sha256_hex":
            valid = verify_ed25519(pub32, sha256_hex.encode("utf-8"), sig64)
        else:
            valid = verify_ed25519(pub32, canon.encode("utf-8"), sig64) or verify_ed25519(
                pub32, sha256_hex.encode("utf-8"), sig64
            )
        base_res["valid"] = valid
        if not valid:
            base_res["reason"] = "Ed25519 signature verification failed (mismatch)"
        return base_res
    except Exception as exc:
        base_res["reason"] = str(exc)
        return base_res


verify_witness = verify_witness_signature


def fetch_public_keys(*, base_url: str = DEFAULT_API_GATEWAY_URL, **kwargs: Any) -> dict[str, Any]:
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    data = request_json(f"{root}/v1/witnesses/public-keys", **kwargs)
    if not isinstance(data, dict) or not isinstance(data.get("public_keys"), dict):
        raise ValueError("Malformed witness public key registry response")
    return data


def fetch_witness(witness_id: str, *, base_url: str = DEFAULT_API_GATEWAY_URL, **kwargs: Any) -> dict[str, Any]:
    if not isinstance(witness_id, str) or not witness_id.strip():
        raise ValueError("witness_id must be a non-empty string")
    clean_id = witness_id.strip()
    if "/" in clean_id or ".." in clean_id or "?" in clean_id:
        raise ValueError("Invalid witness_id: path traversal characters forbidden")
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    return request_json(f"{root}/v1/witnesses/{quote(clean_id, safe='')}", **kwargs)


def verify_with_registry(
    payload: dict[str, Any],
    signature: str,
    *,
    key_id: str | None = None,
    base_url: str = DEFAULT_API_GATEWAY_URL,
    allow_retired_keys: bool = False,
    **kwargs: Any,
) -> dict[str, Any]:
    reg = fetch_public_keys(base_url=base_url, **kwargs)
    target_key_id = key_id or reg.get("active_key_id")
    entry = (reg.get("public_keys") or {}).get(target_key_id)
    if not entry:
        return {
            "valid": False,
            "key_id": target_key_id,
            "scope_note": WITNESS_SCOPE_NOTE,
            "reason": f"Key ID {target_key_id!r} not found in registry",
        }
    status = str(entry.get("status") or entry.get("revocation_status") or "ACTIVE").upper()
    is_retired = status == "RETIRED" or bool(entry.get("retired_at") and str(entry.get("retired_at")).strip())
    if status == "REVOKED" or (is_retired and not allow_retired_keys) or (status != "ACTIVE" and not is_retired):
        return {
            "valid": False,
            "key_id": target_key_id,
            "scope_note": WITNESS_SCOPE_NOTE,
            "reason": f"Witness key {target_key_id!r} has status {status}",
        }

    now_dt = datetime.now(timezone.utc)
    valid_from = entry.get("valid_from")
    if valid_from and isinstance(valid_from, str):
        try:
            from_dt = datetime.fromisoformat(valid_from.replace("Z", "+00:00"))
            if now_dt < from_dt:
                return {
                    "valid": False,
                    "key_id": target_key_id,
                    "scope_note": WITNESS_SCOPE_NOTE,
                    "reason": f"Witness key {target_key_id!r} is not yet valid (valid_from: {valid_from})",
                }
        except ValueError:
            return {
                "valid": False,
                "key_id": target_key_id,
                "scope_note": WITNESS_SCOPE_NOTE,
                "reason": f"Witness key {target_key_id!r} has malformed valid_from timestamp",
            }

    expiry_iso = entry.get("valid_until") or entry.get("expires_at")
    if expiry_iso and isinstance(expiry_iso, str):
        try:
            exp_dt = datetime.fromisoformat(expiry_iso.replace("Z", "+00:00"))
            if now_dt >= exp_dt:
                return {
                    "valid": False,
                    "key_id": target_key_id,
                    "scope_note": WITNESS_SCOPE_NOTE,
                    "reason": f"Witness key {target_key_id!r} expired at {expiry_iso}",
                }
        except ValueError:
            return {
                "valid": False,
                "key_id": target_key_id,
                "scope_note": WITNESS_SCOPE_NOTE,
                "reason": f"Witness key {target_key_id!r} has malformed expiration timestamp",
            }

    return verify_witness_signature(
        payload=payload,
        signature=signature,
        key_id=target_key_id,
        public_key_spki_hex=entry.get("public_key_spki_hex"),
        public_key_pem=entry.get("public_key_pem"),
        public_key_base58=entry.get("public_key_base58"),
        expected_key_fingerprint_sha256=entry.get("fingerprint_sha256"),
        algorithm=entry.get("algorithm", "Ed25519"),
    )


class WitnessClient:
    def __init__(self, base_url: str = DEFAULT_API_GATEWAY_URL, **kwargs: Any) -> None:
        self.base_url = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
        self.options = kwargs

    def canonicalize_json_rfc8785(self, value: Any) -> str:
        return canonicalize_json_rfc8785(value)

    def verify_witness_signature(self, **kwargs: Any) -> dict[str, Any]:
        return verify_witness_signature(**kwargs)

    def verify_witness(self, **kwargs: Any) -> dict[str, Any]:
        return verify_witness_signature(**kwargs)

    def fetch_public_keys(self) -> dict[str, Any]:
        return fetch_public_keys(base_url=self.base_url, **self.options)

    def fetch_witness(self, witness_id: str) -> dict[str, Any]:
        return fetch_witness(witness_id, base_url=self.base_url, **self.options)

    def verify_with_registry(self, payload: dict[str, Any], signature: str, key_id: str | None = None) -> dict[str, Any]:
        return verify_with_registry(
            payload=payload,
            signature=signature,
            key_id=key_id,
            base_url=self.base_url,
            **self.options,
        )
