"""
MoltALPHA Public Python SDK (stdlib-only, zero third-party runtime dependencies).
"""

import os
from typing import Any

from .http_client import DEFAULT_API_GATEWAY_URL, DEFAULT_WWW_BASE_URL, MoltAlphaHttpError
from .witness import (
    WITNESS_SCOPE_NOTE,
    WitnessClient,
    canonicalize_json_rfc8785,
    fetch_public_keys,
    fetch_witness,
    verify_with_registry,
    verify_witness,
    verify_witness_signature,
)
from .market import (
    MarketClient,
    get_forecasts,
    get_market_candles,
    get_market_intelligence,
)
from .sentinel import (
    SentinelClient,
    get_agent_profile,
    get_feed,
    get_live_anomalies,
    get_pool_history,
    get_pool_observations,
    get_pool_risk,
    get_public_key,
)
from .payments import (
    CANONICAL_NANO_TREASURY,
    CANONICAL_SOLANA_TREASURY,
    CANONICAL_USDC_MINT,
    PaymentsClient,
    build_solana_pay_url,
    claim_credential,
    create_invoice,
    decimal_to_raw_units,
    from_raw_units,
    get_config,
    get_invoice,
    get_transaction_status,
    raw_units_to_decimal,
    reconcile_payment,
    sign_webhook_payload,
    to_raw_units,
    validate_merchant_wallet,
    verify_nano,
    verify_solana,
    verify_webhook_signature,
)


class MoltAlphaClient:
    """
    Unified MoltAlpha Developer SDK Client (Python 3.10+).
    Provides access to non-custodial Solana & Nano payments (`client.payments`),
    cryptographic witness verification (`client.witness`), market data (`client.market`),
    and Sentinel DEX risk intelligence (`client.sentinel`).
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str = DEFAULT_API_GATEWAY_URL,
        web_base_url: str = DEFAULT_WWW_BASE_URL,
        merchant_wallet: str | None = None,
        network: str = "solana",
        **kwargs: Any,
    ) -> None:
        resolved_key = api_key if api_key is not None else os.environ.get("MOLTALPHA_API_KEY")
        norm_network = str(network or "solana").strip().lower()
        if merchant_wallet:
            check = validate_merchant_wallet(merchant_wallet, norm_network)
            if not check["valid"]:
                raise ValueError(f"Invalid merchant_wallet configuration: {check['reason']}")

        self.api_key = resolved_key
        self.base_url = str(base_url or DEFAULT_API_GATEWAY_URL).rstrip("/")
        self.web_base_url = str(web_base_url or DEFAULT_WWW_BASE_URL).rstrip("/")
        self.merchant_wallet = merchant_wallet
        self.network = norm_network

        common_opts = dict(kwargs)
        if resolved_key:
            common_opts["api_key"] = resolved_key

        self.payments = PaymentsClient(base_url=self.base_url, **common_opts)
        self.witness = WitnessClient(base_url=self.base_url, **common_opts)
        self.market = MarketClient(base_url=self.web_base_url, **common_opts)
        self.sentinel = SentinelClient(base_url=self.base_url, **common_opts)


MoltAlpha = MoltAlphaClient
MoltAlphaApiError = MoltAlphaHttpError

__all__ = [
    "CANONICAL_NANO_TREASURY",
    "CANONICAL_SOLANA_TREASURY",
    "CANONICAL_USDC_MINT",
    "WITNESS_SCOPE_NOTE",
    "MarketClient",
    "MoltAlpha",
    "MoltAlphaClient",
    "PaymentsClient",
    "SentinelClient",
    "WitnessClient",
    "build_solana_pay_url",
    "canonicalize_json_rfc8785",
    "claim_credential",
    "create_invoice",
    "decimal_to_raw_units",
    "fetch_public_keys",
    "fetch_witness",
    "from_raw_units",
    "get_agent_profile",
    "get_config",
    "get_feed",
    "get_forecasts",
    "get_invoice",
    "get_live_anomalies",
    "get_market_candles",
    "get_market_intelligence",
    "get_pool_history",
    "get_pool_observations",
    "get_pool_risk",
    "get_public_key",
    "get_transaction_status",
    "raw_units_to_decimal",
    "reconcile_payment",
    "sign_webhook_payload",
    "to_raw_units",
    "validate_merchant_wallet",
    "verify_nano",
    "verify_solana",
    "verify_webhook_signature",
    "verify_with_registry",
    "verify_witness",
    "verify_witness_signature",
]
