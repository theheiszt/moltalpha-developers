"""
MoltALPHA Public Payments & Exact Integer Unit SDK (Python 3.10+, stdlib-only).
Uses Python arbitrary-precision int and decimal.Decimal exclusively for SOL (10^9),
USDC (10^6), and Nano/XNO (10^30) raw units. Never uses binary float arithmetic.
"""

from decimal import Decimal
import hashlib
import hmac
import json
import re
import time
from typing import Any
from urllib.parse import quote, urlencode

from .http_client import DEFAULT_API_GATEWAY_URL, request_json

CANONICAL_SOLANA_TREASURY = "BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx"
CANONICAL_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
CANONICAL_NANO_TREASURY = "nano_1s5ce5k7bj74sp31m3opq8xwx44stc5dgw6w8uajyg61xjg9wiaae4uby6pu"

_BASE58_REGEX = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")
_BASE58_SIG_REGEX = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{64,90}$")
_NANO_ADDR_REGEX = re.compile(r"^nano_[13][13-9a-km-uw-z]{59}$")

ASSET_DECIMALS: dict[str, int] = {
    "SOL": 9,
    "LAMPORTS": 9,
    "USDC": 6,
    "XNO": 30,
    "NANO": 30,
}


def _resolve_decimals(asset_or_decimals: str | int) -> int:
    if isinstance(asset_or_decimals, int) and not isinstance(asset_or_decimals, bool) and asset_or_decimals >= 0:
        return asset_or_decimals
    key = str(asset_or_decimals or "").strip().upper()
    if key in ASSET_DECIMALS:
        return ASSET_DECIMALS[key]
    raise ValueError(f"Unsupported payment asset {asset_or_decimals!r}: expected SOL, USDC, or XNO")


def decimal_to_raw_units(amount_input: str | int | Decimal, asset_or_decimals: str | int = "SOL") -> int:
    """
    Converts a human-readable decimal string or Decimal into exact arbitrary-precision int
    raw units without floating-point conversion.
    """
    decimals = _resolve_decimals(asset_or_decimals)
    if isinstance(amount_input, float) or isinstance(amount_input, bool):
        raise ValueError("Never pass binary float to decimal_to_raw_units; pass a decimal string or Decimal")
    if isinstance(amount_input, int):
        if amount_input < 0:
            raise ValueError("Invalid negative payment amount")
        text = str(amount_input)
    elif isinstance(amount_input, Decimal):
        if not amount_input.is_finite() or amount_input < 0:
            raise ValueError(f"Invalid Decimal payment amount: {amount_input!r}")
        text = format(amount_input, "f")
    elif isinstance(amount_input, str):
        text = amount_input.strip()
    else:
        raise ValueError(f"Invalid amount type: {type(amount_input)!r}")

    if not re.match(r"^\d+(?:\.\d+)?$", text):
        raise ValueError(f"Invalid decimal payment amount {amount_input!r}")

    parts = text.split(".")
    whole = parts[0]
    frac = parts[1] if len(parts) > 1 else ""
    if len(frac) > decimals:
        raise ValueError(
            f"Excess decimal precision in {amount_input!r}: maximum {decimals} decimals allowed for {asset_or_decimals}"
        )
    padded_frac = frac.ljust(decimals, "0")
    return int(f"{whole}{padded_frac}")


to_raw_units = decimal_to_raw_units


def raw_units_to_decimal(raw_input: int | str, asset_or_decimals: str | int = "SOL") -> str:
    """
    Formats exact raw integer units back to a human-readable decimal string without float loss.
    """
    decimals = _resolve_decimals(asset_or_decimals)
    if isinstance(raw_input, bool) or isinstance(raw_input, float):
        raise ValueError("raw_input must be an int or integer digit string")
    if isinstance(raw_input, int):
        raw_int = raw_input
    elif isinstance(raw_input, str) and re.match(r"^\d+$", raw_input.strip()):
        raw_int = int(raw_input.strip())
    else:
        raise ValueError(f"Invalid raw unit value: {raw_input!r}")

    if raw_int < 0:
        raise ValueError("Invalid negative raw unit value")
    if decimals == 0:
        return str(raw_int)

    digits = str(raw_int).rjust(decimals + 1, "0")
    whole = digits[:-decimals]
    frac = digits[-decimals:].rstrip("0")
    return f"{whole}.{frac}" if frac else whole


from_raw_units = raw_units_to_decimal


def validate_merchant_wallet(address: str, rail: str = "solana") -> dict[str, Any]:
    """
    Validates a merchant or payer wallet address for Solana or Nano.
    Explicitly rejects the SPL USDC Mint contract address to prevent accidental token loss.
    """
    if not isinstance(address, str) or not address.strip():
        return {
            "valid": False,
            "rail": str(rail or "solana").lower(),
            "address": str(address or ""),
            "code": "EMPTY_WALLET_ADDRESS",
            "reason": "Wallet address must be a non-empty string.",
        }
    trimmed = address.strip()
    norm_rail = str(rail or "solana").strip().lower()

    if norm_rail in ("nano", "xno"):
        if not _NANO_ADDR_REGEX.match(trimmed):
            return {
                "valid": False,
                "rail": "nano",
                "address": trimmed,
                "code": "INVALID_NANO_ADDRESS",
                "reason": "Nano wallet address must start with 'nano_1' or 'nano_3' followed by 59 Nano Base32 characters.",
            }
        return {"valid": True, "rail": "nano", "address": trimmed, "code": "OK", "reason": None}

    if norm_rail != "solana":
        return {
            "valid": False,
            "rail": norm_rail,
            "address": trimmed,
            "code": "UNSUPPORTED_RAIL",
            "reason": f"Unsupported payment rail {norm_rail!r}: expected 'solana' or 'nano'.",
        }

    if trimmed == CANONICAL_USDC_MINT:
        return {
            "valid": False,
            "rail": "solana",
            "address": trimmed,
            "code": "MINT_ADDRESS_NOT_WALLET",
            "reason": f"Address {CANONICAL_USDC_MINT} is the SPL USDC Mint contract, not a merchant receiving wallet.",
        }

    if not _BASE58_REGEX.match(trimmed):
        return {
            "valid": False,
            "rail": "solana",
            "address": trimmed,
            "code": "INVALID_SOLANA_BASE58",
            "reason": "Solana wallet address must be a valid Base58 public key between 32 and 44 characters.",
        }

    return {"valid": True, "rail": "solana", "address": trimmed, "code": "OK", "reason": None}


def build_solana_pay_url(
    *,
    recipient: str = CANONICAL_SOLANA_TREASURY,
    amount: str | int | Decimal | None = None,
    asset: str = "USDC",
    reference: str | None = None,
    label: str | None = "MoltAlpha",
    message: str | None = None,
    memo: str | None = None,
    spl_token: str | None = None,
) -> str:
    """
    Constructs a standards-compliant Solana Pay transfer request URI (`solana:<recipient>?...`)
    using exact Decimal/integer conversion.
    """
    rec = str(recipient or CANONICAL_SOLANA_TREASURY).strip()
    check = validate_merchant_wallet(rec, "solana")
    if not check["valid"]:
        raise ValueError(f"Invalid Solana Pay recipient: {check['reason']}")

    norm_asset = str(asset or "USDC").strip().upper()
    if norm_asset not in ("USDC", "SOL"):
        raise ValueError(f"Solana Pay URI supports 'USDC' or 'SOL', got {norm_asset!r}")

    query_params: list[tuple[str, str]] = []
    if amount is not None and str(amount).strip() != "":
        raw_units = decimal_to_raw_units(amount, norm_asset)
        if raw_units <= 0:
            raise ValueError("Solana Pay amount must be greater than zero")
        query_params.append(("amount", raw_units_to_decimal(raw_units, norm_asset)))

    if norm_asset == "USDC":
        query_params.append(("spl-token", str(spl_token or CANONICAL_USDC_MINT).strip()))

    if reference:
        ref = str(reference).strip()
        if not _BASE58_REGEX.match(ref):
            raise ValueError(f"Invalid Solana Pay reference key {ref!r}: must be a valid Base58 public key")
        query_params.append(("reference", ref))

    if label:
        query_params.append(("label", str(label).strip()))
    if message:
        query_params.append(("message", str(message).strip()))
    if memo:
        query_params.append(("memo", str(memo).strip()))

    qs = urlencode(query_params)
    return f"solana:{rec}?{qs}" if qs else f"solana:{rec}"


def sign_webhook_payload(
    payload: str | bytes | dict[str, Any],
    secret: str,
    timestamp_seconds: int | None = None,
) -> str:
    """
    Signs a webhook payload with HMAC-SHA256 in the format `t=<unix_seconds>,v1=<hex_digest>`.
    """
    if not isinstance(secret, str) or len(secret.strip()) < 8:
        raise ValueError("Webhook secret must be a string of at least 8 characters")
    ts = int(time.time()) if timestamp_seconds is None else int(timestamp_seconds)
    if ts <= 0:
        raise ValueError("timestamp_seconds must be a positive unix timestamp integer")

    if isinstance(payload, bytes):
        raw_body = payload.decode("utf-8")
    elif isinstance(payload, str):
        raw_body = payload
    else:
        raw_body = json.dumps(payload, separators=(",", ":"), sort_keys=True)

    digest = hmac.new(
        secret.encode("utf-8"),
        f"{ts}.{raw_body}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"t={ts},v1={digest}"


def verify_webhook_signature(
    payload: str | bytes | dict[str, Any],
    signature_header: str,
    secret: str,
    *,
    tolerance_seconds: int = 300,
    now_seconds: int | None = None,
) -> dict[str, Any]:
    """
    Verifies an HMAC-SHA256 webhook signature header (`X-MoltAlpha-Signature: t=<ts>,v1=<hex>`)
    with constant-time digest comparison and timestamp replay window enforcement.
    """
    if not isinstance(secret, str) or not secret.strip():
        return {
            "valid": False,
            "code": "WEBHOOK_SECRET_MISSING",
            "reason": "Webhook signing secret is required for verification.",
            "timestamp": None,
        }
    if not isinstance(signature_header, str) or not signature_header.strip():
        return {
            "valid": False,
            "code": "WEBHOOK_SIGNATURE_MISSING",
            "reason": "Missing webhook signature header.",
            "timestamp": None,
        }

    timestamp_str: str | None = None
    v1_signatures: list[str] = []
    for part in signature_header.split(","):
        part = part.strip()
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        k, v = k.strip(), v.strip()
        if k == "t":
            timestamp_str = v
        elif k == "v1" and re.match(r"^[0-9a-fA-F]{64}$", v):
            v1_signatures.append(v.lower())

    if not timestamp_str or not timestamp_str.isdigit() or not v1_signatures:
        return {
            "valid": False,
            "code": "WEBHOOK_SIGNATURE_MALFORMED",
            "reason": "Signature header must contain 't=<unix_timestamp>,v1=<64_char_hex_hmac>'.",
            "timestamp": None,
        }

    ts = int(timestamp_str)
    now = int(time.time()) if now_seconds is None else int(now_seconds)
    if abs(now - ts) > max(0, int(tolerance_seconds)):
        return {
            "valid": False,
            "code": "WEBHOOK_TIMESTAMP_EXPIRED",
            "reason": f"Webhook timestamp {ts} is outside the allowed {tolerance_seconds}s replay window (now={now}).",
            "timestamp": ts,
        }

    if isinstance(payload, bytes):
        raw_body = payload.decode("utf-8")
    elif isinstance(payload, str):
        raw_body = payload
    else:
        raw_body = json.dumps(payload, separators=(",", ":"), sort_keys=True)

    expected_hex = hmac.new(
        secret.encode("utf-8"),
        f"{ts}.{raw_body}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    matched = any(hmac.compare_digest(candidate, expected_hex) for candidate in v1_signatures)
    if not matched:
        return {
            "valid": False,
            "code": "WEBHOOK_SIGNATURE_MISMATCH",
            "reason": "HMAC-SHA256 signature digest does not match payload.",
            "timestamp": ts,
        }

    return {
        "valid": True,
        "code": "OK",
        "reason": None,
        "timestamp": ts,
    }


def get_config(*, base_url: str = DEFAULT_API_GATEWAY_URL, **kwargs: Any) -> dict[str, Any]:
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    return request_json(f"{root}/v1/payments/config", **kwargs)


def create_invoice(
    payload: dict[str, Any], *, base_url: str = DEFAULT_API_GATEWAY_URL, **kwargs: Any
) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("create_invoice requires a dictionary payload")
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    rail = str(payload.get("rail") or payload.get("network") or "solana").strip().lower()
    if rail not in ("solana", "nano"):
        raise ValueError(f"Unsupported payment rail/network {rail!r}: expected 'solana' or 'nano'")

    asset = str(
        payload.get("asset") or payload.get("currency") or ("XNO" if rail == "nano" else "USDC")
    ).strip().upper()
    if asset not in ("USDC", "SOL", "XNO", "NANO"):
        raise ValueError(f"Unsupported payment asset/currency {asset!r}: expected 'USDC', 'SOL', or 'XNO'")
    if rail == "solana" and asset in ("XNO", "NANO"):
        raise ValueError("Asset 'XNO' requires rail/network='nano'")

    if payload.get("amount") is not None:
        raw_units = decimal_to_raw_units(payload["amount"], asset)
        if raw_units <= 0:
            raise ValueError("Payment amount must be greater than zero")

    expected_payer = payload.get("expected_payer") or payload.get("expectedPayer")
    if expected_payer is not None and str(expected_payer).strip() != "":
        check = validate_merchant_wallet(str(expected_payer).strip(), rail)
        if not check["valid"]:
            raise ValueError(f"Invalid expected_payer address: {check['reason']}")

    body: dict[str, Any] = {
        "target_tier": payload.get("target_tier") or payload.get("tier") or "tier_starter",
        "rail": rail,
        "asset": "XNO" if asset == "NANO" else asset,
    }
    if payload.get("cluster") is not None:
        body["cluster"] = str(payload["cluster"]).strip().lower()
    if expected_payer is not None and str(expected_payer).strip() != "":
        body["expected_payer"] = str(expected_payer).strip()
    target_api_key = payload.get("target_api_key") or payload.get("targetApiKey")
    if target_api_key is not None and str(target_api_key).strip() != "":
        body["target_api_key"] = str(target_api_key).strip()

    headers = dict(kwargs.pop("headers", None) or {})
    idempotency_key = payload.get("idempotency_key") or payload.get("idempotencyKey")
    if idempotency_key:
        headers["X-Idempotency-Key"] = str(idempotency_key).strip()

    return request_json(
        f"{root}/v1/payments/invoice",
        method="POST",
        body=body,
        headers=headers,
        **kwargs,
    )


def get_invoice(
    invoice_id: str, *, base_url: str = DEFAULT_API_GATEWAY_URL, **kwargs: Any
) -> dict[str, Any]:
    if not isinstance(invoice_id, str) or not invoice_id.strip():
        raise ValueError("invoice_id must be a non-empty string")
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    return request_json(f"{root}/v1/payments/invoice/{quote(invoice_id.strip(), safe='')}", **kwargs)


def get_transaction_status(
    signature: str, *, base_url: str = DEFAULT_API_GATEWAY_URL, **kwargs: Any
) -> dict[str, Any]:
    if not isinstance(signature, str) or not _BASE58_SIG_REGEX.match(signature.strip()):
        raise ValueError("signature must be a valid Base58 Solana transaction signature (64-90 characters)")
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    return request_json(f"{root}/v1/payments/status/{quote(signature.strip(), safe='')}", **kwargs)


def claim_credential(
    invoice_id: str,
    claim_secret: str,
    *,
    base_url: str = DEFAULT_API_GATEWAY_URL,
    **kwargs: Any,
) -> dict[str, Any]:
    if not isinstance(invoice_id, str) or not invoice_id.strip():
        raise ValueError("invoice_id must be a non-empty string")
    if not isinstance(claim_secret, str) or not claim_secret.strip().startswith("sec_") or len(claim_secret.strip()) < 20:
        raise ValueError("claim_secret must be a valid secret starting with 'sec_'")
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    return request_json(
        f"{root}/v1/payments/invoice/{quote(invoice_id.strip(), safe='')}/claim",
        method="POST",
        body={"claim_secret": claim_secret.strip()},
        **kwargs,
    )


def verify_solana(
    payload: dict[str, Any], *, base_url: str = DEFAULT_API_GATEWAY_URL, **kwargs: Any
) -> dict[str, Any]:
    sig = payload.get("transaction_signature") or payload.get("tx_signature") or payload.get("signature")
    if not isinstance(sig, str) or not sig.strip():
        raise ValueError("transaction_signature is required")
    body = dict(payload)
    body["transaction_signature"] = sig.strip()
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    return request_json(f"{root}/v1/payments/verify-solana", method="POST", body=body, **kwargs)


def verify_nano(
    payload: dict[str, Any], *, base_url: str = DEFAULT_API_GATEWAY_URL, **kwargs: Any
) -> dict[str, Any]:
    block_hash = payload.get("block_hash") or payload.get("tx_hash") or payload.get("hash")
    if not isinstance(block_hash, str) or not block_hash.strip():
        raise ValueError("block_hash is required")
    body = dict(payload)
    body["block_hash"] = block_hash.strip().lower()
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    return request_json(f"{root}/v1/payments/verify-nano", method="POST", body=body, **kwargs)


def reconcile_payment(
    payload: dict[str, Any], *, base_url: str = DEFAULT_API_GATEWAY_URL, **kwargs: Any
) -> dict[str, Any]:
    sig = payload.get("transaction_signature") or payload.get("tx_signature") or payload.get("signature")
    if not isinstance(sig, str) or not sig.strip():
        raise ValueError("transaction_signature is required for reconciliation")
    body = dict(payload)
    body["transaction_signature"] = sig.strip()
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    return request_json(f"{root}/v1/payments/reconcile", method="POST", body=body, **kwargs)


class PaymentsClient:
    def __init__(self, base_url: str = DEFAULT_API_GATEWAY_URL, **kwargs: Any) -> None:
        self.base_url = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
        self.options = kwargs

    @staticmethod
    def decimal_to_raw_units(amount_input: str | int | Decimal, asset: str | int = "SOL") -> int:
        return decimal_to_raw_units(amount_input, asset)

    @staticmethod
    def raw_units_to_decimal(raw_input: int | str, asset: str | int = "SOL") -> str:
        return raw_units_to_decimal(raw_input, asset)

    @staticmethod
    def validate_merchant_wallet(address: str, rail: str = "solana") -> dict[str, Any]:
        return validate_merchant_wallet(address, rail)

    @staticmethod
    def build_solana_pay_url(**kwargs: Any) -> str:
        return build_solana_pay_url(**kwargs)

    @staticmethod
    def sign_webhook_payload(
        payload: str | bytes | dict[str, Any],
        secret: str,
        timestamp_seconds: int | None = None,
    ) -> str:
        return sign_webhook_payload(payload, secret, timestamp_seconds)

    @staticmethod
    def verify_webhook_signature(
        payload: str | bytes | dict[str, Any],
        signature_header: str,
        secret: str,
        *,
        tolerance_seconds: int = 300,
        now_seconds: int | None = None,
    ) -> dict[str, Any]:
        return verify_webhook_signature(
            payload,
            signature_header,
            secret,
            tolerance_seconds=tolerance_seconds,
            now_seconds=now_seconds,
        )

    def get_config(self) -> dict[str, Any]:
        return get_config(base_url=self.base_url, **self.options)

    def create(self, payload: dict[str, Any] | None = None, **kwargs: Any) -> dict[str, Any]:
        merged = dict(payload or {})
        merged.update(kwargs)
        return create_invoice(merged, base_url=self.base_url, **self.options)

    def create_invoice(self, payload: dict[str, Any]) -> dict[str, Any]:
        return create_invoice(payload, base_url=self.base_url, **self.options)

    def get_status(self, invoice_id: str) -> dict[str, Any]:
        return get_invoice(invoice_id, base_url=self.base_url, **self.options)

    def get_invoice(self, invoice_id: str) -> dict[str, Any]:
        return get_invoice(invoice_id, base_url=self.base_url, **self.options)

    def get_transaction_status(self, signature: str) -> dict[str, Any]:
        return get_transaction_status(signature, base_url=self.base_url, **self.options)

    def claim_credential(self, invoice_id: str, claim_secret: str) -> dict[str, Any]:
        return claim_credential(invoice_id, claim_secret, base_url=self.base_url, **self.options)

    def verify_solana(self, payload: dict[str, Any]) -> dict[str, Any]:
        return verify_solana(payload, base_url=self.base_url, **self.options)

    def verify_nano(self, payload: dict[str, Any]) -> dict[str, Any]:
        return verify_nano(payload, base_url=self.base_url, **self.options)

    def reconcile_payment(self, payload: dict[str, Any]) -> dict[str, Any]:
        return reconcile_payment(payload, base_url=self.base_url, **self.options)
