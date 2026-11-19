"""
MoltALPHA Public Market Data SDK (Python 3.10+, stdlib-only).
Read-only client for /api/market-intelligence, /api/market-candles, and /api/v1/forecasts.
Automatically strips simulatedDemoFallback and preserves null priceUsd values without fabrication.
"""

from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

from .http_client import DEFAULT_WWW_BASE_URL, request_json


def sanitize_market_intelligence(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Malformed market intelligence response: expected JSON object")
    tokens = payload.get("tokens")
    if not isinstance(tokens, dict):
        raise ValueError("Invalid market intelligence schema: missing required 'tokens' object")

    clean_tokens: dict[str, Any] = {}
    for symbol, entry in tokens.items():
        if not isinstance(entry, dict):
            continue
        copy = dict(entry)
        copy.pop("simulatedDemoFallback", None)
        if "priceUsd" not in copy:
            copy["priceUsd"] = None
        clean_tokens[symbol] = copy

    retrieved_iso = datetime.now(timezone.utc).isoformat()
    result = dict(payload)
    result["tokens"] = clean_tokens
    result["marketTimestamp"] = payload.get("timestamp") or payload.get("marketTimestamp")
    result["retrievedAtIso"] = retrieved_iso
    return result


def get_market_intelligence(*, base_url: str = DEFAULT_WWW_BASE_URL, **kwargs: Any) -> dict[str, Any]:
    root = str(base_url or DEFAULT_WWW_BASE_URL).rstrip("/")
    data = request_json(f"{root}/api/market-intelligence", **kwargs)
    return sanitize_market_intelligence(data)


def get_market_candles(
    *,
    pair: str = "SOL-USD",
    granularity: int = 3600,
    base_url: str = DEFAULT_WWW_BASE_URL,
    **kwargs: Any,
) -> dict[str, Any]:
    root = str(base_url or DEFAULT_WWW_BASE_URL).rstrip("/")
    qs = urlencode({"pair": pair.strip(), "granularity": int(granularity)})
    data = request_json(f"{root}/api/market-candles?{qs}", **kwargs)
    if not isinstance(data, dict) or not isinstance(data.get("candles"), list):
        raise ValueError("Invalid market candles schema: missing 'candles' list")
    result = dict(data)
    result["retrievedAtIso"] = datetime.now(timezone.utc).isoformat()
    return result


def get_forecasts(*, base_url: str = DEFAULT_WWW_BASE_URL, **kwargs: Any) -> dict[str, Any]:
    root = str(base_url or DEFAULT_WWW_BASE_URL).rstrip("/")
    data = request_json(f"{root}/api/v1/forecasts", **kwargs)
    if not isinstance(data, dict):
        raise ValueError("Invalid forecasts response: expected JSON object")
    result = dict(data)
    result["retrievedAtIso"] = datetime.now(timezone.utc).isoformat()
    return result


class MarketClient:
    def __init__(self, base_url: str = DEFAULT_WWW_BASE_URL, **kwargs: Any) -> None:
        self.base_url = str(base_url or DEFAULT_WWW_BASE_URL).rstrip("/")
        self.options = kwargs

    def get_market_intelligence(self) -> dict[str, Any]:
        return get_market_intelligence(base_url=self.base_url, **self.options)

    def get_market_candles(self, pair: str = "SOL-USD", granularity: int = 3600) -> dict[str, Any]:
        return get_market_candles(pair=pair, granularity=granularity, base_url=self.base_url, **self.options)

    def get_forecasts(self) -> dict[str, Any]:
        return get_forecasts(base_url=self.base_url, **self.options)
