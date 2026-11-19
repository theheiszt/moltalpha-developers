"""
Example 2 — Python Solana Payment Integration
Demonstrates merchant wallet validation, exact Decimal monetary conversion,
invoice creation, Solana Pay URI construction, and server-side verification.
"""

from decimal import Decimal
import os
from pathlib import Path
import sys
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_SDK_DIR = REPO_ROOT / "sdk" / "python"
if str(PYTHON_SDK_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_SDK_DIR))

from moltalpha_sdk import (  # noqa: E402
    CANONICAL_SOLANA_TREASURY,
    CANONICAL_USDC_MINT,
    MoltAlphaClient,
    build_solana_pay_url,
    decimal_to_raw_units,
    validate_merchant_wallet,
)

DEMO_REFERENCE = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi"
DEMO_TX_SIG = (
    "5UfDuX7WXY8Qp9LkM2nN4pQrStUvWxYz123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwx"
)


def _demo_opener(req: Any, timeout: float = 10.0) -> Any:
    url = req.full_url
    method = req.get_method()

    class _Resp:
        def __init__(self, status: int, body: str) -> None:
            self.status = status
            self._body = body.encode("utf-8")
            self.headers = {"Content-Type": "application/json"}

        def read(self) -> bytes:
            return self._body

        def __enter__(self) -> "_Resp":
            return self

        def __exit__(self, *args: Any) -> None:
            return None

    if method == "POST" and url.endswith("/v1/payments/invoice"):
        uri = build_solana_pay_url(
            recipient=CANONICAL_SOLANA_TREASURY,
            amount=Decimal("1.00"),
            asset="USDC",
            reference=DEMO_REFERENCE,
            label="MoltAlpha",
        )
        return _Resp(
            200,
            (
                '{"success":true,"invoice_id":"inv_py_demo_001",'
                f'"reference":"{DEMO_REFERENCE}","target_tier":"tier_starter",'
                '"credits":50,"asset":"USDC","amount_raw":1000000,'
                '"amount_formatted":"1.00 USDC",'
                f'"treasury_wallet":"{CANONICAL_SOLANA_TREASURY}",'
                '"cluster":"mainnet-beta",'
                f'"solana_pay_url":"{uri}",'
                '"claim_secret":"sec_py_demo_secret_9876543210",'
                '"created_at":"2026-11-19T21:00:00Z","expires_at":"2026-11-19T21:30:00Z"}'
            ),
        )

    if method == "POST" and url.endswith("/v1/payments/verify-solana"):
        return _Resp(
            200,
            (
                '{"success":true,"status":"newly_minted",'
                '"message":"Payment verified on-chain.","key_prefix":"mk_py_demo",'
                '"credits":50,"tier":"tier_starter","invoice_id":"inv_py_demo_001"}'
            ),
        )

    if method == "GET" and "/v1/payments/invoice/" in url:
        return _Resp(
            200,
            (
                '{"success":true,"invoice_id":"inv_py_demo_001",'
                f'"reference":"{DEMO_REFERENCE}","status":"fulfilled","rail":"solana",'
                '"tier":"tier_starter","credits":50,"asset":"USDC","amount_raw":1000000,'
                f'"recipient":"{CANONICAL_SOLANA_TREASURY}","cluster":"mainnet-beta",'
                f'"tx_signature":"{DEMO_TX_SIG}",'
                '"created_at":"2026-11-19T21:00:00Z","expires_at":"2026-11-19T21:30:00Z",'
                '"fulfilled_at":"2026-11-19T21:01:05Z"}'
            ),
        )

    raise RuntimeError(f"Unhandled demo URL: {method} {url}")


def run_checkout(live: bool = False) -> dict[str, Any]:
    merchant_wallet = os.environ.get("MOLTALPHA_MERCHANT_WALLET", CANONICAL_SOLANA_TREASURY)
    wallet_check = validate_merchant_wallet(merchant_wallet, "solana")
    if not wallet_check["valid"]:
        raise ValueError(f"Invalid merchant wallet: {wallet_check['reason']}")

    mint_check = validate_merchant_wallet(CANONICAL_USDC_MINT, "solana")
    if mint_check["valid"]:
        raise AssertionError("Safety invariant violated: USDC mint must be rejected as a wallet")
    print(f"[1/4] Merchant wallet verified: {wallet_check['address']} ({wallet_check['rail']})")

    raw_units = decimal_to_raw_units(Decimal("10.00"), "USDC")
    print(f"[2/4] Exact Decimal check: 10.00 USDC = {raw_units} raw micro-units")

    client_kwargs: dict[str, Any] = {
        "base_url": os.environ.get("MOLTALPHA_BASE_URL", "https://api.moltalpha.dev"),
        "merchant_wallet": merchant_wallet,
        "network": "solana",
    }
    if not live:
        client_kwargs["opener"] = _demo_opener

    client = MoltAlphaClient(**client_kwargs)
    invoice = client.payments.create(
        tier="tier_starter",
        currency="USDC",
        network="solana",
        cluster="mainnet-beta",
        idempotency_key="py_checkout_starter_001",
    )
    print(
        f"[3/4] Payment invoice created: {invoice['invoice_id']} | "
        f"{invoice['amount_formatted']} -> {invoice['treasury_wallet']}"
    )

    if live:
        status = client.payments.get_status(invoice["invoice_id"])
        print(f"[4/4] Live invoice status: {status['status']}")
        return {"invoice": invoice, "status": status}

    verification = client.payments.verify_solana(
        {
            "invoice_id": invoice["invoice_id"],
            "transaction_signature": DEMO_TX_SIG,
            "claim_secret": invoice["claim_secret"],
        }
    )
    final_status = client.payments.get_status(invoice["invoice_id"])
    print(
        f"[4/4] Settlement verified: status={verification['status']} | "
        f"tier={verification['tier']} | credits={verification['credits']} | "
        f"invoice_status={final_status['status']}"
    )
    print("PYTHON_CHECKOUT_OK")
    return {"invoice": invoice, "verification": verification, "final_status": final_status}


if __name__ == "__main__":
    is_live = "--live" in sys.argv[1:]
    run_checkout(live=is_live)
