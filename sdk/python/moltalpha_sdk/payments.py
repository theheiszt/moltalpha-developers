"""
MoltALPHA Public Payments & Exact Integer Unit SDK (Python 3.10+, stdlib-only).
Uses Python arbitrary-precision int and decimal.Decimal exclusively for SOL (10^9),
USDC (10^6), and Nano/XNO (10^30) raw units. Never uses binary float arithmetic.
"""

from decimal import Decimal, InvalidOperation
import re
from typing import Any
from urllib.parse import quote

from .http_client import DEFAULT_API_GATEWAY_URL, request_json

CANONICAL_SOLANA_TREASURY = "BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx"
CANONICAL_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
CANONICAL_NANO_TREASURY = "nano_1s5ce5k7bj74sp31m3opq8xwx44stc5dgw6w8uajyg61xjg9wiaae4uby6pu"

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


def get_config(*, base_url: str = DEFAULT_API_GATEWAY_URL, **kwargs: Any) -> dict[str, Any]:
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    return request_json(f"{root}/v1/payments/config", **kwargs)


def create_invoice(
    payload: dict[str, Any], *, base_url: str = DEFAULT_API_GATEWAY_URL, **kwargs: Any
) -> dict[str, Any]:
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    rail = str(payload.get("rail") or "solana").lower()
    body = {
        "target_tier": payload.get("target_tier") or payload.get("tier") or "tier_starter",
        "rail": rail,
        "asset": payload.get("asset") or ("XNO" if rail == "nano" else "USDC"),
    }
    for opt_key in ("cluster", "expected_payer", "target_api_key"):
        if opt_key in payload and payload[opt_key] is not None:
            body[opt_key] = payload[opt_key]
    return request_json(f"{root}/v1/payments/invoice", method="POST", body=body, **kwargs)


def get_invoice(
    invoice_id: str, *, base_url: str = DEFAULT_API_GATEWAY_URL, **kwargs: Any
) -> dict[str, Any]:
    if not isinstance(invoice_id, str) or not invoice_id.strip():
        raise ValueError("invoice_id must be a non-empty string")
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    return request_json(f"{root}/v1/payments/invoice/{quote(invoice_id.strip(), safe='')}", **kwargs)


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
    body["block_hash"] = block_hash.strip()
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    return request_json(f"{root}/v1/payments/verify-nano", method="POST", body=body, **kwargs)


def reconcile_payment(
    payload: dict[str, Any], *, base_url: str = DEFAULT_API_GATEWAY_URL, **kwargs: Any
) -> dict[str, Any]:
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    return request_json(f"{root}/v1/payments/reconcile", method="POST", body=payload, **kwargs)


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

    def get_config(self) -> dict[str, Any]:
        return get_config(base_url=self.base_url, **self.options)

    def create_invoice(self, payload: dict[str, Any]) -> dict[str, Any]:
        return create_invoice(payload, base_url=self.base_url, **self.options)

    def get_invoice(self, invoice_id: str) -> dict[str, Any]:
        return get_invoice(invoice_id, base_url=self.base_url, **self.options)

    def verify_solana(self, payload: dict[str, Any]) -> dict[str, Any]:
        return verify_solana(payload, base_url=self.base_url, **self.options)

    def verify_nano(self, payload: dict[str, Any]) -> dict[str, Any]:
        return verify_nano(payload, base_url=self.base_url, **self.options)

    def reconcile_payment(self, payload: dict[str, Any]) -> dict[str, Any]:
        return reconcile_payment(payload, base_url=self.base_url, **self.options)
