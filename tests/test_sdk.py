"""
Offline unit and contract tests for the MoltALPHA Public Python SDK (stdlib-only).
"""

from decimal import Decimal
import hashlib
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "sdk" / "python"))

from moltalpha_sdk import (  # noqa: E402
    CANONICAL_NANO_TREASURY,
    CANONICAL_SOLANA_TREASURY,
    CANONICAL_USDC_MINT,
    MarketClient,
    MoltAlphaClient,
    SentinelClient,
    WitnessClient,
    build_solana_pay_url,
    canonicalize_json_rfc8785,
    decimal_to_raw_units,
    fetch_witness,
    raw_units_to_decimal,
    sign_webhook_payload,
    validate_merchant_wallet,
    verify_webhook_signature,
    verify_with_registry,
    verify_witness_signature,
)
from moltalpha_sdk._ed25519 import BASE_POINT, L, P, _scalar_mult  # noqa: E402
from moltalpha_sdk.market import sanitize_market_intelligence  # noqa: E402


def _compress_point(pt: tuple[int, int, int, int]) -> bytes:
    x, y, z, _ = pt
    z_inv = pow(z, P - 2, P)
    x_aff = (x * z_inv) % P
    y_aff = (y * z_inv) % P
    return (y_aff | ((x_aff & 1) << 255)).to_bytes(32, "little")


def _sign_ed25519_test(seed32: bytes, msg: bytes) -> tuple[str, str]:
    h = hashlib.sha512(seed32).digest()
    a = int.from_bytes(h[:32], "little")
    a &= (1 << 254) - 8
    a |= 1 << 254
    prefix = h[32:]
    pub32 = _compress_point(_scalar_mult(a, BASE_POINT))
    r = int.from_bytes(hashlib.sha512(prefix + msg).digest(), "little") % L
    r_bytes = _compress_point(_scalar_mult(r, BASE_POINT))
    k = int.from_bytes(hashlib.sha512(r_bytes + pub32 + msg).digest(), "little") % L
    s = (r + k * a) % L
    sig_hex = (r_bytes + s.to_bytes(32, "little")).hex()
    spki_hex = "302a300506032b6570032100" + pub32.hex()
    return spki_hex, sig_hex


class TestMoltAlphaPythonSdk(unittest.TestCase):
    def test_rfc8785_canonicalization_and_pure_python_ed25519(self):
        payload = {"b": 2, "a": 1}
        canon = canonicalize_json_rfc8785(payload)
        self.assertEqual(canon, '{"a":1,"b":2}')

        spki_hex, sig_hex = _sign_ed25519_test(b"\x11" * 32, canon.encode("utf-8"))
        ok = verify_witness_signature(
            payload=payload,
            signature=f"ed25519:{sig_hex}",
            public_key_spki_hex=spki_hex,
            expected_payload_sha256=hashlib.sha256(canon.encode("utf-8")).hexdigest(),
            algorithm="Ed25519",
        )
        self.assertTrue(ok["valid"])
        self.assertFalse(ok["verification_scope"]["guarantees_on_chain_finality"])

        bad = verify_witness_signature(
            payload=payload,
            signature="00" * 64,
            public_key_spki_hex=spki_hex,
            algorithm="Ed25519",
        )
        self.assertFalse(bad["valid"])

        bad_digest = verify_witness_signature(
            payload=payload,
            signature=sig_hex,
            public_key_spki_hex=spki_hex,
            expected_payload_sha256="0" * 64,
        )
        self.assertFalse(bad_digest["valid"])

        bad_fp = verify_witness_signature(
            payload=payload,
            signature=sig_hex,
            public_key_spki_hex=spki_hex,
            expected_key_fingerprint_sha256="f" * 64,
        )
        self.assertFalse(bad_fp["valid"])

        bad_alg = verify_witness_signature(
            payload=payload,
            signature=sig_hex,
            public_key_spki_hex=spki_hex,
            algorithm="RSA",
        )
        self.assertFalse(bad_alg["valid"])

    def test_witness_registry_lifecycle_and_path_traversal(self):
        with self.assertRaises(ValueError):
            fetch_witness("../admin")

        payload = {"slot": 42}
        canon = canonicalize_json_rfc8785(payload)
        spki_hex, sig_hex = _sign_ed25519_test(b"\x22" * 32, canon.encode("utf-8"))
        fp = hashlib.sha256(bytes.fromhex(spki_hex)).hexdigest()

        expired_reg = {
            "active_key_id": "k1",
            "public_keys": {
                "k1": {
                    "algorithm": "Ed25519",
                    "public_key_spki_hex": spki_hex,
                    "fingerprint_sha256": fp,
                    "status": "ACTIVE",
                    "valid_from": "2020-01-01T00:00:00Z",
                    "valid_until": "2021-01-01T00:00:00Z",
                }
            },
        }
        with patch("moltalpha_sdk.witness.fetch_public_keys", return_value=expired_reg):
            res_exp = verify_with_registry(payload, sig_hex, key_id="k1")
            self.assertFalse(res_exp["valid"])
            self.assertIn("expired", res_exp["reason"].lower())

        retired_reg = {
            "active_key_id": "k1",
            "public_keys": {
                "k1": {
                    "algorithm": "Ed25519",
                    "public_key_spki_hex": spki_hex,
                    "fingerprint_sha256": fp,
                    "status": "ACTIVE",
                    "retired_at": "2025-01-01T00:00:00Z",
                }
            },
        }
        with patch("moltalpha_sdk.witness.fetch_public_keys", return_value=retired_reg):
            res_ret = verify_with_registry(payload, sig_hex, key_id="k1")
            self.assertFalse(res_ret["valid"])

    def test_market_intelligence_strips_simulated_demo_fallback_and_validates_candles(self):
        cleaned = sanitize_market_intelligence(
            {
                "ok": True,
                "timestamp": "2026-11-19T20:00:00Z",
                "tokens": {
                    "SOL": {"symbol": "SOL", "priceUsd": 142.35, "simulatedDemoFallback": {"priceUsd": 180.0}},
                    "JUP": {"symbol": "JUP", "priceUsd": None, "simulatedDemoFallback": {"priceUsd": 1.1}},
                },
            }
        )
        self.assertNotIn("simulatedDemoFallback", cleaned["tokens"]["SOL"])
        self.assertIsNone(cleaned["tokens"]["JUP"]["priceUsd"])
        self.assertNotIn("simulatedDemoFallback", cleaned["tokens"]["JUP"])

        market = MarketClient()
        with self.assertRaises(ValueError):
            market.get_market_candles(pair="")
        with self.assertRaises(ValueError):
            market.get_market_candles(granularity=0)

    def test_exact_integer_payment_conversions(self):
        self.assertEqual(decimal_to_raw_units("1.5", "SOL"), 1_500_000_000)
        self.assertEqual(decimal_to_raw_units("1.25", "USDC"), 1_250_000)
        self.assertEqual(decimal_to_raw_units("50", "XNO"), 50 * (10**30))
        self.assertEqual(raw_units_to_decimal(1_500_000_000, "SOL"), "1.5")
        self.assertEqual(CANONICAL_SOLANA_TREASURY, "BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx")
        self.assertEqual(
            CANONICAL_NANO_TREASURY,
            "nano_1s5ce5k7bj74sp31m3opq8xwx44stc5dgw6w8uajyg61xjg9wiaae4uby6pu",
        )
        with self.assertRaises(ValueError):
            decimal_to_raw_units(0.1, "USDC")

    def test_sentinel_rejects_empty_pool_address(self):
        client = SentinelClient()
        with self.assertRaises(ValueError):
            client.get_pool_history("")
        with self.assertRaises(ValueError):
            client.get_pool_risk("../secret")

    def test_phase_c_and_d_wallet_validation_solana_pay_webhooks_and_checkout(self):
        sol_ok = validate_merchant_wallet(CANONICAL_SOLANA_TREASURY, "solana")
        self.assertTrue(sol_ok["valid"])
        nano_ok = validate_merchant_wallet(CANONICAL_NANO_TREASURY, "nano")
        self.assertTrue(nano_ok["valid"])
        mint_rej = validate_merchant_wallet(CANONICAL_USDC_MINT, "solana")
        self.assertFalse(mint_rej["valid"])
        self.assertEqual(mint_rej["code"], "MINT_ADDRESS_NOT_WALLET")

        with self.assertRaises(ValueError):
            MoltAlphaClient(merchant_wallet=CANONICAL_USDC_MINT, network="solana")

        uri = build_solana_pay_url(
            recipient=CANONICAL_SOLANA_TREASURY,
            amount=Decimal("10.00"),
            asset="USDC",
            reference="4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi",
            label="MoltAlpha",
        )
        self.assertIn(f"solana:{CANONICAL_SOLANA_TREASURY}?", uri)
        self.assertIn("amount=10", uri)
        self.assertIn(f"spl-token={CANONICAL_USDC_MINT}", uri)

        secret = "whsec_python_unit_test_secret_0123456789"
        payload = '{"amount_raw":1000000,"event_id":"evt_py_1","invoice_id":"inv_py_1"}'
        sig_header = sign_webhook_payload(payload, secret, timestamp_seconds=1795125000)

        ok_res = verify_webhook_signature(
            payload, sig_header, secret, tolerance_seconds=300, now_seconds=1795125100
        )
        self.assertTrue(ok_res["valid"])
        self.assertEqual(ok_res["code"], "OK")

        exp_res = verify_webhook_signature(
            payload, sig_header, secret, tolerance_seconds=300, now_seconds=1795126000
        )
        self.assertFalse(exp_res["valid"])
        self.assertEqual(exp_res["code"], "WEBHOOK_TIMESTAMP_EXPIRED")

        bad_res = verify_webhook_signature(
            payload.replace("1000000", "9999999"),
            sig_header,
            secret,
            tolerance_seconds=300,
            now_seconds=1795125100,
        )
        self.assertFalse(bad_res["valid"])
        self.assertEqual(bad_res["code"], "WEBHOOK_SIGNATURE_MISMATCH")

        sys.path.insert(0, str(REPO_ROOT / "examples" / "python-checkout"))
        import checkout as py_checkout  # noqa: E402

        res = py_checkout.run_checkout(live=False)
        self.assertEqual(res["verification"]["status"], "newly_minted")
        self.assertEqual(res["final_status"]["status"], "fulfilled")


if __name__ == "__main__":
    unittest.main()
