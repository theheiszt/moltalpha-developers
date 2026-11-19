"""
MoltALPHA Public Python SDK — Shared HTTP Transport (stdlib urllib.request only).
"""

import json
import time
from typing import Any
from urllib.error import HTTPError, URLError
import urllib.request

DEFAULT_WWW_BASE_URL = "https://www.moltalpha.dev"
DEFAULT_API_GATEWAY_URL = "https://api.moltalpha.dev"
DEFAULT_TIMEOUT_SECONDS = 10.0
MAX_RETRIES = 3


class MoltAlphaHttpError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status: int = 0,
        code: str = "HTTP_ERROR",
        details: Any = None,
        url: str = "",
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.details = details
        self.url = url


class _HeaderKey(str):
    def capitalize(self) -> "_HeaderKey":
        return self

    def title(self) -> "_HeaderKey":
        return self

    def lower(self) -> str:
        return str.lower(self)


def request_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: Any = None,
    api_key: str | None = None,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    retries: int = 1,
    retry_delay: float = 0.05,
) -> Any:
    bounded_retries = max(0, min(int(retries), MAX_RETRIES))
    effective_timeout = float(timeout) if timeout and timeout > 0 else DEFAULT_TIMEOUT_SECONDS

    req_headers: dict[str, str] = {
        "Accept": "application/json",
        "User-Agent": "MoltALPHA-Python-SDK/0.1.0",
    }
    if headers:
        req_headers.update(headers)
    if api_key:
        req_headers["X-API-KEY"] = str(api_key).strip()

    data_bytes: bytes | None = None
    if body is not None:
        if "Content-Type" not in req_headers:
            req_headers["Content-Type"] = "application/json"
        if isinstance(body, (bytes, bytearray)):
            data_bytes = bytes(body)
        elif isinstance(body, str):
            data_bytes = body.encode("utf-8")
        else:
            data_bytes = json.dumps(body).encode("utf-8")

    wire_headers = {_HeaderKey(k): v for k, v in req_headers.items()}
    last_err: Exception | None = None
    for attempt in range(bounded_retries + 1):
        req = urllib.request.Request(url, data=data_bytes, headers=wire_headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=effective_timeout) as resp:
                status_code = getattr(resp, "status", 200) or 200
                content_type = (resp.headers.get("Content-Type") or "").lower() if hasattr(resp, "headers") else ""
                raw_text = resp.read().decode("utf-8", errors="replace")
        except HTTPError as exc:
            status_code = exc.code
            try:
                err_body = exc.read().decode("utf-8", errors="replace")
            except Exception:
                err_body = ""
            parsed_err = None
            if err_body.strip().startswith("{"):
                try:
                    parsed_err = json.loads(err_body)
                except Exception:
                    parsed_err = None
            err_code = (
                (parsed_err.get("code") if isinstance(parsed_err, dict) else None)
                or ((parsed_err.get("error") or {}).get("code") if isinstance(parsed_err, dict) else None)
                or (
                    "AUTHENTICATION_REQUIRED"
                    if status_code == 401
                    else "PAYMENT_REQUIRED"
                    if status_code == 402
                    else "PAYMENT_REPLAY_DETECTED"
                    if status_code == 409
                    else "RATE_LIMIT_EXCEEDED"
                    if status_code == 429
                    else f"HTTP_{status_code}"
                )
            )
            err_msg = (
                (parsed_err.get("message") if isinstance(parsed_err, dict) else None)
                or ((parsed_err.get("error") or {}).get("message") if isinstance(parsed_err, dict) else None)
                or (parsed_err.get("detail") if isinstance(parsed_err, dict) else None)
                or f"HTTP {status_code} error from {url}"
            )
            http_err = MoltAlphaHttpError(
                f"HTTP {status_code} ({err_code}): {err_msg}",
                status=status_code,
                code=str(err_code),
                details=parsed_err,
                url=url,
            )
            if status_code in (502, 503, 504) and attempt < bounded_retries:
                last_err = http_err
                time.sleep(retry_delay * (attempt + 1))
                continue
            raise http_err from exc
        except (URLError, TimeoutError) as exc:
            last_err = MoltAlphaHttpError(
                f"Network or timeout error for {url}: {exc}",
                status=0,
                code="NETWORK_OR_TIMEOUT_ERROR",
                url=url,
            )
            if attempt < bounded_retries and not isinstance(exc, TimeoutError):
                time.sleep(retry_delay * (attempt + 1))
                continue
            raise last_err from exc

        trimmed = raw_text.strip()
        if "text/html" in content_type or trimmed.lower().startswith("<!doctype html") or trimmed.lower().startswith("<html"):
            raise MoltAlphaHttpError(
                f"Unexpected text/html SPA fallback response instead of application/json from {url}",
                status=status_code,
                code="INVALID_CONTENT_TYPE_HTML",
                url=url,
            )

        try:
            return json.loads(raw_text)
        except Exception as parse_exc:
            raise MoltAlphaHttpError(
                f"Malformed JSON response from {url}: {parse_exc}",
                status=status_code,
                code="INVALID_JSON_RESPONSE",
                url=url,
            ) from parse_exc

    if last_err:
        raise last_err
    raise MoltAlphaHttpError(f"Request failed for {url}", url=url)
