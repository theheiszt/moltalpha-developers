"""
MoltALPHA Public Sentinel API Client (Python 3.10+, stdlib-only).
Read-only client for Sentinel risk & telemetry endpoints on https://api.moltalpha.dev.
"""

from typing import Any
from urllib.parse import quote

from .http_client import DEFAULT_API_GATEWAY_URL, request_json


def _validate_identifier(value: str, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Invalid or missing {name}: non-empty string required")
    s = value.strip()
    if "/" in s or ".." in s or "?" in s:
        raise ValueError(f"Invalid {name}: path traversal characters forbidden")
    return s


def get_public_key(*, base_url: str = DEFAULT_API_GATEWAY_URL, **kwargs: Any) -> dict[str, Any]:
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    data = request_json(f"{root}/v1/sentinel/public-key", **kwargs)
    if not isinstance(data, dict) or not data.get("key_id"):
        raise ValueError("Malformed /v1/sentinel/public-key response")
    return data


def get_feed(*, base_url: str = DEFAULT_API_GATEWAY_URL, api_key: str | None = None, **kwargs: Any) -> dict[str, Any]:
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    return request_json(f"{root}/v1/sentinel/feed", api_key=api_key, **kwargs)


def get_live_anomalies(
    *, base_url: str = DEFAULT_API_GATEWAY_URL, api_key: str | None = None, **kwargs: Any
) -> dict[str, Any]:
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    return request_json(f"{root}/v1/sentinel/anomalies/live", api_key=api_key, **kwargs)


def get_pool_risk(
    pool_address: str, *, base_url: str = DEFAULT_API_GATEWAY_URL, api_key: str | None = None, **kwargs: Any
) -> dict[str, Any]:
    addr = _validate_identifier(pool_address, "pool_address")
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    return request_json(f"{root}/v1/sentinel/pools/{quote(addr, safe='')}/risk", api_key=api_key, **kwargs)


def get_pool_observations(
    pool_address: str, *, base_url: str = DEFAULT_API_GATEWAY_URL, api_key: str | None = None, **kwargs: Any
) -> dict[str, Any]:
    addr = _validate_identifier(pool_address, "pool_address")
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    return request_json(f"{root}/v1/sentinel/pools/{quote(addr, safe='')}/observations", api_key=api_key, **kwargs)


def get_pool_history(
    pool_address: str, *, base_url: str = DEFAULT_API_GATEWAY_URL, api_key: str | None = None, **kwargs: Any
) -> dict[str, Any]:
    addr = _validate_identifier(pool_address, "pool_address")
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    return request_json(f"{root}/v1/sentinel/pools/{quote(addr, safe='')}/history", api_key=api_key, **kwargs)


def get_agent_profile(
    agent_handle: str, *, base_url: str = DEFAULT_API_GATEWAY_URL, api_key: str | None = None, **kwargs: Any
) -> dict[str, Any]:
    handle = _validate_identifier(agent_handle, "agent_handle")
    root = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
    return request_json(f"{root}/v1/sentinel/agent/{quote(handle, safe='')}", api_key=api_key, **kwargs)


class SentinelClient:
    def __init__(
        self,
        base_url: str = DEFAULT_API_GATEWAY_URL,
        *,
        api_key: str | None = None,
        **kwargs: Any,
    ) -> None:
        self.base_url = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
        self.api_key = api_key
        self.options = kwargs

    def get_public_key(self) -> dict[str, Any]:
        return get_public_key(base_url=self.base_url, api_key=self.api_key, **self.options)

    def get_feed(self) -> dict[str, Any]:
        return get_feed(base_url=self.base_url, api_key=self.api_key, **self.options)

    def get_live_anomalies(self) -> dict[str, Any]:
        return get_live_anomalies(base_url=self.base_url, api_key=self.api_key, **self.options)

    def get_pool_risk(self, pool_address: str) -> dict[str, Any]:
        return get_pool_risk(pool_address, base_url=self.base_url, api_key=self.api_key, **self.options)

    def get_pool_observations(self, pool_address: str) -> dict[str, Any]:
        return get_pool_observations(pool_address, base_url=self.base_url, api_key=self.api_key, **self.options)

    def get_pool_history(self, pool_address: str) -> dict[str, Any]:
        return get_pool_history(pool_address, base_url=self.base_url, api_key=self.api_key, **self.options)

    def get_agent_profile(self, agent_handle: str) -> dict[str, Any]:
        return get_agent_profile(agent_handle, base_url=self.base_url, api_key=self.api_key, **self.options)
