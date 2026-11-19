"""
Read-only Market Intelligence client example.
Supports the live /api/market-intelligence tokens schema (stripping simulatedDemoFallback)
as well as legacy LIVE_OBSERVATIONS_ONLY payloads.
Fails closed if the upstream market feed returns HTTP 503 or malformed payloads.
"""
import json
import urllib.error
import urllib.request


def get_market_observations(url: str = "https://www.moltalpha.dev/api/market-intelligence") -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "MoltALPHA-Example/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 503:
            raise RuntimeError("Upstream market observations unavailable (HTTP 503)") from exc
        raise

    if not isinstance(data, dict):
        raise ValueError("Unsupported market response")

    # Live production schema: {"ok": True, "timestamp": "...", "tokens": {"SOL": {...}}}
    tokens = data.get("tokens")
    if isinstance(tokens, dict):
        clean_tokens = {}
        for symbol, entry in tokens.items():
            if not isinstance(entry, dict):
                continue
            copy = dict(entry)
            copy.pop("simulatedDemoFallback", None)
            clean_tokens[symbol] = copy
        result = dict(data)
        result["tokens"] = clean_tokens
        return result

    # Legacy observations schema compatibility
    if data.get("mode") == "LIVE_OBSERVATIONS_ONLY" and isinstance(data.get("markets"), list):
        return data

    raise ValueError("Unsupported market response")
